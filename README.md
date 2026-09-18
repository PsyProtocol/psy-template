# psy-template

Official PSY project templates for [Psy Protocol](https://github.com/PsyProtocol).

Designed for use with `psyup new`.

## Available Templates

| Template | Path | Description | Command |
| :--- | :--- | :--- | :--- |
| **dapp** (default) | `dapp/` | Full-stack React + Vite frontend with a PSY token contract in `contract/` | `psyup new my-app` |
| **token** | `token/` | Pure PSY-20 Fungible Token contract (Mint Authority, Outbox Transfer/Claim, Sui-style Allowance Channels) | `psyup new my-token --template token` |
| **nft** | `nft/` | Pure PSY-721 NFT contract (Unique Token IDs, Mint Authority, Outbox Transfer/Claim) | `psyup new my-nft --template nft` |

---

## Quick Start

### 1. Scaffold a Project

```sh
# Fullstack dApp (default)
psyup new my-app

# Pure PSY-20 Token Contract
psyup new my-token --template token

# Pure PSY-721 NFT Contract
psyup new my-nft --template nft
```

### 2. Build Contracts

Inside any contract directory (or the project root for pure contract templates):

```sh
psyup build
```

This invokes `dargo compile` and generates:
- `target/<name>.json` — Compiled ZK circuit artifact
- `target/<name>.abi.json` — Contract ABI

### 3. Deploy

```sh
psyup deploy
```

---

## Standards Overview

### PSY-20 (Fungible Token)
- **Authority Model**: Features `mint_authority` with support for `renounce_mint_authority` to create permanently capped / fixed-supply tokens.
- **Outbox/Claim Pattern**: High-concurrency, asynchronous pull transfers natively compatible with Psy's Plonky2 partitioned state tree.
- **Allowance Channels**: Safe, sandboxed escrow channels (`open_delegation_channel` / `revoke_delegation_channel`) inspired by Sui, avoiding EVM infinite approval security holes.

### PSY-721 (Non-Fungible Token)
- **Token Slot Indexing**: Per-user array of owned NFT slots.
- **Ownership Verification**: Atomic outbox transfer and recipient claim without global state contention.
