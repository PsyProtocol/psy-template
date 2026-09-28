#!/usr/bin/env python3
"""Read PSY-20 and PSY-721 state at one checkpoint using the deployed v3 ABI.

The RPC returns Merkle proof data with each value. Callers requiring trustless reads
must verify the returned path and checkpoint root against their own trusted header.
"""

import argparse
import json
from pathlib import Path

from staging_token_flow import public_cli


def decode_metadata_text(felts):
    """Decode the template's seven-byte UTF-8 chunks (zero chunks are padding)."""
    return b"".join(value.to_bytes(7, "big").lstrip(b"\x00")
                    for value in felts if value).decode("utf-8")


class AssetReader:
    def __init__(self, rpc_config, directory, contract_id, abi_path, checkpoint, height=None):
        self.rpc_config = rpc_config
        self.directory = directory
        self.contract_id = contract_id
        self.checkpoint = checkpoint
        abi = json.loads(abi_path.read_text())["contract"]
        self.height = height or abi["state_tree_height"]
        self.fields = {field["name"]: field for field in abi["state"]}
        self._leaves = {}
        self._roots = {}
        self._height_option_supported = None

    def _leaf(self, user_id, leaf_id):
        key = user_id, leaf_id
        if key not in self._leaves:
            command = [
                "get-user-contract-state-tree-merkle-proof",
                "--checkpoint-id", str(self.checkpoint), "--user-id", str(user_id),
                "--contract-id", str(self.contract_id), "--height", str(self.height),
                "--leaf-id", str(leaf_id),
            ]
            if self._height_option_supported is False:
                result = public_cli(command[:7] + command[9:], self.rpc_config,
                                    self.directory)["merkle_proof"]
            else:
                try:
                    result = public_cli(command, self.rpc_config, self.directory)["merkle_proof"]
                    self._height_option_supported = True
                except RuntimeError as error:
                    if "unexpected argument '--height'" not in str(error):
                        raise
                    self._height_option_supported = False
                    result = public_cli(command[:7] + command[9:], self.rpc_config,
                                        self.directory)["merkle_proof"]
            value = result["value"].removeprefix("0x")
            if len(value) != 64:
                raise ValueError(f"Expected 32-byte state leaf, got {result['value']!r}")
            root = result["root"]
            if user_id in self._roots and self._roots[user_id] != root:
                raise ValueError("State root changed within the selected checkpoint")
            self._roots[user_id] = root
            self._leaves[key] = result
        return self._leaves[key]

    def felt(self, user_id, offset):
        leaf = self._leaf(user_id, offset // 4)
        value = leaf["value"].removeprefix("0x")
        start = (3 - offset % 4) * 16
        return int(value[start:start + 16], 16)

    def field(self, user_id, name):
        field = self.fields[name]
        offset = field["offset"]
        return ([self.felt(user_id, offset + i) for i in range(field["felt_size"])]
                if field["felt_size"] > 1 else self.felt(user_id, offset))

    def balance_of(self, user_id):
        return self.field(user_id, "balance")

    def total_supply(self, issuer_id):
        return self.field(issuer_id, "total_supply")

    def max_supply(self, issuer_id):
        return self.field(issuer_id, "max_supply")

    def nft_slot(self, user_id, slot):
        if not 0 <= slot < 128:
            raise ValueError("NFT slot must be in [0, 128)")
        field = self.fields["owned_tokens"]
        base = field["offset"] + field["type"]["item_felt_size"] * slot
        return {
            "token_id": [self.felt(user_id, base + i) for i in range(4)],
            "is_active": self.felt(user_id, base + 4) == 1,
            "metadata_hash": [self.felt(user_id, base + i) for i in range(5, 9)],
        }

    def owner_candidate(self, token_id, candidate_user_id, slot_idx=None):
        """Verify an indexed owner candidate; pass a known slot to avoid a scan."""
        if len(token_id) != 4:
            raise ValueError("token_id must contain four Felts")
        if self.balance_of(candidate_user_id) == 0:
            return None
        slots = range(128) if slot_idx is None else [slot_idx]
        for slot in slots:
            value = self.nft_slot(candidate_user_id, slot)
            if value["is_active"] and value["token_id"] == token_id:
                return {"owner": candidate_user_id, "slot": slot,
                        "metadata_hash": value["metadata_hash"]}
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rpc-config", required=True, type=Path)
    parser.add_argument("--abi", required=True, type=Path,
                        help="ABI from the deployed artifact, not a newer local build")
    parser.add_argument("--contract-id", required=True, type=int)
    parser.add_argument("--issuer-id", required=True, type=int)
    parser.add_argument("--checkpoint", type=int)
    parser.add_argument("--user-id", type=int)
    parser.add_argument("--slot", type=int)
    args = parser.parse_args()
    checkpoint = args.checkpoint
    if checkpoint is None:
        checkpoint = public_cli(["get-latest-block-state"], args.rpc_config,
                                Path.cwd())["block_state"]["checkpoint_id"]
    reader = AssetReader(args.rpc_config, Path.cwd(), args.contract_id, args.abi, checkpoint)
    result = {"checkpoint": checkpoint, "contract_id": args.contract_id,
              "total_supply": reader.total_supply(args.issuer_id),
              "max_supply": reader.max_supply(args.issuer_id)}
    for name in ("total_minted", "symbol", "decimals", "name", "token_uri", "base_uri", "base_uri_hash"):
        if name in reader.fields:
            result[name] = reader.field(args.issuer_id, name)
    for name in ("name", "token_uri", "base_uri"):
        if name in result:
            result[f"{name}_text"] = decode_metadata_text(result[name])
    if "symbol" in result:
        value = result["symbol"]
        result["symbol_text"] = value.to_bytes(max(1, (value.bit_length() + 7) // 8), "big").decode("ascii")
    if args.user_id is not None:
        result["user_id"] = args.user_id
        result["balance"] = reader.balance_of(args.user_id)
        if args.slot is not None:
            result["slot"] = reader.nft_slot(args.user_id, args.slot)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
