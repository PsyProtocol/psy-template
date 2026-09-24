#!/usr/bin/env python3
"""Verify a real cross-realm PSY transfer/claim round trip on staging."""

import argparse
import json
import os
import tempfile
from pathlib import Path

from staging_nft_flow import cli_call, run, save


def public_cli(command, rpc_config, directory):
    fd, path = tempfile.mkstemp(prefix="public-result-", suffix=".json", dir=directory)
    os.close(fd)
    result_file = Path(path)
    try:
        return run(
            [os.environ.get("PSY_TEST_READ_CLI", "psy_user_cli"), *command,
             "--rpc-config", str(rpc_config), "--result-file", str(result_file)],
            directory, os.environ, timeout=30, result_file=result_file,
        )
    finally:
        result_file.unlink(missing_ok=True)


def snapshot(users, rpc_config, directory):
    block = public_cli(["get-latest-block-state"], rpc_config, directory)
    checkpoint = block["block_state"]["checkpoint_id"]
    balances = {}
    for user_id in users:
        proof = public_cli([
            "get-user-contract-state-tree-merkle-proof",
            "--checkpoint-id", str(checkpoint), "--user-id", str(user_id),
            "--contract-id", "0", "--height", "32", "--leaf-id", "0",
        ], rpc_config, directory)
        proof = proof["merkle_proof"]
        balances[str(user_id)] = {
            "slot_hex": proof["value"],
            "balance_felt": int(proof["value"][-16:], 16),
            "state_root": proof["root"],
        }
    return {"checkpoint": checkpoint, "balances": balances}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--rpc-config", required=True, type=Path)
    parser.add_argument("--faucet-operator", required=True, type=int)
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    rpc_config = args.rpc_config.resolve(strict=True)
    if json.loads(rpc_config.read_text()).get("defaultNetwork") != "sepolia":
        raise SystemExit("RPC_CONFIG must select sepolia staging")
    wallets = json.loads((directory / "wallets.json").read_text())["users"]
    user_ids = [wallet["user_id"] for wallet in wallets]
    if user_ids[0] // 1048576 == user_ids[1] // 1048576:
        raise SystemExit("Test users must belong to different realms")
    evidence_path = directory / "token-flow-evidence.json"
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else {
        "network": "sepolia staging", "contract_id": 0, "users": user_ids,
        "faucet_operator": args.faucet_operator, "transactions": [], "snapshots": [],
    }
    if not evidence["snapshots"]:
        evidence["snapshots"].append(snapshot(user_ids, rpc_config, directory))
        save(evidence_path, evidence)

    flow = [
        ("simple_claim", [args.faucet_operator], 0),
        ("simple_transfer", [user_ids[1], 100_000_000_000], 0),
        ("simple_claim", [user_ids[0]], 1),
        ("simple_transfer", [user_ids[0], 10_000_000_000], 1),
        ("simple_claim", [user_ids[1]], 0),
    ]
    for index in range(len(evidence["transactions"]), len(flow)):
        method, inputs, user_index = flow[index]
        print(f"Step {index + 1}/{len(flow)}: user {user_ids[user_index]} {method}", flush=True)
        result = cli_call(method, inputs, 0, wallets[user_index], rpc_config, directory)
        if result.get("status") != "confirmed":
            raise RuntimeError(f"{method} was not confirmed")
        evidence["transactions"].append({
            "method": method, "inputs": inputs, "user_id": user_ids[user_index],
            "transaction_hash": result.get("transaction_hash"),
            "checkpoint": result.get("confirmed_checkpoint"),
        })
        evidence["snapshots"].append(snapshot(user_ids, rpc_config, directory))
        save(evidence_path, evidence)
        print("balances", {k: v["balance_felt"] for k, v in evidence["snapshots"][-1]["balances"].items()}, flush=True)


if __name__ == "__main__":
    main()
