# psy-template

Official PSY project templates for [Psy Protocol](https://github.com/PsyProtocol).

> **Maturity 定调**: `psy-template` 目前处于从**原理验证向高确定性安全子集收敛**阶段，尚未达到主网生产就绪（Not Mainnet Production Ready）。

Designed for use with `psyup new`.

For a full breakdown of the ZK-native partitioned state model, Plonky2 Goldilocks arithmetic, Outbox/Claim protocols, and formal security invariants, see the [Design Specification](DESIGN.md).

---

## Available Templates

| Template | Path | Description | Command |
| :--- | :--- | :--- | :--- |
| **dapp** (default) | `dapp/` | Full-stack React + Vite frontend with a PSY token contract in `contract/` | `psyup new my-app` |
| **token** | `token/` | Pure PSY-20 Fungible Token contract (Phase 1 Safe Subset: liquid balance, Outbox Transfer/Claim, Batched Transfers, strict Goldilocks arithmetic) | `psyup new my-token --template token` |
| **nft** | `nft/` | Pure PSY-721 NFT contract (Computational Namespace Uniqueness, Slot Storage, Sliding Window Outbox with ACK Visibility) | `psyup new my-nft --template nft` |

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

### 2. Configure Issuer Partition (Mandatory Preflight)

In Psy Protocol, asset issuance and administration are strictly locked to a single, compile-time designated partition (`ISSUER_USER_ID`) and the cryptographic deployer public key.

> [!WARNING]
> You **MUST** configure `ISSUER_USER_ID` to match your actual on-chain account's `user_id` before building and deploying. If deployed with a mismatched ID, the contract will permanently reject initialization and minting from your account, bricking the deployment.

```sh
# Set canonical ISSUER_USER_ID to your registered on-chain user ID:
npm run configure -- --issuer <YOUR_USER_ID>

# Strict deployment preflight check (verifies explicit configuration record via .issuer_configured):
npm run check:preflight
```

> [!NOTE]
> **Toolchain Boundary**: `npm run check:preflight` and `npm run build:deploy` provide application-layer preflight verification. Running `psyup build` or `psyup deploy` directly in your terminal bypasses these npm scripts. Mandatory deployment verification is not yet closed under the current toolchain.

### 3. Build Contracts

Inside any contract directory (or project root for pure contract templates):

```sh
# Build with deployment preflight check (blocks compilation if unconfigured):
npm run build:deploy

# Or standard build:
psyup build
```

This invokes `dargo compile` and generates:
- `target/<name>.json` — Compiled ZK circuit artifact
- `target/<name>.abi.json` — Contract Application Binary Interface (ABI)

### 4. Deploy

```sh
psyup deploy
```

---

## Operations Guide & Documentation

Each template includes a comprehensive, step-by-step operational guide:

- **[PSY-20 Token Guide](token/README.md)**:
  - **High-Determinism Safe Subset**: Liquid balance management, `mint`, `burn`, `transfer`, `claim`, `batch_transfer_2`, `batch_transfer_5`.
  - **Edge RPC Slot Reading**: Zero-gas, direct storage slot queries (`getUserContractStateTreeLeafHash`) for balances and Outbox state.
  - **Monotonic Outbox/Claim**: High-concurrency pull payments immune to stale-read double-spending.
  - **Goldilocks Prime Field Arithmetic**: Strict $p - 1$ bounds preventing modular wrap-around.
- **[PSY-721 NFT Guide](nft/README.md)**:
  - **Computational Namespace Uniqueness**: `Poseidon(creator, local_id)` providing collision-resistant token identity.
  - **Slot-Based Ownership**: Unique token slot management up to 128 slots.
  - **Sliding Window Outbox & ACK Visibility**: Conflict-free cross-user NFT routing preventing overwrite losses and deadlocks.
- **[Full-Stack dApp Guide](dapp/README.md)**:
  - **Vite + React Integration**: Browser extension connection via `window.psy`.
  - **SDK Builders**: Strongly-typed transaction construction via `@psy-protocol/psy-sdk`.
- **[Design Specification](DESIGN.md)**:
  - Formal mathematical invariants, Plonky2 Goldilocks arithmetic, state partitioning axioms, and Delegation Cutoff settlement model.

---

## Testing & Verification

The repository includes native ZK contract unit tests, end-to-end integration suites, and adversarial verification:

```sh
# Run the complete test matrix (Unit + E2E + Adversarial)
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
