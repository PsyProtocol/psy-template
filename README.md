# psy-template

Official PSY project templates for [Psy Protocol](https://github.com/PsyProtocol).

Designed for use with `psyup new`.

For a full breakdown of the ZK-native partitioned state model, Plonky2 Goldilocks arithmetic, Outbox/Claim protocols, and formal security invariants, see the [Design Specification](DESIGN.md).

---

## Available Templates

| Template | Path | Description | Command |
| :--- | :--- | :--- | :--- |
| **dapp** (default) | `dapp/` | Full-stack React + Vite frontend with a PSY token contract in `contract/` | `psyup new my-app` |
| **token** | `token/` | Pure PSY-20 Fungible Token contract (Mint Authority, Outbox Transfer/Claim, Sandboxed Delegation Channels, Shielded Private Transfer) | `psyup new my-token --template token` |
| **nft** | `nft/` | Pure PSY-721 NFT contract (Unique Token IDs, Mint Authority, Outbox Transfer/Claim) | `psyup new my-nft --template nft` |

---

## Prerequisites & Installation

To install or update the Psyup toolchain:

```sh
# Install psyup and core ZK compiler binaries
curl -fsSL https://raw.githubusercontent.com/PsyProtocol/psyup/main/install.sh | bash

# Ensure ~/.psy/bin is in your PATH
export PATH="$HOME/.psy/bin:$PATH"
```

---

## Quick Start

### 1. Scaffold a Project

```sh
# Fullstack dApp with React UI + contract (default)
psyup new my-app

# Pure PSY-20 Fungible Token Contract
psyup new my-token --template token

# Pure PSY-721 NFT Contract
psyup new my-nft --template nft
```

### 2. Build Contracts

Inside any contract directory (or project root for pure contract templates):

```sh
psyup build
```

This invokes `dargo compile` and generates:
- `target/<name>.json` — Compiled ZK circuit artifact
- `target/<name>.abi.json` — Contract Application Binary Interface (ABI)

### 3. Deploy

```sh
psyup deploy
```

---

## Operations Guide & Documentation

Each template includes a comprehensive, step-by-step operational guide:

- **[PSY-20 Token Guide](token/README.md)**:
  - **Minting & Supply Management**: Initial issuance and supply renunciation (`renounce_mint_authority`).
  - **Outbox Transfer & Claim**: High-concurrency pull payments eliminating global state race conditions.
  - **Sandboxed Delegation Channels**: Scoped spending budgets for AI Agents and bots (`open_delegation_channel` $\to$ `spend_delegation` $\to$ `revoke_delegation_channel`).
  - **Shielded Private Transfer**: Zero-knowledge note commitments on a 20-level Incremental Merkle Tree (`private_transfer`).
- **[PSY-721 NFT Guide](nft/README.md)**:
  - **Slot-Based Ownership**: Unique token slot management up to 128 slots.
  - **Outbox Transfer & Claim**: Conflict-free cross-user NFT routing.
- **[Full-Stack dApp Guide](dapp/README.md)**:
  - **Vite + React Integration**: Browser extension connection via `window.psy`.
  - **SDK Builders**: Strongly-typed transaction construction via `@psy-protocol/psy-sdk`.
- **[Design Specification](DESIGN.md)**:
  - Formal mathematical invariants, Plonky2 Goldilocks arithmetic, and state partitioning axioms.

---

## Standards Overview

### PSY-20 (Fungible Token)
- **Authority Model**: Features `mint_authority` with support for `renounce_mint_authority` to create permanently capped / fixed-supply tokens.
- **Outbox/Claim Pattern**: High-concurrency, asynchronous pull transfers natively compatible with Psy's Plonky2 partitioned state tree.
- **Delegation Channels**: Safe, sandboxed escrow channels (`open_delegation_channel` / `spend_delegation` / `revoke_delegation_channel`) enabling scoped third-party spending with isolated balance reservation and deterministic refunds.
- **Shielded Private Transfer**: Zero-knowledge note commitments (`private_transfer`) folded into a 20-level Incremental Merkle Tree (IMT), providing on-chain privacy for token transfers.

### PSY-721 (Non-Fungible Token)
- **Token Slot Indexing**: Per-user array of owned NFT slots.
- **Ownership Verification**: Atomic outbox transfer and recipient claim without global state contention.

---

## Testing & Verification

The repository includes both native ZK contract unit tests and end-to-end integration suites:

```sh
# Run the complete test matrix (Unit + E2E)
npm test

# Run native Plonky2 ZK contract unit tests via dargo test
npm run test:unit

# Run full end-to-end multi-user state & invariant simulation suites
npm run test:e2e
```

### Direct CLI Unit Testing

You can also run individual contract unit tests directly using the `dargo` compiler toolchain:

```sh
# PSY-20 Token Unit Tests (ZK Witness Generation + Proving Assertions)
dargo test --file token/tests/token_unit_test.psy

# PSY-721 NFT Unit Tests
dargo test --file nft/tests/nft_unit_test.psy
```
