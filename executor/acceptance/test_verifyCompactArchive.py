import copy
import gzip
import hashlib
import json
import pathlib
import tempfile
import unittest
import subprocess
import sys

from verifyCompactArchive import verify


class ArchiveIntegrity(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.archive = self.root / "archive"
        self.original = self.root / "original"
        (self.archive / "files/public").mkdir(parents=True)
        (self.original / "public").mkdir(parents=True)
        self.raw = b'{"included":true}\n'
        self.packed = gzip.compress(self.raw, mtime=0)
        self.file = self.archive / "files/public/result.json.gz"
        self.file.write_bytes(self.packed)
        (self.original / "public/result.json").write_bytes(self.raw)
        self.manifest = {"schema": 1, "walletFilesIncluded": False,
                         "sealedBinariesIncluded": False, "records": [{
            "source": "public/result.json", "file": "files/public/result.json.gz",
            "bytes": len(self.raw), "gzipBytes": len(self.packed),
            "sha256": hashlib.sha256(self.raw).hexdigest(),
            "gzipSha256": hashlib.sha256(self.packed).hexdigest()}]}
        self.write()

    def write(self):
        (self.archive / "manifest.json").write_text(json.dumps(self.manifest))

    def test_valid_with_and_without_originals(self):
        self.assertFalse(verify(self.archive)["originalsCompared"])
        self.assertTrue(verify(self.archive, self.original)["originalsCompared"])

    def test_corrupt_compressed_bytes(self):
        self.file.write_bytes(self.packed[:-1] + bytes([self.packed[-1] ^ 1]))
        with self.assertRaisesRegex(ValueError, "compressed hash"):
            verify(self.archive)

    def test_wrong_decompressed_hash(self):
        self.manifest["records"][0]["sha256"] = "0" * 64
        self.write()
        with self.assertRaisesRegex(ValueError, "raw hash"):
            verify(self.archive)

    def test_source_traversal(self):
        self.manifest["records"][0].update(source="../outside", file="files/../outside.gz")
        self.write()
        with self.assertRaisesRegex(ValueError, "unsafe archive path"):
            verify(self.archive)

    def test_duplicate_and_unlisted_files(self):
        self.manifest["records"].append(copy.deepcopy(self.manifest["records"][0]))
        self.write()
        with self.assertRaisesRegex(ValueError, "duplicate"):
            verify(self.archive)
        self.manifest["records"].pop()
        self.write()
        (self.archive / "files/unlisted.gz").write_bytes(self.packed)
        with self.assertRaisesRegex(ValueError, "unlisted"):
            verify(self.archive)

    def test_changed_original_and_symlink(self):
        original = self.original / "public/result.json"
        original.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "original differs"):
            verify(self.archive, self.original)
        original.unlink()
        original.symlink_to(self.file)
        with self.assertRaisesRegex(ValueError, "escapes root|symlink"):
            verify(self.archive, self.original)

    def test_source_freeze_keeps_cargo_manifest_and_lockfile(self):
        source = self.original / "source"
        source.mkdir()
        (source / "Cargo.toml").write_text('[package]\nname="fixture"\n')
        (source / "Cargo.lock").write_text('version = 3\n')
        output = self.root / "source-archive"
        subprocess.run([sys.executable, str(pathlib.Path(__file__).with_name("archiveCompact.py")),
                        "--base", str(self.original), "--out", str(output), "--select", "source"],
                       check=True, capture_output=True, text=True)
        records = json.loads((output / "manifest.json").read_bytes())["records"]
        self.assertEqual({r["source"] for r in records}, {"source/Cargo.toml", "source/Cargo.lock"})
        self.assertEqual(verify(output, self.original)["files"], 2)


if __name__ == "__main__":
    unittest.main()
