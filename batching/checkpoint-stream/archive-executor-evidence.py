"""Archive an allowlisted public Executor/UPS cohort without wallets or witnesses.

Checksums establish publication integrity, not proof validity or live acceptance.
Original files and earlier failed cohorts are never changed.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

STAGE = {"request.json", "verification.json", "source.json", "current.json",
         "intent.json", "plan.json", "public-session.json", "key-proof.bin"}
FORBIDDEN = {"private_key", "privateKey", "secret_key", "secretKey", "mnemonic",
             "recoveryPhrase", "signing_witness", "signature_witness", "cfc_witness",
             "secp256k1_slots"}


def scan(value):
    if isinstance(value, dict):
        assert not (value.keys() & FORBIDDEN), "secret-bearing field"
        for child in value.values():
            scan(child)
    elif isinstance(value, list):
        for child in value:
            scan(child)


def archive(case, fixtures, out):
    assert not out.exists() and not out.is_symlink(), "fresh publication only"
    closed = json.loads((case / "public/CLOSED-v2.json").read_text())
    assert closed["exitCode"] == 0 and closed["stopReason"] is None
    assert json.loads((case / "lifecycle-v2/REPORT.json").read_text())["completeUps"] == 12
    assert json.loads((case / "public/INDEPENDENT-v10.json").read_text())["count"] == 20
    selected = list((case / "public").glob("*.json")) + list((case / "public").glob("*.log"))
    selected += list((case / "public/independent-v10").iterdir())
    for cohort in ["lifecycle-v1", "lifecycle-v2"]:
        for stage in (case / cohort).iterdir():
            if stage.is_dir():
                selected.extend(p for p in stage.iterdir() if p.name in STAGE)
            elif stage.name == "REPORT.json":
                selected.append(stage)
    selected += list((case / "runtime-fixture-v1").iterdir())
    for version in [4, 7, 10, 12]:
        base = case / f"application-v{version}"
        for name in ["APPLICATION.json", "Cargo.toml", "Cargo.lock"]:
            selected.append(base / name)
        selected += [p for d in ["src", "tests"] for p in (base / d).rglob("*.rs")]
    selected += [case / name for name in ["run-lifecycle-v1.py", "run-lifecycle-v2.py",
                 "read-current-v1.py", "read-current-node-v1.mjs", "read-current-node-v2.mjs"]]
    selected += [p for p in fixtures.rglob("*") if p.is_file() and
                 (p.suffix in {".json", ".rs"} or p.name == "main.psy.rs")]
    records = []
    out.mkdir(parents=True)
    for p in sorted(set(selected)):
        assert p.is_file() and not p.is_symlink(), "public regular file required"
        source = ("fixtures/" + str(p.relative_to(fixtures))) if p.is_relative_to(fixtures) else str(p.relative_to(case))
        raw = p.read_bytes()
        if p.suffix == ".json":
            if not raw:
                assert p.name in {"CONSISTENCY-v2.json", "CONSISTENCY-v3.json"}, "review unexpected empty JSON"
            else:
                scan(json.loads(raw))
        digest = hashlib.sha256(raw).hexdigest()
        target = Path("files") / (source + ".gz")
        data = gzip.compress(raw, mtime=0)
        (out / target).parent.mkdir(parents=True, exist_ok=True)
        (out / target).write_bytes(data)
        records.append({"source": source, "file": str(target), "sha256": digest,
                        "bytes": len(raw), "gzipSha256": hashlib.sha256(data).hexdigest()})
    manifest = {"schema": 1, "scope": "Public synthetic UPS, code and transport evidence; not deployed/UI acceptance",
                "sdkCommit": "c92880c8b6e2c8d392f19368bc8801a2584fd427",
                "completeUpsFinalCohort": 12, "preservedEarlierUps": 8,
                "newFinancialOperations": 0, "records": records}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return {"records": len(records), "rawBytes": sum(r["bytes"] for r in records)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("case", type=Path)
    parser.add_argument("fixtures", type=Path)
    parser.add_argument("out", type=Path)
    args = parser.parse_args()
    print(json.dumps(archive(args.case.resolve(), args.fixtures.resolve(), args.out)))
