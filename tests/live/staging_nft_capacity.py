#!/usr/bin/env python3
"""Exercise four-slot NFT backpressure and ACK recycling on staging.

Requires a contract where the issuer has minted local_id=1 and the two
disposable users have completed the round trip plus second A->B claim.
"""
import argparse
import json
from pathlib import Path

from staging_nft_flow import cli_call


def save(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--rpc-config", required=True, type=Path)
    parser.add_argument("--contract-id", required=True, type=int)
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    wallets = json.loads((directory / "wallets.json").read_text())["users"]
    issuer, recipient = wallets
    evidence_path = directory / "evidence-v3-capacity.json"
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else {
        "network": "sepolia staging", "contract_id": args.contract_id,
        "users": [issuer["user_id"], recipient["user_id"]], "transactions": [],
    }
    if evidence["contract_id"] != args.contract_id:
        raise SystemExit("Evidence file belongs to another contract")

    steps = [("acknowledge", [recipient["user_id"]], 0)]
    steps += [("mint", [i - 2, i, 100 + i, 200 + i, 300 + i, 400 + i], 0)
              for i in range(2, 7)]
    steps += [("transfer", [slot, recipient["user_id"]], 0) for slot in range(4)]
    steps += [
        ("expect_full", [4, recipient["user_id"]], 0),
        ("claim", [1, issuer["user_id"]], 1),
        ("acknowledge", [recipient["user_id"]], 0),
        ("transfer", [4, recipient["user_id"]], 0),
    ]
    steps += [("claim", [slot, issuer["user_id"]], 1) for slot in range(2, 6)]
    steps += [("acknowledge", [recipient["user_id"]], 0)]
    for index in range(len(evidence["transactions"]), len(steps)):
        method, inputs, wallet_index = steps[index]
        wallet = wallets[wallet_index]
        print(f"Capacity step {index + 1}/{len(steps)}: {method}", flush=True)
        if method == "expect_full":
            try:
                cli_call("transfer", inputs, args.contract_id, wallet, args.rpc_config, directory)
            except RuntimeError as error:
                if "FIFO outbox queue full" not in str(error):
                    raise
                item = {"method": method, "user_id": wallet["user_id"], "inputs": inputs,
                        "result": "rejected before submission: FIFO outbox queue full"}
            else:
                raise RuntimeError("Fifth pending transfer unexpectedly succeeded")
        else:
            result = cli_call(method, inputs, args.contract_id, wallet, args.rpc_config, directory)
            if result.get("status") != "confirmed":
                raise RuntimeError(f"{method} did not confirm")
            item = {"method": method, "user_id": wallet["user_id"], "inputs": inputs,
                    "transaction_hash": result.get("transaction_hash"),
                    "checkpoint": result.get("confirmed_checkpoint")}
        evidence["transactions"].append(item)
        save(evidence_path, evidence)


if __name__ == "__main__":
    main()
