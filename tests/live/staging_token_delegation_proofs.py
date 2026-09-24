#!/usr/bin/env python3
"""Check PSY-20 staging balances, escrow, and terminal spender ledger from node proofs."""

import argparse
import json
from pathlib import Path

from staging_nft_flow import save
from staging_token_flow import public_cli


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--rpc-config", required=True, type=Path)
    parser.add_argument("--slot", type=int, default=0)
    parser.add_argument("--expected-spent", type=int, default=300)
    parser.add_argument("--expected-cumulative", type=int, default=300)
    parser.add_argument("--finalized", action="store_true")
    parser.add_argument("--output-file", default="token-delegation-state-proofs.json")
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    rpc_config = args.rpc_config.resolve(strict=True)
    evidence = json.loads((directory / "token-delegation-evidence.json").read_text())
    owner, spender = evidence["users"]
    contract_id = evidence["contract_id"]
    abi = json.loads((directory / "token-delegation/target/v3/abi.json").read_text())["contract"]
    field_definitions = {field["name"]: field for field in abi["state"]}
    fields = {name: field["offset"] for name, field in field_definitions.items()}
    channel_size = field_definitions["delegations"]["type"]["item_felt_size"]
    finalized = args.finalized or any(tx["method"] == "finalize_revoke_delegation" for tx in evidence["transactions"])
    channel_base = fields["delegations"] + args.slot * channel_size
    ledger_base = fields["delegation_spends"] + (owner * 16 + args.slot) * 3
    checkpoint = public_cli(["get-latest-block-state"], rpc_config, directory)["block_state"]["checkpoint_id"]
    queries = {
        "owner_balance": (owner, fields["balance"]),
        "total_minted": (owner, fields["total_minted"]),
        "channel_spender": (owner, channel_base),
        "channel_allocated": (owner, channel_base + 1),
        "channel_version": (owner, channel_base + 2),
        "channel_status": (owner, channel_base + 3),
        "spent": (spender, ledger_base),
        "closed": (spender, ledger_base + 1),
        "spent_version": (spender, ledger_base + 2),
        "spender_outbox_to_owner": (spender, fields["other_user_info"] + owner * 2),
        "owner_claimed_from_spender": (owner, fields["other_user_info"] + spender * 2 + 1),
    }
    if channel_size == 5:
        queries["channel_cutoff"] = (owner, channel_base + 4)
    proofs = {}
    for label, (user_id, offset) in queries.items():
        leaf_id = offset // 4
        result = public_cli([
            "get-user-contract-state-tree-merkle-proof",
            "--checkpoint-id", str(checkpoint), "--user-id", str(user_id),
            "--contract-id", str(contract_id), "--leaf-id", str(leaf_id),
        ], rpc_config, directory)["merkle_proof"]
        value = result["value"].removeprefix("0x")
        chunks = [int(value[index:index + 16], 16) for index in range(0, 64, 16)]
        proofs[label] = {
            "user_id": user_id, "offset": offset, "leaf_id": leaf_id,
            "felt": chunks[3 - offset % 4], "root": result["root"],
        }
    vals = {name: record["felt"] for name, record in proofs.items()}
    assert vals["owner_balance"] == (10000 if finalized else 9300), vals
    assert vals["total_minted"] == 10000, vals
    assert vals["channel_spender"] == (0 if finalized else spender), vals
    assert vals["channel_allocated"] == (0 if finalized else 1000), vals
    assert vals["channel_version"] == vals["spent_version"] == 1, vals
    assert vals["channel_status"] == (3 if finalized else 2), vals
    assert vals["spent"] == args.expected_spent and vals["closed"] == 1, vals
    assert vals["spender_outbox_to_owner"] == vals["owner_claimed_from_spender"] == args.expected_cumulative, vals
    if not finalized:
        assert vals["owner_balance"] + vals["channel_allocated"] - vals["spent"] == vals["total_minted"]
    output = {"contract_id": contract_id, "checkpoint": checkpoint, "slot": args.slot,
              "values": vals, "proofs": proofs}
    save(directory / args.output_file, output)
    print(f"Verified contract {contract_id} at checkpoint {checkpoint}: {vals}", flush=True)


if __name__ == "__main__":
    main()
