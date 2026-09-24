#!/usr/bin/env python3
"""Deploy and exercise cooperative PSY-20 delegation with two staging users."""

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

from staging_nft_flow import cli_call, run, save, wallet_env


ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--rpc-config", required=True, type=Path)
    parser.add_argument("--phase", choices=("deploy", "flow"), required=True)
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    rpc_config = args.rpc_config.resolve(strict=True)
    if json.loads(rpc_config.read_text()).get("defaultNetwork") != "sepolia":
        raise SystemExit("RPC_CONFIG must select sepolia staging")
    wallets = json.loads((directory / "wallets.json").read_text())["users"]
    if len(wallets) != 2 or wallets[0]["user_id"] // 1048576 == wallets[1]["user_id"] // 1048576:
        raise SystemExit("Two registered users from distinct realms are required")
    user_ids = [wallet["user_id"] for wallet in wallets]
    evidence_path = directory / "token-delegation-evidence.json"
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else {
        "network": "sepolia staging", "users": user_ids, "transactions": [],
        "source": "token/src/main.psy.rs", "revocation_rule": "spender close required before refund",
    }

    if args.phase == "deploy":
        project = directory / "token-delegation"
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
            run(["node", "scripts/configure_issuer.mjs", "--issuer", str(user_ids[0])],
                project, wallet_env(wallets[0], rpc_config), timeout=30)
            print(f"Deploying PSY-20 v3 for issuer {user_ids[0]}", flush=True)
            run(["node", "scripts/deploy_checked.mjs"], project,
                wallet_env(wallets[0], rpc_config))
            deployment = json.loads((project / ".psy-deploy-v3.json").read_text())
            if not isinstance(deployment.get("contract_id"), int):
                raise RuntimeError(f"Deployment submitted but ID unresolved: {deployment.get('tx_hash')}")
            evidence["contract_id"] = deployment["contract_id"]
            evidence["deployment_tx_hash"] = deployment["tx_hash"]
            save(evidence_path, evidence)
            print(f"Deployed contract {evidence['contract_id']}: {deployment['tx_hash']}", flush=True)
        return

    contract_id = evidence.get("contract_id")
    if not isinstance(contract_id, int):
        raise SystemExit("Run --phase deploy first")
    flow = [
        ("set_metadata", [0x505359, 9], 0),
        ("mint", [10000], 0),
        ("open_delegation_channel", [0, user_ids[1], 1000], 0),
        ("spend_delegation", [user_ids[0], 0, 300, user_ids[0]], 1),
        ("claim", [user_ids[1]], 0),
        ("request_revoke_delegation", [0], 0),
        ("close_delegation_channel", [user_ids[0], 0, 1], 1),
    ]
    for index in range(len(evidence["transactions"]), len(flow)):
        method, inputs, wallet_index = flow[index]
        print(f"Step {index + 1}/{len(flow)}: user {user_ids[wallet_index]} {method}", flush=True)
        result = cli_call(method, inputs, contract_id, wallets[wallet_index], rpc_config, directory)
        if result.get("status") != "confirmed":
            raise RuntimeError(f"{method} was not confirmed")
        evidence["transactions"].append({
            "method": method, "user_id": user_ids[wallet_index], "inputs": inputs,
            "transaction_hash": result.get("transaction_hash"),
            "checkpoint": result.get("confirmed_checkpoint"),
        })
        save(evidence_path, evidence)

    if "post_close_spend_rejection" not in evidence:
        try:
            cli_call("spend_delegation", [user_ids[0], 0, 1, user_ids[0]],
                     contract_id, wallets[1], rpc_config, directory)
        except RuntimeError as error:
            reason = str(error).lower()
            if "closed" in reason:
                evidence["post_close_spend_rejection"] = "spender-local closed assertion"
            elif "channel is not active" in reason:
                evidence["post_close_spend_rejection"] = "owner channel is not active assertion"
            elif "cutoff checkpoint passed" in reason:
                evidence["post_close_spend_rejection"] = "legacy checkpoint cutoff assertion"
            else:
                raise RuntimeError(f"Post-close spend failed for an unexpected reason: {error}") from error
            save(evidence_path, evidence)
            print(f"Post-close spend rejected: {evidence['post_close_spend_rejection']}", flush=True)
        else:
            raise RuntimeError("Post-close spend unexpectedly succeeded")

    if not any(tx["method"] == "finalize_revoke_delegation" for tx in evidence["transactions"]):
        print(f"Finalizing owner refund for user {user_ids[0]}", flush=True)
        result = cli_call("finalize_revoke_delegation", [0, user_ids[1]],
                          contract_id, wallets[0], rpc_config, directory)
        if result.get("status") != "confirmed":
            raise RuntimeError("Owner refund was not confirmed")
        evidence["transactions"].append({
            "method": "finalize_revoke_delegation", "user_id": user_ids[0],
            "inputs": [0, user_ids[1]], "transaction_hash": result.get("transaction_hash"),
            "checkpoint": result.get("confirmed_checkpoint"),
        })
        save(evidence_path, evidence)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
