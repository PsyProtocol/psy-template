# psy-template

Official Psy project templates for [Psy Protocol](https://github.com/PsyProtocol).

> **Maturity Status**: `psy-template` is currently in the convergence stage from proof-of-concept toward a high-determinism safe subset, and is **NOT mainnet production ready**.

Designed for use with `psyup new`.

For a full breakdown of the ZK-native partitioned state model, Plonky2 Goldilocks arithmetic, Outbox/Claim protocols, and stated security invariants, see the [Design Specification](DESIGN.md).

For release blockers and acceptance criteria, see [Production Readiness Gates](PRODUCTION_READINESS.md).

For the current engineering handoff, see [PSY-20 / PSY-721 handoff (2026-09-24)](HANDOFF_2026-09-24.md).

---

## Available Templates

| Template | Path | Description | Command |
| :--- | :--- | :--- | :--- |
| **dapp** (default) | `dapp/` | Full-stack React + Vite frontend with a Psy token contract in `contract/` | `psyup new my-app` |
| **token** | `token/` | Pure PSY-20 Fungible Token contract (Phase 1 Safe Subset: liquid balance, Outbox Transfer/Claim, Batched Transfers, strict Goldilocks arithmetic) | `psyup new my-token --template token` |
| **nft** | `nft/` | PSY-721 v3 NFT contract (computational namespace uniqueness, slot storage, four-slot Outbox with explicit ACK) | `psyup new my-nft --template nft` |

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

Asset issuance is locked to a compile-time designated partition (`ISSUER_USER_ID`). The legacy token and NFT sources also check the deployer public key. The staging-compatible NFT v3 compiler does not expose that intrinsic; its NFT contract checks the canonical user ID on chain and its deployment script verifies the selected wallet against the registered ID.

The issuer user ID must be in `1..16777215`. Outbox arrays have 24-bit indices; a larger issuer ID could mint assets but could not transfer them.

> [!WARNING]
> You **MUST** configure `ISSUER_USER_ID` to match your actual on-chain account's `user_id` before building and deploying. If deployed with a mismatched ID, the contract will permanently reject initialization and minting from your account, bricking the deployment.

```sh
# Set canonical ISSUER_USER_ID to your registered on-chain user ID:
npm run configure -- --issuer <YOUR_USER_ID>

# Strict deployment preflight check (verifies explicit configuration record via .issuer_configured):
npm run check:preflight
```

> [!NOTE]
> **Deployment boundary**: Root `check:preflight` verifies the configured source and local marker. Each standalone template also provides `check:deployer` and `deploy:checked`, which query the selected wallet's first registered user ID on the configured network. Direct `psyup deploy` bypasses these checks.

### 3. Build Contracts

Inside any contract directory (or project root for pure contract templates):

```sh
# Build with deployment preflight check (blocks compilation if unconfigured):
npm run build:deploy

# Or standard build:
npm run build
```

The token build now produces two artifacts: the complete `.psy` contract with `private_transfer` / `private_claim` via `psyup build`, and the public-only staging v3 `.psy.rs` artifact via `psy_user_cli compile`. The NFT staging build uses `psy_user_cli compile`; the dApp contract remains on the `psyup build` path. Set `PSY_USER_CLI` to a compatible binary. See the [token guide](token/README.md) and [NFT guide](nft/README.md) for the deployment limits.

### 4. Deploy

From the `token/`, `nft/`, or `dapp/` template directory, set exactly one of `PRIVATE_KEY` or `KEYSTORE_PATH` (plus `WALLET_PASSWORD` for a keystore) and set `RPC_CONFIG` for the intended network. Then run:

```sh
npm run check:deployer
npm run deploy:checked  # NFT and dApp
# From token/, for a public-only staging token:
npm run deploy:staging-public
```

`deploy:checked` checks the selected wallet's registered issuer ID. For the token template it now stops because the deployable v3 artifact omits private methods. Run `npm run deploy:staging-public` from `token/` only for an explicit public-only deployment; the complete private-enabled artifact currently has no compatible staging deploy path. For NFT, `deploy:checked` submits the v3 artifact. Direct `psyup deploy` bypasses the issuer wallet checks.

---

## Operations Guide & Documentation

Each template includes a comprehensive, step-by-step operational guide:

- **[PSY-20 Token Guide](token/README.md)**:
  - **High-Determinism Safe Subset**: Liquid balance management, `mint`, `burn`, `transfer`, `claim`, `batch_transfer_2`, `batch_transfer_5`.
  - **Edge RPC Slot Reading**: Zero-gas, direct storage slot queries (`getUserContractStateTreeLeafHash`) for balances and Outbox state.
  - **Monotonic Outbox/Claim**: High-concurrency pull payments immune to stale-read double-spending.
  - **Goldilocks Prime Field Arithmetic**: Strict $p - 1$ bounds preventing modular wrap-around.
  - **Cooperative Delegation**: 16 independent escrow slots; spender-local terminal close before owner refund. Owner-only instant revocation is unavailable on the current protocol.
- **[PSY-721 NFT Guide](nft/README.md)**:
  - **Computational Namespace Uniqueness**: `Poseidon(creator, local_id)` providing collision-resistant token identity.
  - **Slot-Based Ownership**: Unique token slot management up to 128 slots.
  - **Sliding Window Outbox & Explicit ACK**: Separate inbound and outbound counters support two-way transfers; the sender acknowledges claims before reusing full queue capacity.
- **[Full-Stack dApp Guide](dapp/README.md)**:
  - **Vite + React Integration**: Browser extension connection via `window.psy`.
  - **SDK Builders**: Strongly-typed transaction construction via `@psy-protocol/psy-sdk`.
- **[Design Specification](DESIGN.md)**:
  - Formal mathematical invariants, Plonky2 Goldilocks arithmetic, state partitioning axioms, and cooperative delegation settlement limits.

---

## Testing & Verification

The repository includes legacy native ZK contract unit tests, staging v3 compilation and ABI checks, and JavaScript multi-user state simulations. A separate [staging report](tests/live/STAGING_REPORT_2026-09-23.md) records real multi-user cross-realm NFT transactions. The legacy `dargo` NFT unit harness does not execute the v3 source:

```sh
# Run the complete test matrix (Unit + E2E + Adversarial)
npm test

# Run native Plonky2 ZK contract unit tests via dargo test
npm run test:unit

# Run multi-user state and invariant simulations plus compilation checks
npm run test:e2e
```

### Native Unit Testing

Run each template's native tests through its script. The script composes the current `src/main.psy` with test cases and applies only the substitutions required by `dargo`'s single-user mock runtime:

```sh
# PSY-20 Token Unit Tests
(cd token && npm test)

# PSY-721 NFT Unit Tests
(cd nft && npm test)
```
