"""Publication boundary tests; no proof, wallet or network operations."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "archive_funded_pair", Path(__file__).with_name("archive-funded-pair.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublicationBoundary(unittest.TestCase):
    def test_rejects_nested_secret_material(self):
        for key in module.FORBIDDEN:
            with self.assertRaisesRegex(AssertionError, "secret-bearing"):
                module.scan({"public": [{"session": {key: "never publish"}}]})
        module.scan({"public_key": "public", "proof": [1, 2], "nonce": 1})

    def test_preserves_existing_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            out = root / "old"
            out.mkdir()
            sentinel = out / "original.txt"
            sentinel.write_text("original")
            with self.assertRaisesRegex(AssertionError, "fresh publication"):
                module.archive(root / "case", out)
            self.assertEqual(sentinel.read_text(), "original")


if __name__ == "__main__":
    unittest.main()
