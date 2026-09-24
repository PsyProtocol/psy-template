#!/usr/bin/env python3
"""Run the NFT template against two disposable users on Psy staging."""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def save(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n")


def run(command, cwd, env, timeout=600, result_file=None):
    result = subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        secret = env.get("PRIVATE_KEY", "")
        detail = result.stdout + "\n" + result.stderr
        if secret:
            detail = detail.replace(secret, "[redacted]")
        detail = detail[-1500:]
        raise RuntimeError(f"{command[0]} failed (exit {result.returncode}): {detail}")
    if result_file:
        return json.loads(result_file.read_text())
    return result


def wallet_env(wallet, rpc_config):
    env = {**os.environ, "PRIVATE_KEY": wallet["private_key"], "RPC_CONFIG": str(rpc_config)}
    env.pop("KEYSTORE_PATH", None)
    env.pop("WALLET_PASSWORD", None)
    if os.environ.get("PSY_TEST_TOOLCHAIN_BIN"):
        env["PATH"] = os.environ["PSY_TEST_TOOLCHAIN_BIN"] + os.pathsep + env["PATH"]
    if os.environ.get("PSY_TEST_CLI"):
        env["PSY_USER_CLI"] = os.environ["PSY_TEST_CLI"]
    return env


def cli_call(method, inputs, contract_id, wallet, rpc_config, directory, wait=True):
    fd, path = tempfile.mkstemp(prefix="call-result-", suffix=".json", dir=directory)
    os.close(fd)
    result_file = Path(path)
    command = [
        os.environ.get("PSY_TEST_CLI", "psy_user_cli"), "call", "--rpc-config", str(rpc_config),
        "--contract-id", str(contract_id), "--method-name", method,
        "--inputs", json.dumps(inputs), "--result-file", str(result_file),
    ]
    if wait:
        command.append("--wait-until-confirmation")
    try:
        result = run(command, directory, wallet_env(wallet, rpc_config), timeout=600, result_file=result_file)
        print(f"{method}: status={result.get('status')} checkpoint={result.get('confirmed_checkpoint')} tx={result.get('transaction_hash')}", flush=True)
        return result
    finally:
        result_file.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--rpc-config", required=True, type=Path)
    parser.add_argument("--phase", choices=("deploy", "flow"), required=True)
    parser.add_argument("--evidence-file", default="evidence.json")
    parser.add_argument("--contract-id", type=int)
    args = parser.parse_args()
    directory = args.state_dir.resolve(strict=True)
    rpc_config = args.rpc_config.resolve(strict=True)
    network = json.loads(rpc_config.read_text())
    if network.get("defaultNetwork") != "sepolia":
        raise SystemExit("RPC_CONFIG must select sepolia staging")
    wallets = json.loads((directory / "wallets.json").read_text())["users"]
    if len(wallets) != 2 or any(not isinstance(w.get("user_id"), int) for w in wallets):
        raise SystemExit("Two registered test users are required")
    evidence_path = directory / args.evidence_file
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else {
        "network": "sepolia staging", "users": [w["user_id"] for w in wallets], "transactions": []
    }

    if args.phase == "deploy":
        project = directory / "nft"
        if not project.exists():
            (project / "src").mkdir(parents=True)
            (project / "scripts").mkdir()
            for name in ("Dargo.toml", "package.json"):
                shutil.copy2(ROOT / "nft" / name, project / name)
            shutil.copy2(ROOT / "nft/src/main.psy", project / "src/main.psy")
        if "contract_id" not in evidence:
            shutil.copy2(ROOT / "nft/src/main.psy.rs", project / "src/main.psy.rs")
            for name in ("configure_issuer.mjs", "deploy_checked.mjs",
                         "build_v3.mjs", "deploy_v3_checked.mjs"):
                shutil.copy2(ROOT / "nft/scripts" / name, project / "scripts" / name)
        issuer_id = wallets[0]["user_id"]
        if "contract_id" not in evidence:
            run(["node", "scripts/configure_issuer.mjs", "--issuer", str(issuer_id)], project,
                wallet_env(wallets[0], rpc_config), timeout=30)
        if "contract_id" not in evidence:
            print(f"Deploying isolated NFT artifact for issuer user_id={issuer_id}...", flush=True)
            run(["node", "scripts/deploy_checked.mjs"], project, wallet_env(wallets[0], rpc_config))
            deployment = json.loads((project / ".psy-deploy-v3.json").read_text())
            if not isinstance(deployment.get("contract_id"), int):
                raise RuntimeError(f"Contract submitted but ID unresolved: {deployment.get('tx_hash')}")
            evidence["contract_id"] = deployment["contract_id"]
            evidence["deployment_tx_hash"] = deployment["tx_hash"]
            save(evidence_path, evidence)
            print(f"Deployed contract_id={evidence['contract_id']} tx={deployment['tx_hash']}", flush=True)
        else:
            print(f"Existing contract_id={evidence['contract_id']}", flush=True)
        return

    contract_id = args.contract_id if args.contract_id is not None else evidence.get("contract_id")
    if not isinstance(contract_id, int):
        raise SystemExit("Run --phase deploy first")
    if evidence.get("contract_id") not in (None, contract_id):
        raise SystemExit("Evidence file belongs to a different contract")
    evidence["contract_id"] = contract_id
    save(evidence_path, evidence)
    flow = [
        ("set_collection_metadata", [0x505359, 11, 22, 33, 44], 0),
        ("mint", [0, 1, 101, 102, 103, 104], 0),
        ("transfer", [0, wallets[1]["user_id"]], 0),
        ("claim", [0, wallets[0]["user_id"]], 1),
        ("transfer", [0, wallets[0]["user_id"]], 1),
        ("claim", [0, wallets[1]["user_id"]], 0),
    ]
    for index in range(len(evidence["transactions"]), len(flow)):
        method, inputs, wallet_index = flow[index]
        print(f"Step {index + 1}/{len(flow)}: user {wallets[wallet_index]['user_id']} {method}", flush=True)
        result = cli_call(method, inputs, contract_id, wallets[wallet_index], rpc_config, directory)
        if result.get("status") != "confirmed":
            raise RuntimeError(f"{method} was not confirmed")
        evidence["transactions"].append({
            "method": method,
            "user_id": wallets[wallet_index]["user_id"],
            "inputs": inputs,
            "transaction_hash": result.get("transaction_hash"),
            "checkpoint": result.get("confirmed_checkpoint"),
        })
        save(evidence_path, evidence)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
