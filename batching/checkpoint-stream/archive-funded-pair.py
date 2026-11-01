"""Publish only reviewed public pair evidence into a fresh directory.

Checksums do not establish cryptographic validity, ordinary authorization or
network acceptance. Original attempts, including failures, are never modified.
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
             "secp256k1_slots", "signingWitness", "private_key_bytes"}


def scan(value):
    if isinstance(value, dict):
        assert not (value.keys() & FORBIDDEN), "secret-bearing field"
        for child in value.values():
            scan(child)
    elif isinstance(value, list):
        for child in value:
            scan(child)


def archive(case, out):
    case = case.resolve()
    assert not out.exists() and not out.is_symlink(), "fresh publication only"
    closed = json.loads((case / "public/CLOSED-full-v2.json").read_text())
    assert closed["exitCode"] == 0 and closed["stopReason"] is None
    independent = json.loads((case / "public/INDEPENDENT-v1.json").read_text())
    consistency = json.loads((case / "public/CONSISTENCY-v1.json").read_text())
    assert independent["count"] == consistency["completeUps"] == 28
    assert consistency["financialOperations"] == 0
    selected = set()
    for path in (case / "public").iterdir():
        assert path.is_file() and path.suffix in {".json", ".log"}, "review public output"
        selected.add(path)
    for cohort in ["vm-v1", "vm-v2", "vm-v3", "full-v1", "full-v2"]:
        for entry in (case / cohort).iterdir():
            if entry.is_dir():
                selected.update(p for p in entry.iterdir() if p.name in STAGE)
            elif entry.name.endswith("-REPORT.json"):
                selected.add(entry)
    for fixture in ["fixtures-v1", "fixtures-v2"]:
        selected.update(p for p in (case / fixture).rglob("*") if p.is_file()
                        and p.suffix in {".json", ".rs", ".log"})
    for version in range(1, 11):
        app = case / f"application-v{version}"
        selected.update(app / name for name in ["APPLICATION.json", "Cargo.toml", "Cargo.lock"])
        if version in {1, 5, 6, 7, 8, 9, 10}:
            selected.update(p for d in ["src", "tests"] for p in (app / d).rglob("*.rs"))
    selected.update(case / name for name in ["run-v3.py", "run-v5.py", "run-v6.py", "run-v8.py", "run-v10.py", "verify-v1.py"])
    for directory in ["runtime-fixture-v1", "independent-v1"]:
        selected.update(p for p in (case / directory).iterdir() if p.is_file()
                        and p.suffix in {".json", ".log"})
    out.mkdir(parents=True)
    records = []
    for path in sorted(selected):
        assert path.is_file() and not path.is_symlink(), "public regular file required"
        raw = path.read_bytes()
        if path.suffix == ".json":
            scan(json.loads(raw))
        name = path.relative_to(case).as_posix()
        target = Path("files") / (name + ".gz")
        data = gzip.compress(raw, mtime=0)
        (out / target).parent.mkdir(parents=True, exist_ok=True)
        with (out / target).open("xb") as stream:
            stream.write(data)
        assert gzip.decompress((out / target).read_bytes()) == raw
        records.append({"source": name, "file": target.as_posix(),
                        "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
                        "gzipSha256": hashlib.sha256(data).hexdigest()})
    manifest = {"schema": 1, "sdkCommit": "c92880c8b6e2c8d392f19368bc8801a2584fd427",
                "scope": "Conditional synthetic v15 vault UPSs, VM actor prerequisites and explicit transport doubles; not live or production acceptance",
                "completeUps": 28, "exactOriginalRequestsReused": 7, "newContinuationUps": 21,
                "normalHistoryUps": 24, "alternativeHistoryUps": 4,
                "newFinancialOperations": 0, "privateWitnessesIncluded": False,
                "binariesIncluded": False, "records": records}
    with (out / "manifest.json").open("x") as stream:
        json.dump(manifest, stream, indent=2)
        stream.write("\n")
    return {"members": len(records), "rawBytes": sum(r["bytes"] for r in records)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("case", type=Path)
    parser.add_argument("out", type=Path)
    args = parser.parse_args()
    print(json.dumps(archive(args.case, args.out)))
