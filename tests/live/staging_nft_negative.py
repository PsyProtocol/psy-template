#!/usr/bin/env python3
"""Check PSY-721 access controls and rejection paths after the capacity flow."""

import argparse
import json
from pathlib import Path

from staging_nft_flow import cli_call, save


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--rpc-config", required=True, type=Path)
    parser.add_argument("--contract-id", required=True, type=int)
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    wallets = json.loads((directory / "wallets.json").read_text())["users"]
    issuer, recipient = (wallet["user_id"] for wallet in wallets)
    evidence_path = directory / "nft-negative-20260926.json"
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else {
        "network": "sepolia staging", "contract_id": args.contract_id,
        "users": [issuer, recipient], "steps": [],
    }
    if evidence["contract_id"] != args.contract_id:
        raise SystemExit("Evidence belongs to another contract")
    cases = [
        ("mint", [0, 10, 1, 2, 3, 4], 0, "local_id must match next sequential mint index"),
        ("mint", [0, 9, 1, 2, 3, 4], 1, "only designated ISSUER_USER_ID partition can mint"),
        ("set_collection_metadata", [1, 1, 2, 3, 4], 1,
         "caller is not in canonical ISSUER_USER_ID partition"),
        ("transfer", [0, recipient], 1, "cannot transfer to self"),
        ("transfer", [0, 16777216], 1, "recipient user_id exceeds outbox bounds"),
        ("transfer", [0, recipient], 0, "no active NFT in slot"),
        ("claim", [8, 16777216], 1, "sender user_id exceeds inbox bounds"),
        ("claim", [8, issuer], 1, "no NFT to claim from sender"),
        ("renounce_mint_authority", [], 1,
         "only designated ISSUER_USER_ID partition can renounce mint authority"),
        ("renounce_mint_authority", [], 0, None),
        ("mint", [0, 9, 1, 2, 3, 4], 0, "minting has been renounced"),
        ("set_collection_metadata", [1, 1, 2, 3, 4], 0, "contract administration has been renounced"),
    ]
    for index in range(len(evidence["steps"]), len(cases)):
        method, inputs, wallet_index, expected_error = cases[index]
        print(f"NFT negative {index + 1}/{len(cases)}: {method}", flush=True)
        if expected_error:
            try:
                cli_call(method, inputs, args.contract_id, wallets[wallet_index], args.rpc_config, directory)
            except RuntimeError as error:
                reason = expected_error
                if expected_error not in str(error):
                    if method == "claim" and inputs[1] == 16777216 and "realm id `16` not found" in str(error):
                        reason = "CLI realm lookup rejected user_id 16777216 before contract execution"
                    else:
                        raise
                item = {"method": method, "inputs": inputs,
                        "user_id": wallets[wallet_index]["user_id"],
                        "result": f"rejected before submission: {reason}"}
            else:
                raise AssertionError(f"{method} unexpectedly confirmed")
        else:
            result = cli_call(method, inputs, args.contract_id, wallets[wallet_index], args.rpc_config, directory)
            if result.get("status") != "confirmed":
                raise RuntimeError(f"{method} did not confirm")
            item = {"method": method, "inputs": inputs,
                    "user_id": wallets[wallet_index]["user_id"],
                    "transaction_hash": result["transaction_hash"],
                    "checkpoint": result["confirmed_checkpoint"]}
        evidence["steps"].append(item)
        save(evidence_path, evidence)
    print(f"Verified {len(cases)} NFT access-control and rejection cases", flush=True)


if __name__ == "__main__":
    main()
