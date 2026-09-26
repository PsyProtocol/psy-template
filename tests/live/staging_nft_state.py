#!/usr/bin/env python3
"""Verify PSY-721 balances, ownership, and FIFO counters from staging proofs."""

import argparse
import json
from pathlib import Path

from staging_nft_flow import save
from staging_token_flow import public_cli
from staging_token_supply import state_felt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--rpc-config", required=True, type=Path)
    parser.add_argument("--contract-id", required=True, type=int)
    parser.add_argument("--minted", required=True, type=int)
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    users = [wallet["user_id"] for wallet in
             json.loads((directory / "wallets.json").read_text())["users"]]
    issuer, recipient = users
    abi = json.loads((directory / "nft/target/v3/abi.json").read_text())["contract"]
    fields = {field["name"]: field["offset"] for field in abi["state"]}
    height = abi["state_tree_height"]
    if height != 30:
        raise SystemExit(f"Unexpected NFT tree height {height}")
    checkpoint = public_cli(["get-latest-block-state"], args.rpc_config,
                            directory)["block_state"]["checkpoint_id"]
    offsets = {
        "issuer_balance": (issuer, fields["balance"]),
        "recipient_balance": (recipient, fields["balance"]),
        "total_minted": (issuer, fields["total_minted"]),
        "nonce_sent": (issuer, fields["outbox"] + recipient * 35 + 32),
        "nonce_acked": (issuer, fields["outbox"] + recipient * 35 + 34),
        "nonce_claimed": (recipient, fields["outbox"] + issuer * 35 + 33),
    }
    for slot in range(args.minted):
        offsets[f"recipient_slot_{slot}_active"] = (
            recipient, fields["owned_tokens"] + slot * 9 + 4)
    proofs = {name: state_felt(args.rpc_config, directory, checkpoint, user,
                               args.contract_id, height, offset)
              for name, (user, offset) in offsets.items()}
    values = {name: proof["felt"] for name, proof in proofs.items()}
    expected = {"issuer_balance": 0, "recipient_balance": args.minted,
                "total_minted": args.minted,
                "nonce_sent": args.minted + 1,
                "nonce_acked": args.minted + 1,
                "nonce_claimed": args.minted + 1}
    expected.update({f"recipient_slot_{slot}_active": 1
                     for slot in range(args.minted)})
    if values != expected:
        raise AssertionError(f"NFT state mismatch: {values} != {expected}")
    evidence = {"network": "sepolia staging", "contract_id": args.contract_id,
                "users": users, "checkpoint": checkpoint, "state": values,
                "state_proofs": proofs}
    save(directory / f"nft-state-{args.minted}.json", evidence)
    print(f"Verified NFT state for {args.minted} tokens at checkpoint {checkpoint}", flush=True)


if __name__ == "__main__":
    main()
