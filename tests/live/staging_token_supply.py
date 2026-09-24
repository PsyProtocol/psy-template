#!/usr/bin/env python3
"""Exercise PSY-20 issuer controls and two-user burn settlement on staging."""

import argparse
import json
import shutil
from pathlib import Path

from staging_nft_flow import cli_call, run, save, wallet_env
from staging_token_flow import public_cli


ROOT = Path(__file__).resolve().parents[2]


def state_felt(rpc_config, directory, checkpoint, user_id, contract_id, height, offset):
    result = public_cli([
        "get-user-contract-state-tree-merkle-proof",
        "--checkpoint-id", str(checkpoint), "--user-id", str(user_id),
        "--contract-id", str(contract_id), "--height", str(height),
        "--leaf-id", str(offset // 4),
    ], rpc_config, directory)["merkle_proof"]
    value = result["value"].removeprefix("0x")
    return {
        "felt": int(value[(3 - offset % 4) * 16:(4 - offset % 4) * 16], 16),
        "root": result["root"], "value": result["value"],
        "leaf_id": offset // 4, "offset": offset,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--rpc-config", required=True, type=Path)
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    rpc_config = args.rpc_config.resolve(strict=True)
    if json.loads(rpc_config.read_text()).get("defaultNetwork") != "sepolia":
        raise SystemExit("RPC_CONFIG must select sepolia staging")
    wallets = json.loads((directory / "wallets.json").read_text())["users"]
    if len(wallets) != 2 or wallets[0]["user_id"] // 1048576 == wallets[1]["user_id"] // 1048576:
        raise SystemExit("Two registered users from distinct realms are required")
    issuer, recipient = (wallet["user_id"] for wallet in wallets)
    project = directory / "token-supply"
    evidence_path = directory / "token-supply-evidence.json"
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else {
        "network": "sepolia staging", "users": [issuer, recipient],
        "source": "token/src/main.psy.rs", "transactions": [],
    }
    if not project.exists():
        (project / "src").mkdir(parents=True)
        (project / "scripts").mkdir()
        for name in ("Dargo.toml", "package.json"):
            shutil.copy2(ROOT / "token" / name, project / name)
        for name in ("main.psy", "main.psy.rs"):
            shutil.copy2(ROOT / "token/src" / name, project / "src" / name)
        for name in ("configure_issuer.mjs", "deploy_checked.mjs", "build_v3.mjs", "deploy_v3_checked.mjs"):
            shutil.copy2(ROOT / "token/scripts" / name, project / "scripts" / name)
    if "contract_id" not in evidence:
        run(["node", "scripts/configure_issuer.mjs", "--issuer", str(issuer)],
            project, wallet_env(wallets[0], rpc_config), timeout=30)
        env = wallet_env(wallets[0], rpc_config)
        env["PSY20_PUBLIC_ONLY"] = "1"
        run(["node", "scripts/deploy_checked.mjs"], project, env)
        deployment = json.loads((project / ".psy-deploy-v3.json").read_text())
        evidence["contract_id"] = deployment["contract_id"]
        evidence["deployment_tx_hash"] = deployment["tx_hash"]
        save(evidence_path, evidence)
    contract_id = evidence["contract_id"]
    flow = [
        ("set_metadata", [0x505359, 9], 0),
        ("set_extended_metadata", [0x50535920546F6B65, 0x6E, 0x68747470733A2F2F, 0x6578616D706C652E, 0x6F7267, 0, 0], 0),
        ("set_max_supply", [1000], 0),
        ("mint_to", [recipient, 600], 0),
        ("claim", [issuer], 1),
        ("burn", [200], 1),
        ("settle_burn", [recipient], 0),
    ]
    for index in range(len(evidence["transactions"]), len(flow)):
        method, inputs, wallet_index = flow[index]
        result = cli_call(method, inputs, contract_id, wallets[wallet_index], rpc_config, directory)
        if result.get("status") != "confirmed":
            raise RuntimeError(f"{method} was not confirmed")
        evidence["transactions"].append({
            "method": method, "user_id": wallets[wallet_index]["user_id"],
            "inputs": inputs, "transaction_hash": result.get("transaction_hash"),
            "checkpoint": result.get("confirmed_checkpoint"),
        })
        save(evidence_path, evidence)
    abi = json.loads((project / "target/v3/abi.json").read_text())["contract"]
    height = json.loads((project / "target/v3/compilation_artifact.json").read_text())["state_tree_height"]
    fields = {field["name"]: field["offset"] for field in abi["state"]}
    checkpoint = public_cli(["get-latest-block-state"], rpc_config, directory)["block_state"]["checkpoint_id"]
    proofs = {
        "total_minted": state_felt(rpc_config, directory, checkpoint, issuer, contract_id, height, fields["total_minted"]),
        "total_supply": state_felt(rpc_config, directory, checkpoint, issuer, contract_id, height, fields["total_supply"]),
        "max_supply": state_felt(rpc_config, directory, checkpoint, issuer, contract_id, height, fields["max_supply"]),
        "recipient_burn_requested": state_felt(rpc_config, directory, checkpoint, recipient, contract_id, height, fields["burn_requested"]),
        "recipient_burn_settled": state_felt(rpc_config, directory, checkpoint, issuer, contract_id, height, fields["burn_settled"] + recipient),
    }
    values = {name: proof["felt"] for name, proof in proofs.items()}
    assert values == {
        "total_minted": 600, "total_supply": 400, "max_supply": 1000,
        "recipient_burn_requested": 200, "recipient_burn_settled": 200,
    }, values
    evidence["checkpoint"] = checkpoint
    evidence["state"] = values
    evidence["state_proofs"] = proofs
    save(evidence_path, evidence)
    print(f"Verified contract {contract_id} at checkpoint {checkpoint}: {values}", flush=True)
    def expect_rejected(method, inputs, expected):
        for attempt in range(3):
            try:
                cli_call(method, inputs, contract_id, wallets[0], rpc_config, directory)
            except RuntimeError as error:
                reason = str(error)
                if expected in reason:
                    return
                if "Connection error" in reason or "is_timeout=true" in reason:
                    if attempt < 2:
                        continue
                raise
            raise AssertionError(f"{method} unexpectedly confirmed")
        raise AssertionError(f"{method} could not be verified after network retries")
    if not evidence.get("duplicate_settlement_rejected"):
        expect_rejected("settle_burn", [recipient], "no pending burn to settle")
        evidence["duplicate_settlement_rejected"] = True
        save(evidence_path, evidence)
    if not evidence.get("cap_excess_rejected"):
        expect_rejected("mint", [401], "max supply exceeded")
        evidence["cap_excess_rejected"] = True
        save(evidence_path, evidence)


if __name__ == "__main__":
    main()
