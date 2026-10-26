#!/usr/bin/env python3
"""Readonly complete tracked-gzip language inventory; never rewrite raw evidence."""
import argparse
import collections
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import time

from check_language import HAN, ROOT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="Fresh report path; refuses overwrite")
    args = parser.parse_args()
    if args.out and args.out.exists():
        parser.error("output already exists; preserve the original")
    start = time.monotonic()
    stats = collections.Counter()
    groups = collections.Counter()
    unique = {}
    failures = []
    paths = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
    for rel in paths:
        if not rel.endswith(".gz"):
            continue
        raw = (ROOT / rel).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        stats["files"] += 1
        stats["compressedBytes"] += len(raw)
        if digest not in unique:
            try:
                data = gzip.decompress(raw)
                try:
                    contains = bool(HAN.search(data.decode("utf-8")))
                    binary = False
                except UnicodeDecodeError:
                    contains, binary = False, True
                unique[digest] = (len(data), contains, binary)
            except (OSError, EOFError) as error:
                failures.append({"path": rel, "error": type(error).__name__})
                continue
        size, contains, binary = unique[digest]
        stats["uncompressedBytes"] += size
        stats["binaryFiles"] += binary
        if contains:
            stats["filesWithHan"] += 1
            groups[rel.split("/")[0]] += 1
    report = {
        "schema": 1,
        "scope": "All tracked gzip containers; exact duplicates decoded once; no evidence mutation",
        "stats": dict(stats),
        "uniquePayloads": len(unique),
        "groupsWithHan": dict(groups),
        "failures": failures,
        "wallSeconds": time.monotonic() - start,
        "mutations": 0,
    }
    text = json.dumps(report, indent=2) + "\n"
    if args.out:
        with args.out.open("x") as stream:
            stream.write(text)
    print(text, end="")
    return bool(failures)


if __name__ == "__main__":
    raise SystemExit(main())
