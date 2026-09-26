#!/usr/bin/env python3
"""Verify a closed delegation slot starts with zero spent in its next version."""

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
    parser.add_argument("--project", required=True)
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    wallets = json.loads((directory / "wallets.json").read_text())["users"]
    owner, spender = (wallet["user_id"] for wallet in wallets)
    abi = json.loads((directory / args.project / "target/v3/abi.json").read_text())["contract"]
    fields = {field["name"]: field["offset"] for field in abi["state"]}
    if abi["state_tree_height"] != 32:
        raise SystemExit("Expected private v3 layout")
    path = directory / f"token-reopen-{args.contract_id}.json"
    evidence = json.loads(path.read_text()) if path.exists() else {
        "network": "sepolia staging", "contract_id": args.contract_id,
        "users": [owner, spender], "steps": [],
    }
    if evidence["contract_id"] != args.contract_id:
        raise SystemExit("Evidence belongs to another contract")
    steps = [
        ("open_delegation_channel", [0, spender, 200], 0),
        ("spend_delegation", [owner, 0, 75, owner], 1),
        ("claim", [spender], 0),
        ("request_revoke_delegation", [0], 0),
        ("close_delegation_channel", [owner, 0, 1], 1),
        ("finalize_revoke_delegation", [0, spender], 0),
        ("open_delegation_channel", [0, spender, 100], 0),
        ("spend_delegation", [owner, 0, 25, owner], 1),
        ("claim", [spender], 0),
        ("request_revoke_delegation", [0], 0),
        ("close_delegation_channel", [owner, 0, 2], 1),
        ("finalize_revoke_delegation", [0, spender], 0),
    ]
    ledger_offset = fields["delegation_spends"] + owner * 16 * 3
    for index in range(len(evidence["steps"]), len(steps)):
        method, inputs, wallet_index = steps[index]
        print(f"Reopen step {index + 1}/{len(steps)}: {method}", flush=True)
        result = cli_call(method, inputs, args.contract_id, wallets[wallet_index], args.rpc_config, directory)
        if result.get("status") != "confirmed":
            raise RuntimeError(f"{method} did not confirm")
        evidence["steps"].append({"method": method, "inputs": inputs,
            "user_id": wallets[wallet_index]["user_id"],
            "transaction_hash": result["transaction_hash"],
            "checkpoint": result["confirmed_checkpoint"]})
        save(path, evidence)
        if index == 7:
            checkpoint = public_cli(["get-latest-block-state"], args.rpc_config, directory)["block_state"]["checkpoint_id"]
            proof = state_felt(args.rpc_config, directory, checkpoint, spender,
                               args.contract_id, 32, ledger_offset)
            evidence["second_version_spent_checkpoint"] = checkpoint
            evidence["second_version_spent_proof"] = proof
            save(path, evidence)
            if proof["felt"] != 25:
                raise AssertionError(f"second version spent must be 25, got {proof['felt']}")

    checkpoint = public_cli(["get-latest-block-state"], args.rpc_config, directory)["block_state"]["checkpoint_id"]
    offsets = {
        "owner_balance": (owner, fields["balance"]),
        "recipient_balance": (spender, fields["balance"]),
        "total_supply": (owner, fields["total_supply"]),
        "channel_status": (owner, fields["delegations"] + 3),
        "channel_allocation": (owner, fields["delegations"] + 1),
        "channel_version": (owner, fields["delegations"] + 2),
        "spender_spent": (spender, ledger_offset),
        "spender_closed": (spender, ledger_offset + 1),
        "spender_version": (spender, ledger_offset + 2),
    }
    proofs = {name: state_felt(args.rpc_config, directory, checkpoint, user,
                               args.contract_id, 32, offset)
              for name, (user, offset) in offsets.items()}
    values = {name: proof["felt"] for name, proof in proofs.items()}
    expected = {"owner_balance": 900, "recipient_balance": 100, "total_supply": 1000,
                "channel_status": 3, "channel_allocation": 0, "channel_version": 2,
                "spender_spent": 25, "spender_closed": 1, "spender_version": 2}
    if values != expected:
        raise AssertionError(f"state mismatch: {values} != {expected}")
    evidence["checkpoint"] = checkpoint
    evidence["state"] = values
    evidence["state_proofs"] = proofs
    save(path, evidence)
    print(f"Verified isolated delegation version 2 on contract {args.contract_id}: {values}", flush=True)


if __name__ == "__main__":
    main()
