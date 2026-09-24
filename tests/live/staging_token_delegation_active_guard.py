#!/usr/bin/env python3
"""Verify that a fresh post-request spend is rejected by the active-only guard."""

import argparse
import json
from pathlib import Path

from staging_nft_flow import cli_call, save


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--rpc-config", required=True, type=Path)
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    rpc_config = args.rpc_config.resolve(strict=True)
    if json.loads(rpc_config.read_text()).get("defaultNetwork") != "sepolia":
        raise SystemExit("RPC_CONFIG must select sepolia staging")
    contract_id = json.loads((directory / "token-delegation-evidence.json").read_text())["contract_id"]
    owner, spender = json.loads((directory / "wallets.json").read_text())["users"]
    owner_id, spender_id = owner["user_id"], spender["user_id"]
    evidence_path = directory / "token-delegation-active-guard-evidence.json"
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else {
        "contract_id": contract_id,
        "users": [owner_id, spender_id],
        "slot": 2,
        "scenario": "new spend trace generated after owner request is rejected by active-only guard",
    }
    for key, method, inputs, wallet in [
        ("open", "open_delegation_channel", [2, spender_id, 100], owner),
        ("request", "request_revoke_delegation", [2], owner),
    ]:
        if key not in evidence:
            result = cli_call(method, inputs, contract_id, wallet, rpc_config, directory)
            if result.get("status") != "confirmed":
                raise RuntimeError(f"{method} was not confirmed")
            evidence[key] = result
            save(evidence_path, evidence)
            print(f"{method}: confirmed checkpoint {result['confirmed_checkpoint']}", flush=True)
    if "fresh_spend_rejection" not in evidence:
        try:
            cli_call("spend_delegation", [owner_id, 2, 40, owner_id],
                     contract_id, spender, rpc_config, directory)
        except RuntimeError as error:
            if "channel is not active" not in str(error).lower():
                raise RuntimeError(f"Unexpected rejection reason: {error}") from error
            evidence["fresh_spend_rejection"] = "channel is not active"
            save(evidence_path, evidence)
            print("Fresh post-request spend rejected by contract assertion", flush=True)
        else:
            raise RuntimeError("Fresh post-request spend unexpectedly succeeded")
    for key, method, inputs, wallet in [
        ("close", "close_delegation_channel", [owner_id, 2, 1], spender),
        ("finalize", "finalize_revoke_delegation", [2, spender_id], owner),
    ]:
        if key not in evidence:
            result = cli_call(method, inputs, contract_id, wallet, rpc_config, directory)
            if result.get("status") != "confirmed":
                raise RuntimeError(f"{method} was not confirmed")
            evidence[key] = result
            save(evidence_path, evidence)
            print(f"{method}: confirmed checkpoint {result['confirmed_checkpoint']}", flush=True)
    assert evidence["open"]["confirmed_checkpoint"] < evidence["request"]["confirmed_checkpoint"]
    assert evidence["request"]["confirmed_checkpoint"] < evidence["close"]["confirmed_checkpoint"]


if __name__ == "__main__":
    main()
