#!/usr/bin/env python3
"""Prove an old owner-authorization read after the owner changes its slot."""

import argparse
import hashlib
import json
from pathlib import Path

from staging_nft_flow import cli_call, save
from staging_stale_read import cli_with_result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--rpc-config", required=True, type=Path)
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    rpc_config = args.rpc_config.resolve(strict=True)
    main_evidence = json.loads((directory / "token-delegation-evidence.json").read_text())
    wallets = json.loads((directory / "wallets.json").read_text())["users"]
    owner, spender = wallets
    owner_id, spender_id = owner["user_id"], spender["user_id"]
    contract_id = main_evidence["contract_id"]
    evidence_path = directory / "token-delegation-stale-evidence.json"
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else {
        "contract_id": contract_id, "users": [owner_id, spender_id], "slot": 1,
        "scenario": "spender trace anchored to ACTIVE owner slot, submitted after owner REVOKE_PENDING update",
    }
    trace_file = directory / "token-delegation-old-owner-read.json"

    if "open" not in evidence:
        evidence["open"] = cli_call("open_delegation_channel", [1, spender_id, 100],
                                     contract_id, owner, rpc_config, directory)
        save(evidence_path, evidence)
    if "trace" not in evidence:
        result = cli_with_result([
            "generate-tx-trace", "--rpc-config", str(rpc_config),
            "--contract-id", str(contract_id), "--method-name", "spend_delegation",
            "--inputs", json.dumps([owner_id, 1, 40, owner_id]),
            "--output", str(trace_file),
        ], spender, rpc_config, directory)
        envelope = json.loads(trace_file.read_text())
        trace = json.loads(envelope["trace"]["payload"])
        evidence["trace"] = {
            "start_checkpoint": trace["anchor"]["start_checkpoint_id"],
            "tx_hash": result.get("tx_hash"),
            "sha256": hashlib.sha256(trace_file.read_bytes()).hexdigest(),
        }
        save(evidence_path, evidence)
        print("Old spend trace anchored at", evidence["trace"]["start_checkpoint"], flush=True)
    if "request" not in evidence:
        evidence["request"] = cli_call("request_revoke_delegation", [1],
                                       contract_id, owner, rpc_config, directory)
        save(evidence_path, evidence)
    assert evidence["request"]["confirmed_checkpoint"] > evidence["trace"]["start_checkpoint"]
    if "historical_spend" not in evidence:
        print("Proving the old spend trace after the owner requested revocation", flush=True)
        evidence["historical_spend"] = cli_with_result([
            "prove-tx-trace", "--rpc-config", str(rpc_config),
            "--input", str(trace_file), "--wait",
        ], spender, rpc_config, directory)
        save(evidence_path, evidence)
    assert evidence["historical_spend"]["status"] == "confirmed"
    assert evidence["historical_spend"]["transaction_hash"] == evidence["trace"]["tx_hash"]
    assert evidence["historical_spend"]["confirmed_checkpoint"] > evidence["request"]["confirmed_checkpoint"]
    if "claim" not in evidence:
        evidence["claim"] = cli_call("claim", [spender_id], contract_id, owner, rpc_config, directory)
        save(evidence_path, evidence)
    if "close" not in evidence:
        evidence["close"] = cli_call("close_delegation_channel", [owner_id, 1, 1],
                                     contract_id, spender, rpc_config, directory)
        save(evidence_path, evidence)
    if "finalize" not in evidence:
        evidence["finalize"] = cli_call("finalize_revoke_delegation", [1, spender_id],
                                        contract_id, owner, rpc_config, directory)
        save(evidence_path, evidence)
    print("Historical spend result:", evidence["historical_spend"].get("status"),
          "checkpoint:", evidence["historical_spend"].get("confirmed_checkpoint"), flush=True)


if __name__ == "__main__":
    main()
