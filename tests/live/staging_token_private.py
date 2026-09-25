#!/usr/bin/env python3
"""Deploy the private v3 PSY-20 profile and exercise a two-user note round trip."""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from staging_nft_flow import cli_call, run, save, wallet_env
from staging_token_flow import public_cli
from staging_token_supply import state_felt


ROOT = Path(__file__).resolve().parents[2]


def secret_cli(command, wallet, rpc_config, directory, result_file):
    env = wallet_env(wallet, rpc_config)
    result = subprocess.run(command, cwd=directory, env=env, capture_output=True,
                            text=True, timeout=1200)
    if result.returncode:
        log_path = directory / "private-flow-error.log"
        detail = (result.stdout + "\n" + result.stderr).replace(wallet["private_key"], "[redacted]")
        log_path.write_text(detail)
        log_path.chmod(0o600)
        raise RuntimeError(f"{command[1]} failed (exit {result.returncode}); inspect {log_path}")
    return json.loads(result_file.read_text())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--rpc-config", required=True, type=Path)
    parser.add_argument("--phase", choices=("deploy", "flow"), required=True)
    parser.add_argument("--run-name", default="token-private-v3")
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    rpc_config = args.rpc_config.resolve(strict=True)
    if json.loads(rpc_config.read_text()).get("defaultNetwork") != "sepolia":
        raise SystemExit("RPC_CONFIG must select sepolia staging")
    cli = os.environ.get("PSY_TEST_CLI")
    if not cli or not Path(cli).is_file():
        raise SystemExit("PSY_TEST_CLI must point to the private-note v3 CLI")
    wallets = json.loads((directory / "wallets.json").read_text())["users"]
    if len(wallets) != 2 or wallets[0]["user_id"] // 1048576 == wallets[1]["user_id"] // 1048576:
        raise SystemExit("Two registered users in distinct realms are required")
    issuer, recipient = (wallet["user_id"] for wallet in wallets)
    if not args.run_name.startswith("token-private-v3") or "/" in args.run_name:
        raise SystemExit("--run-name must start with token-private-v3 and contain no slash")
    project = directory / args.run_name
    evidence_path = directory / f"{args.run_name}-evidence.json"
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else {
        "network": "sepolia staging", "users": [issuer, recipient],
        "source": "token/src/main.private.psy.rs", "transactions": [],
    }
    if not project.exists():
        (project / "src").mkdir(parents=True)
        (project / "scripts").mkdir()
        for name in ("Dargo.toml", "package.json"):
            shutil.copy2(ROOT / "token" / name, project / name)
        shutil.copy2(ROOT / "token/src/main.psy", project / "src/main.psy")
        shutil.copy2(ROOT / "token/src/main.private.psy.rs", project / "src/main.psy.rs")
        for name in ("configure_issuer.mjs", "deploy_checked.mjs", "build_v3.mjs", "deploy_v3_checked.mjs"):
            shutil.copy2(ROOT / "token/scripts" / name, project / "scripts" / name)

    if args.phase == "deploy":
        if "contract_id" not in evidence:
            run(["node", "scripts/configure_issuer.mjs", "--issuer", str(issuer)],
                project, wallet_env(wallets[0], rpc_config), timeout=30)
            run(["node", "scripts/deploy_v3_checked.mjs"], project,
                wallet_env(wallets[0], rpc_config))
            deployment = json.loads((project / ".psy-deploy-v3.json").read_text())
            if not isinstance(deployment.get("contract_id"), int):
                raise RuntimeError(f"Deployment submitted but ID unresolved: {deployment.get('tx_hash')}")
            abi = json.loads((project / "target/v3/abi.json").read_text())["contract"]
            artifact = json.loads((project / "target/v3/compilation_artifact.json").read_text())
            names = {method["name"] for method in abi["methods"]}
            root_offset = next(field["offset"] for field in abi["state"] if field["name"] == "note_root")
            if not {"private_transfer", "private_claim"}.issubset(names) or root_offset != 33554436 or artifact["state_tree_height"] != 32:
                raise RuntimeError("Deployed artifact does not have the canonical private note ABI/layout")
            evidence["contract_id"] = deployment["contract_id"]
            evidence["deployment_tx_hash"] = deployment["tx_hash"]
            evidence["state_tree_height"] = 32
            evidence["note_root_leaf"] = 8388609
            save(evidence_path, evidence)
            print(f"Deployed private-v3 contract {evidence['contract_id']}", flush=True)
        return

    contract_id = evidence.get("contract_id")
    if not isinstance(contract_id, int):
        raise SystemExit("Run --phase deploy first")
    public_flow = [("set_metadata", [0x505359, 9]), ("mint", [1000])]
    for index in range(min(len(evidence["transactions"]), len(public_flow)), len(public_flow)):
        method, inputs = public_flow[index]
        result = cli_call(method, inputs, contract_id, wallets[0], rpc_config, directory)
        if result.get("status") != "confirmed":
            raise RuntimeError(f"{method} not confirmed")
        evidence["transactions"].append({"method": method, "user_id": issuer,
            "transaction_hash": result["transaction_hash"], "checkpoint": result["confirmed_checkpoint"]})
        save(evidence_path, evidence)

    proof_file = directory / f"{args.run_name}-note-proof.json"
    if not any(tx["method"] == "private_transfer" for tx in evidence["transactions"]):
        abi = json.loads((project / "target/v3/abi.json").read_text())["contract"]
        note_count_offset = next(field["offset"] for field in abi["state"] if field["name"] == "note_count")
        checkpoint = public_cli(["get-latest-block-state"], rpc_config, directory)["block_state"]["checkpoint_id"]
        note_count = state_felt(rpc_config, directory, checkpoint, issuer, contract_id, 32, note_count_offset)["felt"]
        if note_count != 0:
            raise RuntimeError("Unrecorded private transfer exists; use a fresh --run-name to avoid another debit")
        owner_result = directory / "note-owner-result.json"
        owner = secret_cli([cli, "derive-note-owner", "--rpc-config", str(rpc_config),
            "--private-key", wallets[1]["private_key"], "--result-file", str(owner_result)],
            wallets[1], rpc_config, directory, owner_result)["note_owner"]
        owner_result.unlink(missing_ok=True)
        transfer_result = directory / "private-transfer-result.json"
        result = secret_cli([cli, "private-transfer", "--rpc-config", str(rpc_config),
            "--private-key", wallets[0]["private_key"], "--contract-id", str(contract_id),
            "--receiver", owner, "--amount", "100", "--note-root-slot", "8388609",
            "--output", str(proof_file), "--result-file", str(transfer_result)],
            wallets[0], rpc_config, directory, transfer_result)
        transfer_result.unlink(missing_ok=True)
        if result.get("status") != "confirmed" or not proof_file.exists():
            raise RuntimeError("private transfer did not confirm with a note proof")
        evidence["transactions"].append({"method": "private_transfer", "user_id": issuer,
            "transaction_hash": result["transaction_hash"], "checkpoint": result["confirmed_checkpoint"]})
        save(evidence_path, evidence)

    if not any(tx["method"] == "private_claim" for tx in evidence["transactions"]):
        claim_result = directory / "private-claim-result.json"
        result = secret_cli([cli, "private-claim", "--rpc-config", str(rpc_config),
            "--private-key", wallets[1]["private_key"], "--contract-id", str(contract_id),
            "--note-proof", str(proof_file), "--result-file", str(claim_result)],
            wallets[1], rpc_config, directory, claim_result)
        claim_result.unlink(missing_ok=True)
        if result.get("status") != "confirmed":
            raise RuntimeError("private claim not confirmed")
        evidence["transactions"].append({"method": "private_claim", "user_id": recipient,
            "transaction_hash": result["transaction_hash"], "checkpoint": result["confirmed_checkpoint"]})
        save(evidence_path, evidence)

    abi = json.loads((project / "target/v3/abi.json").read_text())["contract"]
    fields = {field["name"]: field["offset"] for field in abi["state"]}
    checkpoint = public_cli(["get-latest-block-state"], rpc_config, directory)["block_state"]["checkpoint_id"]
    proofs = {
        "issuer_balance": state_felt(rpc_config, directory, checkpoint, issuer, contract_id, 32, fields["balance"]),
        "recipient_balance": state_felt(rpc_config, directory, checkpoint, recipient, contract_id, 32, fields["balance"]),
        "issuer_note_count": state_felt(rpc_config, directory, checkpoint, issuer, contract_id, 32, fields["note_count"]),
        "total_supply": state_felt(rpc_config, directory, checkpoint, issuer, contract_id, 32, fields["total_supply"]),
    }
    values = {name: proof["felt"] for name, proof in proofs.items()}
    assert values == {"issuer_balance": 900, "recipient_balance": 100,
                      "issuer_note_count": 1, "total_supply": 1000}, values
    evidence["checkpoint"] = checkpoint
    evidence["state"] = values
    evidence["state_proofs"] = proofs
    save(evidence_path, evidence)
    print(f"Verified private round trip on contract {contract_id}: {values}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
