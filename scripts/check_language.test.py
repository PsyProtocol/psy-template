"""Language-gate regressions; isolated fixtures, no repository/network mutation."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("language", Path(__file__).with_name("check_language.py"))
language = importlib.util.module_from_spec(spec)
spec.loader.exec_module(language)


class LanguageGateTests(unittest.TestCase):
    def test_new_non_english_text_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "README.md").write_text("English\n\u4e2d\u6587\n")
            result = language.inspect(root, ["README.md"], {})
            self.assertEqual(result["failures"][0]["lines"], [2])

    def test_exact_frozen_exception_cannot_change_or_disappear(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "original.log"
            path.write_text("\u4e2d\u6587\n")
            exceptions = {"original.log": {"sha256": hashlib.sha256(path.read_bytes()).hexdigest()}}
            self.assertFalse(language.inspect(root, ["original.log"], exceptions)["failures"])
            path.write_text("changed\n")
            self.assertIn("changed", language.inspect(root, ["original.log"], exceptions)["failures"][0]["reason"])
            path.unlink()
            self.assertIn("missing", language.inspect(root, [], exceptions)["failures"][0]["reason"])

    def test_unicode_fixture_escape_is_ascii_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "fixture.mjs").write_text(r"const sample='\u4e2d\u6587';")
            self.assertFalse(language.inspect(root, ["fixture.mjs"], {})["failures"])


if __name__ == "__main__":
    unittest.main()
