#!/usr/bin/env python3
"""Check ABI offsets and four-Felt state-leaf decoding without RPC access."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from asset_queries import AssetReader, decode_metadata_text


class AssetQueryTests(unittest.TestCase):
    def test_metadata_decoding(self):
        self.assertEqual(decode_metadata_text([0x505359204E4654, 0]), "PSY NFT")
        self.assertEqual(decode_metadata_text([0x697066733A2F2F, 0]), "ipfs://")

    def test_cli_without_explicit_height(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            abi = root / "abi.json"
            abi.write_text(json.dumps({"contract": {"state_tree_height": 30, "state": [
                {"name": "balance", "offset": 0, "felt_size": 1},
            ]}}))
            commands = []

            def fake_rpc(command, _rpc_config, _directory):
                commands.append(command)
                if "--height" in command:
                    raise RuntimeError("unexpected argument '--height' found")
                return {"merkle_proof": {"value": "0x" + "0" * 63 + "7", "root": "0x1234"}}

            with patch("asset_queries.public_cli", side_effect=fake_rpc):
                reader = AssetReader(root, root, 9, abi, 42)
                self.assertEqual(reader.balance_of(7), 7)
                self.assertEqual(len(commands), 2)
                self.assertNotIn("--height", commands[1])

    def test_supply_and_nft_slot_at_same_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            abi = root / "abi.json"
            abi.write_text(json.dumps({"contract": {"state_tree_height": 30, "state": [
                {"name": "balance", "offset": 0, "felt_size": 1},
                {"name": "total_supply", "offset": 4, "felt_size": 1},
                {"name": "max_supply", "offset": 5, "felt_size": 1},
                {"name": "owned_tokens", "offset": 8, "felt_size": 1152,
                 "type": {"item_felt_size": 9}},
            ]}}))
            state = {0: 1, 4: 2, 5: 3}
            for i, value in enumerate([11, 12, 13, 14, 1, 21, 22, 23, 24]):
                state[8 + i] = value

            def fake_rpc(command, _rpc_config, _directory):
                self.assertEqual(command[2], "42")
                leaf = int(command[10])
                felts = [state.get(leaf * 4 + i, 0) for i in range(4)]
                return {"merkle_proof": {"value": "0x" + "".join(
                    f"{felt:016x}" for felt in reversed(felts)), "root": "0x1234"}}

            with patch("asset_queries.public_cli", side_effect=fake_rpc):
                reader = AssetReader(root, root, 9, abi, 42)
                self.assertEqual(reader.balance_of(7), 1)
                self.assertEqual(reader.total_supply(7), 2)
                self.assertEqual(reader.max_supply(7), 3)
                slot = reader.nft_slot(7, 0)
                self.assertEqual(slot["token_id"], [11, 12, 13, 14])
                self.assertTrue(slot["is_active"])
                self.assertEqual(slot["metadata_hash"], [21, 22, 23, 24])
                self.assertEqual(reader.owner_candidate([11, 12, 13, 14], 7)["slot"], 0)


if __name__ == "__main__":
    unittest.main()
