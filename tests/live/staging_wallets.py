#!/usr/bin/env python3
"""Create two disposable Psy staging users without exposing their private keys."""

import argparse
import hashlib
import json
import os
import secrets
import subprocess
import tempfile
import time
from pathlib import Path


def save_private(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as file:
        json.dump(data, file, indent=2)
        file.write("\n")


def cli(command, key, rpc_config, directory):
    fd, path = tempfile.mkstemp(prefix="result-", suffix=".json", dir=directory)
    os.close(fd)
    result_file = Path(path)
    env = {**os.environ, "PRIVATE_KEY": key, "RPC_CONFIG": str(rpc_config)}
    env.pop("KEYSTORE_PATH", None)
    env.pop("WALLET_PASSWORD", None)
    try:
        result = subprocess.run(
            ["psy_user_cli", *command, "--result-file", str(result_file)],
            env=env, capture_output=True, text=True, timeout=120,
        )
        if result.returncode:
            detail = result.stderr.replace(key, "[redacted]")[-800:]
            raise RuntimeError(f"{' '.join(command)} failed: {detail}")
        return json.loads(result_file.read_text())
    finally:
        result_file.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rpc-config", required=True, type=Path)
    parser.add_argument("--state-dir", type=Path)
    parser.add_argument("--wait-seconds", type=int, default=180)
    args = parser.parse_args()
    rpc_config = args.rpc_config.resolve(strict=True)
    network = json.loads(rpc_config.read_text())
    if network.get("defaultNetwork") != "sepolia":
        raise SystemExit("RPC_CONFIG defaultNetwork must be sepolia staging")
    realms = network["networks"]["sepolia"]["realm_configs"]
    if not all("-stg.psy-protocol.xyz" in url for realm in realms for url in realm["rpc_url"]):
        raise SystemExit("RPC_CONFIG does not target Psy staging realms")

    directory = args.state_dir or Path(tempfile.mkdtemp(prefix="psy-template-staging-"))
    directory.mkdir(mode=0o700, exist_ok=True)
    if directory.stat().st_mode & 0o077:
        raise SystemExit("State directory must be private (mode 0700)")
    state_path = directory / "wallets.json"
    if state_path.exists():
        wallets = json.loads(state_path.read_text())
    else:
        wallets = {
            "network_config_sha256": hashlib.sha256(rpc_config.read_bytes()).hexdigest(),
            "users": [{"private_key": secrets.token_hex(32)} for _ in range(2)],
        }
        save_private(state_path, wallets)

    for index, user in enumerate(wallets["users"]):
        if not user.get("public_key_hash"):
            info = cli(["wallet", "info"], user["private_key"], rpc_config, directory)
            user["public_key_hash"] = info["public_key_hash"]
            save_private(state_path, wallets)
        if not user.get("registration_submitted"):
            result = cli(["register-user"], user["private_key"], rpc_config, directory)
            user["registration_submitted"] = result.get("transaction_hash") or "already_registered"
            if result.get("user_id") is not None:
                user["user_id"] = result["user_id"]
            save_private(state_path, wallets)
        print(f"user {index}: public_key_hash={user['public_key_hash']} registration={user['registration_submitted']}", flush=True)

    deadline = time.monotonic() + args.wait_seconds
    while time.monotonic() < deadline:
        for index, user in enumerate(wallets["users"]):
            if user.get("user_id") is not None:
                continue
            result = cli(
                ["get-user-id", "--pub-key", user["public_key_hash"]],
                user["private_key"], rpc_config, directory,
            )
            if result.get("status") == "registered" and result.get("user_id") is not None:
                user["user_id"] = result["user_id"]
                save_private(state_path, wallets)
                print(f"user {index}: registered user_id={user['user_id']}", flush=True)
        if all(user.get("user_id") is not None for user in wallets["users"]):
            print(f"state_dir={directory}", flush=True)
            return
        time.sleep(5)
    print(f"registration pending; resume with --state-dir {directory}", flush=True)
    raise SystemExit(2)


if __name__ == "__main__":
    main()
