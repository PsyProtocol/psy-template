#!/usr/bin/env python3
"""Exercise the private v3 PSY-20 public accounting and delegation on staging."""

import argparse
import json
from pathlib import Path

from staging_nft_flow import cli_call, save
from staging_token_flow import public_cli
from staging_token_supply import state_felt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--rpc-config", required=True, type=Path)
    parser.add_argument("--contract-id", required=True, type=int)
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    wallets = json.loads((directory / "wallets.json").read_text())["users"]
    issuer, recipient = (wallet["user_id"] for wallet in wallets)
    if issuer // 1048576 == recipient // 1048576:
        raise SystemExit("Test users must be in different realms")
    project = directory / "token-private-v3-20260926"
    abi = json.loads((project / "target/v3/abi.json").read_text())["contract"]
    fields = {field["name"]: field["offset"] for field in abi["state"]}
    if abi["state_tree_height"] != 32:
        raise SystemExit("Expected the private v3 contract layout")
    evidence_path = directory / "token-matrix-20260926.json"
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else {
        "network": "sepolia staging", "contract_id": args.contract_id,
        "users": [issuer, recipient], "steps": [],
    }
    if evidence["contract_id"] != args.contract_id:
        raise SystemExit("Evidence belongs to a different contract")

    steps = [
        ("set_extended_metadata", [0x50535920546F6B65, 0x6E, 1, 2, 3, 4, 5], 0, None),
        ("mint", [1], 1, "only designated issuer partition can mint"),
        ("transfer", [0, 1], 0, "recipient user_id exceeds outbox bounds"),
        ("transfer", [recipient, 100], 0, None),
        ("claim", [issuer], 1, None),
        ("claim", [issuer], 1, "no tokens to claim from this sender"),
        ("batch_transfer_2", [recipient, recipient, 20, 30], 0, None),
        ("claim", [issuer], 1, None),
        ("batch_transfer_5", [recipient, recipient, recipient, recipient, recipient,
                              10, 0, 15, 0, 5], 0, None),
        ("claim", [issuer], 1, None),
        ("burn", [30], 1, None),
        ("settle_burn", [recipient], 0, None),
        ("settle_burn", [recipient], 0, "no pending burn to settle"),
        ("open_delegation_channel", [0, recipient, 200], 0, None),
        ("spend_delegation", [issuer, 0, 75, issuer], 1, None),
        ("claim", [recipient], 0, None),
        ("request_revoke_delegation", [0], 0, None),
        ("spend_delegation", [issuer, 0, 1, issuer], 1, "channel is not active"),
        ("close_delegation_channel", [issuer, 0, 1], 1, None),
        ("finalize_revoke_delegation", [0, recipient], 0, None),
    ]
    for index in range(len(evidence["steps"]), len(steps)):
        method, inputs, wallet_index, expected_error = steps[index]
        print(f"Token matrix {index + 1}/{len(steps)}: {method}", flush=True)
        if expected_error:
            try:
                cli_call(method, inputs, args.contract_id, wallets[wallet_index], args.rpc_config, directory)
            except RuntimeError as error:
                if expected_error not in str(error):
                    raise
                item = {"method": method, "inputs": inputs,
                        "user_id": wallets[wallet_index]["user_id"],
                        "result": f"rejected before submission: {expected_error}"}
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

    checkpoint = public_cli(["get-latest-block-state"], args.rpc_config, directory)["block_state"]["checkpoint_id"]
    offsets = {
        "issuer_balance": (issuer, fields["balance"]),
        "recipient_balance": (recipient, fields["balance"]),
        "total_minted": (issuer, fields["total_minted"]),
        "total_supply": (issuer, fields["total_supply"]),
        "recipient_burn_requested": (recipient, fields["burn_requested"]),
        "recipient_burn_settled": (issuer, fields["burn_settled"] + recipient),
        "channel_status": (issuer, fields["delegations"] + 3),
        "channel_allocation": (issuer, fields["delegations"] + 1),
        "spender_spent": (recipient, fields["delegation_spends"] + issuer * 16 * 3),
        "spender_closed": (recipient, fields["delegation_spends"] + issuer * 16 * 3 + 1),
    }
    proofs = {name: state_felt(args.rpc_config, directory, checkpoint, user, args.contract_id, 32, offset)
              for name, (user, offset) in offsets.items()}
    values = {name: proof["felt"] for name, proof in proofs.items()}
    expected = {"issuer_balance": 720, "recipient_balance": 250,
                "total_minted": 1000, "total_supply": 970,
                "recipient_burn_requested": 30, "recipient_burn_settled": 30,
                "channel_status": 3, "channel_allocation": 0,
                "spender_spent": 75, "spender_closed": 1}
    if values != expected:
        raise AssertionError(f"state mismatch: {values} != {expected}")
    evidence["checkpoint"] = checkpoint
    evidence["state"] = values
    evidence["state_proofs"] = proofs
    save(evidence_path, evidence)
    print(f"Verified PSY-20 matrix on contract {args.contract_id}: {values}", flush=True)


if __name__ == "__main__":
    main()
