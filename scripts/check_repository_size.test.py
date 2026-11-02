#!/usr/bin/env python3
"""Exercise forced archive additions and accumulated repository budgets offline."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("repository_size", Path(__file__).with_name("check_repository_size.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class RepositorySizeTests(unittest.TestCase):
    def test_source_and_small_review_are_allowed(self):
        rows = [{"path": "amm/contract.psy", "bytes": 100000},
                {"path": "executor/verification/case/README.md", "bytes": 3000},
                {"path": "executor/verification/case/INDEX.json", "bytes": 65000}]
        self.assertEqual(gate.inspect(rows)["failures"], [])

    def test_raw_nested_and_oversized_reviews_are_rejected(self):
        for path, size in [("executor/verification/case/request.json.gz", 100),
                           ("batching/evidence/case/tree/source.rs", 100),
                           ("executor/verification/case/deep/request.json", 100),
                           ("executor/verification/case/INDEX.json", 65537),
                           ("executor/verification/case/README.md", 65537)]:
            with self.subTest(path=path):
                self.assertTrue(gate.inspect([{"path": path, "bytes": size}])["failures"])

    def test_aggregate_and_single_file_budgets(self):
        for rows in [[{"path": "binary", "bytes": gate.MAX_FILE + 1}],
                     [{"path": str(i), "bytes": gate.MAX_FILE} for i in range(17)],
                     [{"path": str(i), "bytes": 1} for i in range(gate.MAX_FILES + 1)],
                     [{"path": f"executor/verification/case/{i}.md", "bytes": 65536} for i in range(129)]]:
            self.assertTrue(gate.inspect(rows)["failures"])

    def test_forced_addition_cannot_bypass_ignore_rules(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", directory], check=True)
            (root / ".gitignore").write_text("executor/verification/\n")
            p = root / "executor/verification/case/request.json.gz"
            p.parent.mkdir(parents=True)
            p.write_bytes(b"raw fixture")
            subprocess.run(["git", "add", ".gitignore"], cwd=root, check=True)
            subprocess.run(["git", "add", "-f", str(p)], cwd=root, check=True)
            rows = gate.index_rows(root)
            self.assertEqual(next(r["bytes"] for r in rows if r["path"].endswith(".gz")), 11)
            self.assertTrue(gate.inspect(rows)["failures"])


if __name__ == "__main__":
    unittest.main()
