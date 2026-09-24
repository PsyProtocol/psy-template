#!/usr/bin/env python3
"""Submit an old cross-realm read trace after the sender state changes."""

import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path

from staging_nft_flow import cli_call, run, save, wallet_env
from staging_token_flow import snapshot


def cli_with_result(command, wallet, rpc_config, directory, timeout=600):
    fd, path = tempfile.mkstemp(prefix="trace-result-", suffix=".json", dir=directory)
    os.close(fd)
    result_file = Path(path)
    try:
        return run(
            [os.environ.get("PSY_TEST_CLI", "psy_user_cli"), *command,
             "--result-file", str(result_file)],
            directory, wallet_env(wallet, rpc_config), timeout=timeout,
            result_file=result_file,
        )
    finally:
        result_file.unlink(missing_ok=True)


def verify(evidence):
    sender_id, recipient_id = map(str, evidence["users"])
    first = evidence["first_transfer"]
    second = evidence["second_transfer"]
    old = evidence["old_trace_result"]
    fresh = evidence["fresh_claim"]
    if any(tx.get("status") != "confirmed" for tx in (first, second, old, fresh)):
        raise AssertionError("All four transactions must be confirmed")
    if not (first["confirmed_checkpoint"] < evidence["trace"]["start_checkpoint"]
            < second["confirmed_checkpoint"] < old["confirmed_checkpoint"]
            < fresh["confirmed_checkpoint"]):
        raise AssertionError("The historical trace was not submitted after the sender update")
    if old["transaction_hash"] != evidence["trace"]["tx_hash"]:
        raise AssertionError("The confirmed historical transaction differs from the saved trace")

    before = evidence["before"]["balances"]
    after_old = evidence["after_old_trace"]["balances"]
    after_fresh = evidence["after_fresh_claim"]["balances"]
    old_gain = after_old[recipient_id]["balance_felt"] - before[recipient_id]["balance_felt"]
    fresh_gain = after_fresh[recipient_id]["balance_felt"] - after_old[recipient_id]["balance_felt"]
    if not (0 < old_gain <= 20_000_000_000 and 0 < fresh_gain <= 30_000_000_000):
        raise AssertionError(f"Unexpected recipient gains: old={old_gain}, fresh={fresh_gain}")
    if after_old[sender_id]["balance_felt"] >= before[sender_id]["balance_felt"]:
        raise AssertionError("The sender state did not change after the trace was generated")
    if after_fresh[sender_id]["balance_felt"] != after_old[sender_id]["balance_felt"]:
        raise AssertionError("The fresh recipient claim unexpectedly changed sender balance")
    print(f"Verified historical claim gain={old_gain}; fresh claim gain={fresh_gain}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--rpc-config", required=True, type=Path)
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    rpc_config = args.rpc_config.resolve(strict=True)
    if json.loads(rpc_config.read_text()).get("defaultNetwork") != "sepolia":
        raise SystemExit("RPC_CONFIG must select sepolia staging")
    wallets = json.loads((directory / "wallets.json").read_text())["users"]
    sender, recipient = wallets
    user_ids = [sender["user_id"], recipient["user_id"]]
    evidence_path = directory / "stale-read-evidence.json"
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else {
        "network": "sepolia staging", "contract_id": 0, "users": user_ids,
        "source": "generate-tx-trace then prove-tx-trace with the sender updated between them",
    }
    trace_file = directory / "stale-claim-trace.json"

    if "before" not in evidence:
        evidence["before"] = snapshot(user_ids, rpc_config, directory)
        save(evidence_path, evidence)
    if "first_transfer" not in evidence:
        print("First sender transfer: 20,000,000,000", flush=True)
        evidence["first_transfer"] = cli_call(
            "simple_transfer", [recipient["user_id"], 20_000_000_000],
            0, sender, rpc_config, directory,
        )
        save(evidence_path, evidence)

    if "trace" not in evidence:
        print("Generating recipient claim trace before next sender update...", flush=True)
        result = cli_with_result([
            "generate-tx-trace", "--rpc-config", str(rpc_config),
            "--contract-id", "0", "--method-name", "simple_claim",
            "--inputs", json.dumps([sender["user_id"]]),
            "--output", str(trace_file),
        ], recipient, rpc_config, directory)
        envelope = json.loads(trace_file.read_text())
        trace = json.loads(envelope["trace"]["payload"])
        evidence["trace"] = {
            "start_checkpoint": trace["anchor"]["start_checkpoint_id"],
            "tx_hash": result.get("tx_hash"),
            "sha256": hashlib.sha256(trace_file.read_bytes()).hexdigest(),
        }
        save(evidence_path, evidence)
        print("Trace start checkpoint", evidence["trace"]["start_checkpoint"], flush=True)

    if "second_transfer" not in evidence:
        print("Second sender transfer: 30,000,000,000", flush=True)
        evidence["second_transfer"] = cli_call(
            "simple_transfer", [recipient["user_id"], 30_000_000_000],
            0, sender, rpc_config, directory,
        )
        save(evidence_path, evidence)
    second_checkpoint = evidence["second_transfer"].get("confirmed_checkpoint")
    if not isinstance(second_checkpoint, int) or second_checkpoint <= evidence["trace"]["start_checkpoint"]:
        raise RuntimeError("Sender update did not confirm after the trace's checkpoint")

    if "old_trace_result" not in evidence:
        print(f"Proving old recipient trace after sender checkpoint {second_checkpoint}...", flush=True)
        try:
            result = cli_with_result([
                "prove-tx-trace", "--rpc-config", str(rpc_config),
                "--input", str(trace_file), "--wait",
            ], recipient, rpc_config, directory)
            evidence["old_trace_result"] = result
            evidence["after_old_trace"] = snapshot(user_ids, rpc_config, directory)
            save(evidence_path, evidence)
            print("Old trace", result.get("status"), "checkpoint", result.get("confirmed_checkpoint"), flush=True)
        except Exception as error:
            evidence["old_trace_error"] = str(error)
            save(evidence_path, evidence)
            raise

    if "fresh_claim" not in evidence:
        print("Claiming the second transfer with a fresh trace...", flush=True)
        evidence["fresh_claim"] = cli_call(
            "simple_claim", [sender["user_id"]], 0, recipient, rpc_config, directory,
        )
        evidence["after_fresh_claim"] = snapshot(user_ids, rpc_config, directory)
        save(evidence_path, evidence)
        print("Fresh claim", evidence["fresh_claim"].get("status"), flush=True)
    verify(evidence)


if __name__ == "__main__":
    main()
