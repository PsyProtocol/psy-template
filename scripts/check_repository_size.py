#!/usr/bin/env python3
"""Bound tracked Git payloads; raw acceptance archives belong outside source Git.

Read the index, including staged changes, so forced additions cannot bypass the
ignore rules. This gate does not classify secrets or validate financial evidence.
"""
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MIB = 1024 * 1024
MAX_FILE = 5 * MIB
MAX_TREE = 80 * MIB
MAX_FILES = 10000
MAX_REVIEWS = 8 * MIB
ARCHIVES = ("executor/verification/", "batching/evidence/")


def inspect(rows):
    failures = []
    total = sum(row["bytes"] for row in rows)
    reviews = 0
    for row in rows:
        path, size = row["path"], row["bytes"]
        if size > MAX_FILE:
            failures.append({"path": path, "reason": "tracked file exceeds 5 MiB"})
        if path.startswith(ARCHIVES):
            reviews += size
            allowed = (path.endswith(".md") and size <= 65536) or (
                path.endswith(".json") and path.count("/") <= 3 and size <= 65536)
            if not allowed:
                failures.append({"path": path, "reason": "raw/nested archive payload must stay outside Git"})
    if total > MAX_TREE:
        failures.append({"reason": "tracked tree exceeds 80 MiB"})
    if len(rows) > MAX_FILES:
        failures.append({"reason": "tracked tree exceeds 10000 files"})
    if reviews > MAX_REVIEWS:
        failures.append({"reason": "historical review summaries exceed 8 MiB"})
    return {"trackedFiles": len(rows), "trackedBytes": total,
            "historicalReviewBytes": reviews, "failures": failures}


def index_rows(root):
    entries = subprocess.check_output(["git", "ls-files", "--stage", "-z"], cwd=root)
    rows = []
    for entry in entries.split(b"\0"):
        if not entry:
            continue
        meta, path = entry.split(b"\t", 1)
        mode, oid, stage = meta.split()
        if stage != b"0":
            raise ValueError("Resolve index conflicts before checking repository size")
        if mode == b"160000":
            continue
        rows.append({"path": path.decode("utf-8"), "oid": oid.decode("ascii")})
    ids = sorted({r["oid"] for r in rows})
    result = subprocess.check_output(["git", "cat-file", "--batch-check=%(objectname) %(objectsize)"],
                                     input=("\n".join(ids) + "\n").encode(), cwd=root)
    sizes = {}
    for line in result.splitlines():
        oid, size = line.split()
        sizes[oid.decode()] = int(size)
    return [{"path": r["path"], "bytes": sizes[r["oid"]]} for r in rows]


def main():
    result = inspect(index_rows(ROOT))
    print(json.dumps(result, indent=2))
    return int(bool(result["failures"]))


if __name__ == "__main__":
    sys.exit(main())
