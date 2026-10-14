# psy-template

Official Psy project templates for [Psy Protocol](https://github.com/PsyProtocol).

> **Maturity Status**: `psy-template` is currently in the convergence stage from proof-of-concept toward a high-determinism safe subset, and is **NOT mainnet production ready**.

Designed for use with `psyup new`.

For a full breakdown of the ZK-native partitioned state model, Plonky2 Goldilocks arithmetic, Outbox/Claim protocols, and stated security invariants, see the [Design Specification](DESIGN.md).

For release blockers and acceptance criteria, see [Production Readiness Gates](PRODUCTION_READINESS.md).

For the current engineering handoff, see [PSY-20 / PSY-721 handoff (2026-09-24)](HANDOFF_2026-09-24.md).

For the PSY/pUSDT exchange prototypes, see [AMM implementation status](AMM_IMPLEMENTATION.md) and the [orderbook guide](orderbook/README.md). The current 14-method AMM is deployed separately as contract `1758`, with public SD-key vault `499200`; historical contract `59` was not updated. Orderbook contract `64` is reused after code/layout verification. See [the current pUSDT test report](amm/STAGING_PUSDT_TEST_2026-10-09.md) for completed multiuser settlements, refunds and the final conservation audit. The [SD-key execution network roadmap](SDKEY_EXECUTION_NETWORK_ROADMAP.md) covers the next infrastructure milestone.

The [bonding curve module](bondingcurve/README.md) adds a token sale contract, public SD-key vault policy, exact quote helpers, refund path and graduation handoff. Curve contract `66` is deployed on staging. A real graduation handoff into Launch AMM contract `1503`, multiuser settlements and refunds are recorded in [the Oct 5 launch-market report](launchamm/STAGING_TEST_2026-10-05.md).

[Psy Executor](executor/README.md) runs the markets as one service inside this repository: configured-user discovery, guarded UPS settlement/refunds, bounded proof concurrency, durable broadcast recovery and per-vault status. Start with `npm run executor:service -- executor/examples/service.json scan` after configuring the public driver and RPC paths.

The [U124 Token](token/wide/README.md) represents balances as two Felt limbs: `low + high * 2^62`, up to `2^124 - 1` raw units, with 0–18 decimals. The three [U124 exchange profiles](amm/u124/README.md) use the same encoding for orders, reserves and settlements. New staging assets 2431/2432 and market contracts 2434/2435/2436 have completed real settlement tests; the original PSY/pUSDT assets retain their existing interfaces. Independent security review and chain load testing remain pending.

The [NFT Marketplace](nft-marketplace/README.md) adds fixed-price NFT v3 sales paid with U124 FT, signed cancellation, expired/stale-order refunds and an exact ten-call public SD-key policy. It reuses Psy Executor's durable submission and receipt recovery. This new module has local bytecode, policy-proof and circuit-build verification; it has not been deployed or accepted on chain.

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

The token template has a complete legacy `.psy` source, a public-only v3 source, and a private-enabled v3 source. The private v3 profile requires an isolated compiler build and completed a two-user staging round trip on contract 53. Both v3 profiles include name/URI metadata, an optional immutable lifetime cap, `mint_to`, and issuer settlement of holder burns into `total_supply`. A burn remains counted until settlement. The NFT v3 source now also includes collection name/base URI metadata, an optional lifetime cap, local burn, and issuer supply settlement. The NFT staging build uses `psy_user_cli compile`; the dApp contract remains on the `psyup build` path. See the [token guide](token/README.md) and [NFT guide](nft/README.md) for commands and limits.

### 4. Deploy

From the `token/`, `nft/`, or `dapp/` template directory, set exactly one of `PRIVATE_KEY` or `KEYSTORE_PATH` (plus `WALLET_PASSWORD` for a keystore) and set `RPC_CONFIG` for the intended network. Then run:

```sh
npm run check:deployer
npm run deploy:checked  # NFT and dApp
# From token/, for a public-only staging token:
npm run deploy:staging-public
# From token/, for the private-enabled v3 profile with its matching compiler:
PSY_PRIVATE_CLI=/path/to/psy_user_cli npm run deploy:private-v3
```

`deploy:checked` checks the selected wallet's registered issuer ID. For the token template it stops because the default v3 artifact omits private methods. Use `deploy:staging-public` only for an explicit public-only token, or `deploy:private-v3` with the matching isolated compiler. For NFT, `deploy:checked` submits the v3 artifact. Direct `psyup deploy` bypasses the issuer wallet checks.

---

## Operations Guide & Documentation

Each template includes a comprehensive, step-by-step operational guide:

- **[PSY-20 Token Guide](token/README.md)**:
  - **High-Determinism Safe Subset**: Liquid balance management, `mint`, `burn`, `transfer`, `claim`, `batch_transfer_2`, `batch_transfer_5`, `cancel_unclaimed_payment`, `refund_claimed_payment`.
  - **Edge RPC Slot Reading**: Zero-gas, direct storage slot queries (`getUserContractStateTreeLeafHash`) for balances and Outbox state.
  - **Monotonic Outbox/Claim**: High-concurrency pull payments immune to stale-read double-spending.
  - **Goldilocks Prime Field Arithmetic**: Strict $p - 1$ bounds preventing modular wrap-around.
  - **Cooperative Delegation**: 16 independent escrow slots; spender-local terminal close before owner refund. Owner-only instant revocation is unavailable on the current protocol.
- **[PSY-721 NFT Guide](nft/README.md)**:
  - **Computational Namespace Uniqueness**: `Poseidon(creator, local_id)` providing collision-resistant token identity.
  - **Slot-Based Ownership**: Unique token slot management up to 128 slots.
  - **Sliding Window Outbox & Explicit ACK**: Separate inbound and outbound counters support two-way transfers; the sender acknowledges claims before reusing full queue capacity.
  - **Collection and supply controls**: Issuer-managed name, base URI and hash, immutable lifetime mint cap, holder burn, and issuer settlement into `total_supply`.
  - **State queries**: [`tests/live/asset_queries.py`](tests/live/asset_queries.py) reads balances, supply, metadata, and NFT slots from a deployed ABI at one checkpoint. Global owner lookup requires an index of owner candidates.
- **[Full-Stack dApp Guide](dapp/README.md)**:
  - **Vite + React Integration**: Browser extension connection via `window.psy`.
  - **SDK Builders**: Strongly-typed transaction construction via `@psy-protocol/psy-sdk`.
- **[Design Specification](DESIGN.md)**:
  - Formal mathematical invariants, Plonky2 Goldilocks arithmetic, state partitioning axioms, and cooperative delegation settlement limits.

---

## Testing & Verification

The repository includes legacy native ZK contract unit tests, staging v3 compilation and ABI checks, and JavaScript multi-user state simulations. A separate [staging report](tests/live/STAGING_REPORT_2026-09-23.md) records real multi-user cross-realm NFT transactions. The legacy `dargo` NFT unit harness does not execute the v3 source:

```sh
# Run native tests, E2E compilation/ABI checks, exchanges and executor regressions
npm test

# Run native Plonky2 ZK contract unit tests via dargo test
npm run test:unit

# Run multi-user state and invariant simulations plus compilation checks
npm run test:e2e

# Run exchange, executor, layout and MCP client regressions
npm run test:exchanges
```

Compiled token refund regressions are available in [token/vm-tests](token/vm-tests/README.md). They require the adjacent SDK and built legacy, public v3 and private v3 artifacts; the private profile uses its matching isolated compiler. The separate [SD-key transaction digest regression](tests/security/sd_key_sighash_repro/README.md) checks the locally compiled SDK circuit.

### MCP transaction confirmation

The current MCP server exposes transactions as `prepare_*` / `execute_*` pairs.
[mcp_confirmed_client.mjs](scripts/mcp_confirmed_client.mjs) adapts an existing
MCP SDK client with two separate calls: `prepareMcpTransaction(client, tool, args)`
returns the server's review summary and ticket; after owner review,
`executeMcpTransaction(client, {tool, confirmationToken, ownerToken})` executes
that ticket. Keep credentials out of logs. Execution cannot change transaction
parameters, and preparation never executes or falls back to a raw transaction.
The client also refuses direct generic PSY/pUSDT calls. See the
[MCP fix and verification report](MCP_PAYMENT_POLICY_REVIEW_2026-10-09.md)
for the installed service's migration status and outstanding policy findings.

### Native Unit Testing

Run each template's native tests through its script. The script composes the current `src/main.psy` with test cases and applies only the substitutions required by `dargo`'s single-user mock runtime:

```sh
# PSY-20 Token Unit Tests
(cd token && npm test)

# PSY-721 NFT Unit Tests
(cd nft && npm test)
```

### Wide AMM candidate and market boundary tests

The [wide AMM candidate](amm/wide/README.md) raises the local PSY reserve cap to
1000 PSY using wide integer comparisons, while preserving the existing state layout
and method ABI. v1 is deployed on staging as contract 2425 / vault 317504;
its real-state refund preflight exposed an uninitialized pUSDT partition read.
The local v2 repair has passed the refund CFC proof and initial layout proof;
full UPS and real swap acceptance remain pending. See the [current report](amm/wide/deployments/staging-2026-10-12/REPORT.md).
Use `npm run test:amm-wide` and
`npm run test:amm-wide:vm`; `npm run build:amm-wide -- <fresh-output-directory>`
compiles it without overwriting prior artifacts. `npm run test:exchanges` now also
checks the candidate's ABI and arithmetic reference tests.
