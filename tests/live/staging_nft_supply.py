#!/usr/bin/env python3
"""Verify NFT cap and cross-partition burn settlement on staging."""

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from staging_nft_flow import cli_call, run, save, wallet_env
from staging_token_flow import public_cli
from staging_token_supply import state_felt


ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--rpc-config", required=True, type=Path)
    parser.add_argument("--metadata-only", action="store_true",
                        help="Deploy the current artifact and verify collection text metadata")
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    rpc_config = args.rpc_config.resolve(strict=True)
    if json.loads(rpc_config.read_text()).get("defaultNetwork") != "sepolia":
        raise SystemExit("RPC_CONFIG must select sepolia staging")
    wallets = json.loads((directory / "wallets.json").read_text())["users"]
    if len(wallets) != 2 or wallets[0]["user_id"] // 1048576 == wallets[1]["user_id"] // 1048576:
        raise SystemExit("Two registered users in distinct realms are required")
    issuer, recipient = (wallet["user_id"] for wallet in wallets)
    project = directory / "nft-supply"
    evidence_path = directory / "nft-supply-evidence.json"
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else {
        "network": "sepolia staging", "users": [issuer, recipient],
        "source": "nft/src/main.psy.rs", "transactions": [],
    }
    if not project.exists():
        (project / "src").mkdir(parents=True)
        (project / "scripts").mkdir()
        for name in ("Dargo.toml", "package.json"):
            shutil.copy2(ROOT / "nft" / name, project / name)
        for name in ("main.psy", "main.psy.rs"):
            shutil.copy2(ROOT / "nft/src" / name, project / "src" / name)
        for name in ("configure_issuer.mjs", "deploy_checked.mjs", "build_v3.mjs", "deploy_v3_checked.mjs"):
            shutil.copy2(ROOT / "nft/scripts" / name, project / "scripts" / name)
    if "contract_id" not in evidence:
        run(["node", "scripts/configure_issuer.mjs", "--issuer", str(issuer)], project,
            wallet_env(wallets[0], rpc_config), timeout=30)
        run(["node", "scripts/deploy_checked.mjs"], project, wallet_env(wallets[0], rpc_config))
        deployment = json.loads((project / ".psy-deploy-v3.json").read_text())
        evidence["contract_id"] = deployment["contract_id"]
        evidence["deployment_tx_hash"] = deployment["tx_hash"]
        save(evidence_path, evidence)
    evidence.setdefault("source_sha256", hashlib.sha256((project / "src/main.psy.rs").read_bytes()).hexdigest())
    save(evidence_path, evidence)
    contract_id = evidence["contract_id"]
    flow = [
        ("set_collection_metadata", [0x505359, 11, 22, 33, 44], 0),
    ]
    if args.metadata_only:
        flow.append(("set_collection_details", [0x505359204E4654, 0, 0x697066733A2F2F] + [0] * 15, 0))
    else:
        flow.extend([
        ("set_max_supply", [2], 0),
        ("mint", [0, 1, 101, 102, 103, 104], 0),
        ("transfer", [0, recipient], 0),
        ("claim", [0, issuer], 1),
        ("burn", [0], 1),
        ("settle_burn", [recipient], 0),
        ])
    for index in range(len(evidence["transactions"]), len(flow)):
        method, inputs, wallet_index = flow[index]
        result = cli_call(method, inputs, contract_id, wallets[wallet_index], rpc_config, directory)
        if result.get("status") != "confirmed":
            raise RuntimeError(f"{method} did not confirm")
        evidence["transactions"].append({"method": method,
            "user_id": wallets[wallet_index]["user_id"],
            "transaction_hash": result["transaction_hash"],
            "checkpoint": result["confirmed_checkpoint"]})
        save(evidence_path, evidence)
    abi = json.loads((project / "target/v3/abi.json").read_text())["contract"]
    height = json.loads((project / "target/v3/compilation_artifact.json").read_text())["state_tree_height"]
    fields = {field["name"]: field["offset"] for field in abi["state"]}
    checkpoint = public_cli(["get-latest-block-state"], rpc_config, directory)["block_state"]["checkpoint_id"]
    if args.metadata_only:
        proofs = {
            "name_0": state_felt(rpc_config, directory, checkpoint, issuer, contract_id, height, fields["name"]),
            "base_uri_0": state_felt(rpc_config, directory, checkpoint, issuer, contract_id, height, fields["base_uri"]),
        }
        values = {name: proof["felt"] for name, proof in proofs.items()}
        assert values == {"name_0": 0x505359204E4654, "base_uri_0": 0x697066733A2F2F}, values
        evidence.update({"checkpoint": checkpoint, "state": values, "state_proofs": proofs})
        save(evidence_path, evidence)
        print(f"Verified NFT collection metadata on contract {contract_id}: {values}", flush=True)
        if not evidence.get("nonissuer_details_rejected"):
            try:
                cli_call("set_collection_details", [0] * 18, contract_id,
                         wallets[1], rpc_config, directory)
            except RuntimeError as error:
                if "only issuer can set collection details" not in str(error):
                    raise
                evidence["nonissuer_details_rejected"] = True
                save(evidence_path, evidence)
            else:
                raise AssertionError("non-issuer metadata update unexpectedly confirmed")
        return
    targets = {
        "total_minted": (issuer, fields["total_minted"]),
        "total_supply": (issuer, fields["total_supply"]),
        "max_supply": (issuer, fields["max_supply"]),
        "issuer_balance": (issuer, fields["balance"]),
        "recipient_balance": (recipient, fields["balance"]),
        "recipient_burn_requested": (recipient, fields["burn_requested"]),
        "recipient_burn_settled": (issuer, fields["burn_settled"] + recipient),
    }
    proofs = {name: state_felt(rpc_config, directory, checkpoint, user, contract_id, height, offset)
              for name, (user, offset) in targets.items()}
    values = {name: proof["felt"] for name, proof in proofs.items()}
    assert values == {"total_minted": 1, "total_supply": 0, "max_supply": 2,
                      "issuer_balance": 0, "recipient_balance": 0,
                      "recipient_burn_requested": 1, "recipient_burn_settled": 1}, values
    evidence.update({"checkpoint": checkpoint, "state": values, "state_proofs": proofs})
    save(evidence_path, evidence)
    print(f"Verified NFT supply and burn on contract {contract_id}: {values}", flush=True)
    if not evidence.get("duplicate_settlement_rejected"):
        try:
            cli_call("settle_burn", [recipient], contract_id, wallets[0], rpc_config, directory)
        except RuntimeError as error:
            if "no pending burn to settle" not in str(error):
                raise
            evidence["duplicate_settlement_rejected"] = True
            save(evidence_path, evidence)
        else:
            raise AssertionError("duplicate burn settlement unexpectedly confirmed")


if __name__ == "__main__":
    main()
