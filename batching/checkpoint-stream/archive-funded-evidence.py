"""Publish the explicit, public-only deterministic bootstrap evidence cohort.

This archives proof bytes and public session projections, never hydrated signing
witnesses, wallets, binaries or dependency source trees. No financial authority
or independent proof verification is provided by an archive checksum.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

FORBIDDEN = {"private_key", "privateKey", "secret_key", "secretKey", "mnemonic",
             "recoveryPhrase", "signing_witness", "signature_witness", "cfc_witness",
             "secp256k1_slots"}
STAGE = {"source.json", "current.json", "intent.json", "plan.json", "request.json",
         "public-session.json", "verification.json", "key-proof.bin"}
PUBLIC = set("""ACTIVE-v1.json ACTIVE-v2.json CLOSED-v1.json CLOSED-v2.json
CONSISTENCY-v1.json FINAL-REVIEW-v1.json INDEPENDENT-VERIFICATION-v1.json PLAN.json
ROOT-CAUSE-v1.json application-v1.json application-v2.json application-v3.json
application-v5.json audit-test-v1.log audit-test-v2.log build-verifier-v1.log
build-vm-v1.log build-vm-v3.log build-vm-v4.log fixtures-build-v1.log
full-ups-v1.raw.log full-ups-v2.raw.log generate-v1.log javascript-v2.log
key-audit-v1.raw.log""".split())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def scan(value):
    if isinstance(value, dict):
        assert not (value.keys() & FORBIDDEN), "secret-bearing public field"
        for child in value.values():
            scan(child)
    elif isinstance(value, list):
        for child in value:
            scan(child)


def archive(case, out):
    case = case.resolve()
    assert not out.exists() and not out.is_symlink(), "fresh output required"
    closed = json.loads((case / "public/CLOSED-v2.json").read_text())
    assert closed["exitCode"] == 0 and not closed["timedOut"]
    assert json.loads((case / "public/CONSISTENCY-v1.json").read_text())["completeUps"] == 4
    files = set()
    for path in (case / "public").iterdir():
        assert path.name in PUBLIC, "review any new public member before publication"
        files.add(path)
    for version in ["v1", "v2"]:
        for stage in (case / ("full-ups-" + version)).iterdir():
            if stage.is_dir():
                files.update(path for path in stage.iterdir() if path.name in STAGE)
            elif stage.name.endswith("-REPORT.json"):
                files.add(stage)
    for version in ["v1", "v2", "v3", "v4", "v5"]:
        base = case / ("application-" + version)
        for name in ["APPLICATION.json", "Cargo.toml", "Cargo.lock", "src/stream_policy.rs",
                     "src/market_key.rs", "src/proof_binding.rs", "src/bin/verify_saved_ups.rs",
                     "tests/support/stream_full_ups.rs", "tests/support/funded_bootstrap_full_ups.rs"]:
            path = base / name
            if path.exists():
                files.add(path)
    base = case / "fixtures-v1"
    files.add(base / "FUNDED-BUILD.json")
    for name in ["native.json", "token/compilation_artifact.json", "nft/compilation_artifact.json"]:
        files.add(base / name)
    for market in ["amm", "bondingcurve"]:
        for name in ["config.json", "main.psy.rs", "compile.log", "policy.json", "stream-policy.json",
                     "FOREIGN_READ_AUDIT.json", "compiled/compilation_artifact.json"]:
            files.add(base / market / name)
    for path in (case / "independent-verification-v1").iterdir():
        assert path.suffix in {".json", ".log"}
        files.add(path)
    out.mkdir(parents=True)
    index = []
    replacements = [(str(case), "<case-root>"), (str(case.parent), "<evidence-root>"),
                    (str(Path.home()), "<home>")]
    for path in sorted(files):
        assert path.is_file() and not path.is_symlink()
        raw = path.read_bytes()
        public = raw
        if path.suffix != ".bin":
            text = raw.decode("utf-8")
            for old, new in replacements:
                text = text.replace(old, new).replace(json.dumps(old)[1:-1], new)
            public = text.encode()
            if path.suffix == ".json":
                scan(json.loads(public))
        name = path.relative_to(case).as_posix()
        compressed = gzip.compress(public, mtime=0)
        destination = out / "files" / (name + ".gz")
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("xb") as stream:
            stream.write(compressed)
        assert gzip.decompress(destination.read_bytes()) == public
        index.append({"source": name, "file": destination.relative_to(out).as_posix(),
                      "originalSha256": sha(raw), "publicSha256": sha(public),
                      "gzipSha256": sha(compressed), "originalBytes": len(raw),
                      "gzipBytes": len(compressed), "redacted": raw != public})
    for name, value in [("index.json", index), ("PUBLISHED-AUDIT.json", {
        "schema": 1, "members": len(index), "gzipBytes": sum(row["gzipBytes"] for row in index),
        "allDigestsVerified": True, "publicFieldScanPassed": True,
        "rawWitnessesIncluded": False, "binariesIncluded": False,
        "financialOperations": 0, "cryptographicVerificationPerformedByArchiver": False})]:
        with (out / name).open("x") as stream:
            json.dump(value, stream, indent=2)
            stream.write("\n")
    return len(index)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("case", type=Path)
    parser.add_argument("fresh_output", type=Path)
    args = parser.parse_args()
    print(archive(args.case, args.fresh_output))
