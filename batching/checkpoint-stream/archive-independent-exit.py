"""Publish a fresh explicit public projection; never copy wallets or witnesses.

Archive hashes establish integrity, not verification or real-network acceptance.
Failed attempts remain separate from the final successful synthetic cohort.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

FORBIDDEN = {"private_key", "privateKey", "secret_key", "secretKey", "mnemonic",
             "recoveryPhrase", "signing_witness", "signature_witness", "cfc_witness",
             "secp256k1_slots", "signingWitness", "private_key_bytes"}
STAGE = {"request.json", "verification.json", "source.json", "current.json",
         "intent.json", "plan.json", "public-session.json", "key-proof.bin"}


def scan(value):
    if isinstance(value, dict):
        assert not (value.keys() & FORBIDDEN), "secret-bearing public field"
        for child in value.values():
            scan(child)
    elif isinstance(value, list):
        for child in value:
            scan(child)


def archive(case, output):
    case = case.resolve()
    assert not output.exists() and not output.is_symlink(), "fresh publication only"
    audit = json.loads((case / "public/CONSISTENCY-v3.json").read_text())
    independent = json.loads((case / "public/INDEPENDENT-v1.json").read_text())
    assert audit["completeUps"] == independent["count"]
    assert audit["financialOperations"] == 0
    assert audit["correctedCompleteUps"] == independent["correctedCount"]
    assert audit["quarantinedCompleteUps"] == independent["quarantinedCount"]
    files = set()
    for path in (case / "public").iterdir():
        assert path.is_file() and path.suffix in {".json", ".log"}, "review public member"
        files.add(path)
    for name in audit["cohorts"]:
        for path in (case / name).iterdir():
            if path.is_dir():
                assert all(p.name in STAGE for p in path.iterdir()), "unreviewed stage member"
                files.update(path.iterdir())
            else:
                assert path.name.endswith("-REPORT.json"), "unreviewed cohort member"
                files.add(path)
    for directory in audit["fixtureDirectories"]:
        for path in (case / directory).rglob("*"):
            if path.is_file():
                assert path.suffix in {".json", ".rs", ".log"}, "unreviewed fixture member"
                files.add(path)
    for app in case.glob("application-v*"):
        files.update(app / name for name in ["APPLICATION.json", "Cargo.toml", "Cargo.lock"])
        files.update(p for directory in ["src", "tests"] for p in (app / directory).rglob("*.rs"))
    files.update(case / name for name in audit["publicScripts"])
    for directory in audit["verificationDirectories"]:
        for path in (case / directory).rglob("*"):
            if path.is_file():
                assert path.suffix in {".json", ".log", ".bin"}, "unreviewed verifier member"
                assert path.suffix != ".bin" or path.name == "stream-sign-proof.bin", "public proof only"
                files.add(path)
    output.mkdir(parents=True)
    rows = []
    for path in sorted(files):
        assert path.is_file() and not path.is_symlink(), "regular public file only"
        data = path.read_bytes()
        if path.suffix == ".json":
            scan(json.loads(data))
        name = path.relative_to(case).as_posix()
        dest = Path("files") / (name + ".gz")
        compressed = gzip.compress(data, mtime=0)
        (output / dest).parent.mkdir(parents=True, exist_ok=True)
        with (output / dest).open("xb") as stream:
            stream.write(compressed)
        assert gzip.decompress((output / dest).read_bytes()) == data
        rows.append({"source": name, "file": dest.as_posix(), "bytes": len(data),
                     "sha256": hashlib.sha256(data).hexdigest(),
                     "gzipSha256": hashlib.sha256(compressed).hexdigest()})
    manifest = {"schema": 1, "sdkCommit": "c92880c8b6e2c8d392f19368bc8801a2584fd427",
                "scope": "Synthetic bytecode/key/UPS exit cohort; quarantined and corrected records remain separate; no network or extension acceptance",
                "quarantinedCompleteUps": audit["quarantinedCompleteUps"],
                "correctedCompleteUps": audit["correctedCompleteUps"],
                "correctedOrdinaryClaimUps": audit["correctedOrdinaryClaimUps"],
                "correctedOrdinaryOwnerApprovalUps": audit["correctedOrdinaryOwnerApprovalUps"],
                "completeUps": audit["completeUps"], "ordinaryClaimUps": audit["ordinaryClaimUps"],
                "newFinancialOperations": 0, "privateWitnessesIncluded": False,
                "binariesIncluded": False, "records": rows}
    with (output / "manifest.json").open("x") as stream:
        json.dump(manifest, stream, indent=2)
        stream.write("\n")
    return {"members": len(rows), "rawBytes": sum(row["bytes"] for row in rows)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("case", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(json.dumps(archive(args.case, args.output)))
