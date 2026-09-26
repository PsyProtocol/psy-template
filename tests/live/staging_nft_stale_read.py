#!/usr/bin/env python3
"""Test an NFT claim trace anchored before a later sender transfer."""
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
    parser.add_argument("--contract-id", required=True, type=int)
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    wallets = json.loads((directory / "wallets.json").read_text())["users"]
    sender, recipient = wallets
    evidence_path = directory / "evidence-v3-stale-nft.json"
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else {
        "network": "sepolia staging", "contract_id": args.contract_id,
        "users": [sender["user_id"], recipient["user_id"]],
    }
    if evidence["contract_id"] != args.contract_id:
        raise SystemExit("Evidence file belongs to another contract")
    trace_file = directory / "stale-nft-claim-trace.json"

    def call(key, method, inputs, wallet):
        if key not in evidence:
            print(key, flush=True)
            evidence[key] = cli_call(method, inputs, args.contract_id, wallet, args.rpc_config, directory)
            save(evidence_path, evidence)

    # After the capacity flow, issuer total_minted=6 with slots 0 and 1 free;
    # recipient owns slots 0..5 and has claimed nonce 7 from issuer.
    call("mint_first", "mint", [0, 7, 107, 207, 307, 407], sender)
    call("transfer_first", "transfer", [0, recipient["user_id"]], sender)

    if "trace" not in evidence:
        print("Generate old NFT claim trace", flush=True)
        result = cli_with_result([
            "generate-tx-trace", "--rpc-config", str(args.rpc_config),
            "--contract-id", str(args.contract_id), "--method-name", "claim",
            "--inputs", json.dumps([6, sender["user_id"]]),
            "--output", str(trace_file),
        ], recipient, args.rpc_config, directory)
        envelope = json.loads(trace_file.read_text())
        trace = json.loads(envelope["trace"]["payload"])
        evidence["trace"] = {
            "start_checkpoint": trace["anchor"]["start_checkpoint_id"],
            "tx_hash": result.get("tx_hash"),
            "sha256": hashlib.sha256(trace_file.read_bytes()).hexdigest(),
        }
        save(evidence_path, evidence)

    call("mint_second", "mint", [1, 8, 108, 208, 308, 408], sender)
    call("transfer_second", "transfer", [1, recipient["user_id"]], sender)
    if evidence["transfer_second"]["confirmed_checkpoint"] <= evidence["trace"]["start_checkpoint"]:
        raise RuntimeError("Sender update did not occur after the old trace anchor")

    if "old_trace_result" not in evidence:
        print("Submit old NFT claim trace after sender update", flush=True)
        result = cli_with_result([
            "prove-tx-trace", "--rpc-config", str(args.rpc_config),
            "--input", str(trace_file), "--wait",
        ], recipient, args.rpc_config, directory)
        evidence["old_trace_result"] = result
        save(evidence_path, evidence)
    call("fresh_claim", "claim", [7, sender["user_id"]], recipient)
    call("final_ack", "acknowledge", [recipient["user_id"]], sender)

    old = evidence["old_trace_result"]
    fresh = evidence["fresh_claim"]
    if old.get("status") != "confirmed" or fresh.get("status") != "confirmed":
        raise RuntimeError("Both NFT claims must confirm")
    if old.get("transaction_hash") != evidence["trace"]["tx_hash"]:
        raise RuntimeError("Confirmed transaction differs from saved old trace")
    if not (evidence["trace"]["start_checkpoint"]
            < evidence["transfer_second"]["confirmed_checkpoint"]
            < old["confirmed_checkpoint"] < fresh["confirmed_checkpoint"]):
        raise RuntimeError("Historical trace ordering not demonstrated")
    print("Historical NFT trace accepted after sender update; fresh next claim also confirmed", flush=True)


if __name__ == "__main__":
    main()
