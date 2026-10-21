"""Read-only integrity check for archiveCompact.py evidence (not proof verification).

Run against a reviewed Git checkout. Hash agreement establishes artifact
integrity, not authentic runtime identity, proof validity or production safety.
"""
import argparse
import gzip
import hashlib
import json
import pathlib
import re


def require(condition, message):
    if not condition:
        raise ValueError(message)


def local_file(root, name):
    path = pathlib.Path(name)
    require(not path.is_absolute() and ".." not in path.parts, "unsafe archive path")
    candidate = root / path
    require(candidate.resolve().is_relative_to(root), "path escapes root")
    require(not any((root / pathlib.Path(*path.parts[:i])).is_symlink()
                    for i in range(1, len(path.parts) + 1)), "symlink forbidden")
    require(candidate.is_file(), "missing evidence file: " + name)
    return candidate


def verify(directory, original=None):
    root = pathlib.Path(directory).resolve()
    origin = pathlib.Path(original).resolve() if original else None
    manifest = json.loads(local_file(root, "manifest.json").read_bytes())
    require(manifest.get("schema") == 1, "unsupported archive schema")
    require(manifest.get("walletFilesIncluded") is False, "wallet exclusion missing")
    require(manifest.get("sealedBinariesIncluded") is False, "binary exclusion missing")
    records = manifest.get("records")
    require(isinstance(records, list) and records, "empty or invalid archive")
    sources, files, raw_total, gzip_total = set(), set(), 0, 0
    for record in records:
        source, filename = record["source"], record["file"]
        require(not pathlib.Path(source).is_absolute() and ".." not in pathlib.Path(source).parts, "unsafe archive path")
        require(source not in sources and filename not in files, "duplicate evidence path")
        require(".secrets" not in pathlib.Path(source).parts, "wallet path forbidden")
        require(filename == "files/" + source + ".gz", "archive/source path mismatch")
        sources.add(source)
        files.add(filename)
        size = record["bytes"]
        require(type(size) is int and 0 <= size <= 512 * 1024 * 1024, "invalid raw size")
        for key in ("sha256", "gzipSha256"):
            require(isinstance(record[key], str) and re.fullmatch(r"[0-9a-f]{64}", record[key]), "invalid digest")
        packed = local_file(root, filename).read_bytes()
        require(len(packed) == record["gzipBytes"], "compressed size mismatch: " + source)
        require(hashlib.sha256(packed).hexdigest() == record["gzipSha256"], "compressed hash mismatch: " + source)
        # Bound decompression by the declared size; do not allocate an
        # unbounded gzip stream before checking its contents.
        with gzip.open(local_file(root, filename), "rb") as stream:
            raw = stream.read(size + 1)
        require(len(raw) == size, "raw size mismatch: " + source)
        require(hashlib.sha256(raw).hexdigest() == record["sha256"], "raw hash mismatch: " + source)
        if origin:
            require(local_file(origin, source).read_bytes() == raw, "original differs: " + source)
        raw_total += size
        gzip_total += len(packed)
    actual = {str(p.relative_to(root)) for p in (root / "files").rglob("*.gz")}
    require(actual == files, "unlisted or missing gzip files")
    return {"files": len(records), "bytes": raw_total, "gzipBytes": gzip_total,
            "originalsCompared": origin is not None,
            "scope": "artifact integrity only; no cryptographic UPS, runtime or production attestation"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=pathlib.Path)
    parser.add_argument("--original-base", type=pathlib.Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.archive, args.original_base)))
