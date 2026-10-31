"""Public projection guards; no proof generation or financial operations."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("funded_archive", Path(__file__).with_name("archive-funded-evidence.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublicationBoundary(unittest.TestCase):
    def test_nested_secrets_reject(self):
        for field in module.FORBIDDEN:
            with self.assertRaises(AssertionError):
                module.scan({"public": [{field: "not-a-real-secret"}]})
        module.scan({"keyFingerprint": "public", "proof": [1, 2, 3]})

    def test_existing_output_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            before = path.stat().st_mtime_ns
            with self.assertRaises(AssertionError):
                module.archive(path, path)
            self.assertEqual(path.stat().st_mtime_ns, before)

    def test_new_log_is_not_implicitly_public(self):
        with tempfile.TemporaryDirectory() as temp:
            case = Path(temp) / "case"
            public = case / "public"
            public.mkdir(parents=True)
            (public / "CLOSED-v2.json").write_text(json.dumps({"exitCode": 0, "timedOut": False}))
            (public / "CONSISTENCY-v1.json").write_text(json.dumps({"completeUps": 4}))
            (public / "unreviewed-witness.log").write_text("synthetic denied content")
            output = Path(temp) / "out"
            with self.assertRaisesRegex(AssertionError, "new public member"):
                module.archive(case, output)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
