#!/usr/bin/env python3
"""Check maintained text for Han-script prose, preserving frozen historical bytes.

This is a language consistency check, not a financial/security verifier. Historical
exceptions are explicit paths with exact hashes, never directory-wide exclusions.
Gzip evidence is scanned separately by the recorded full archive audit and is
never translated in place. Intentional Unicode test samples use source escapes.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
EXCEPTIONS = ROOT / "docs/language/FROZEN_EXCEPTIONS_20261026.json"
HAN = re.compile("[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\U00020000-\U000323af]")
BINARY_SUFFIXES = {
    ".gz", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".ttf",
    ".woff", ".woff2", ".wasm", ".pdf", ".zip", ".mp4", ".mp3", ".ds_store",
}


def inspect(root, paths, exceptions):
    """Return violations and counts; never change a file or accept new exceptions."""
    failures = []
    seen = set()
    checked = 0
    frozen = 0
    for rel in sorted(set(paths)):
        path = root / rel
        if not path.is_file() or path.suffix.lower() in BINARY_SUFFIXES:
            continue
        raw = path.read_bytes()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        checked += 1
        if rel in exceptions:
            seen.add(rel)
            expected = exceptions[rel]
            if hashlib.sha256(raw).hexdigest() != expected["sha256"]:
                failures.append({"path": rel, "reason": "frozen historical text changed"})
            else:
                frozen += 1
            continue
        lines = [i for i, line in enumerate(text.splitlines(), 1) if HAN.search(line)]
        if lines:
            failures.append({"path": rel, "lines": lines, "reason": "maintained text must use English"})
    for rel in sorted(set(exceptions) - seen):
        failures.append({"path": rel, "reason": "frozen exception missing or no longer text"})
    return {"checkedTextFiles": checked, "frozenExactMatches": frozen, "failures": failures}


def main():
    doc = json.loads(EXCEPTIONS.read_text())
    records = doc["records"]
    assert len({r["path"] for r in records}) == len(records), "duplicate exceptions"
    assert all(r.get("reason") and re.fullmatch("[a-f0-9]{64}", r["sha256"]) for r in records)
    paths = subprocess.check_output(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=ROOT
    ).decode().split("\0")
    result = inspect(ROOT, [p for p in paths if p], {r["path"]: r for r in records})
    print(json.dumps(result, indent=2))
    return 1 if result["failures"] else 0


if __name__ == "__main__":
    sys.exit(main())
