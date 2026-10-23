# Two-hop AMM route

This module plans one A→B→C path across two existing AMM pools. It does not
deploy a contract, submit a transaction, or change Node.

`planExactRoute` quotes each hop with `swapQuote`, the same 0.30% floor the
U124 AMM contract checks. The second hop's input is the first hop's output.
The plan is rejected when that final floor is below the caller's minimum, the
intermediate asset does not match, a market is reused, or a hop floors to zero.

The plan is not atomic. Each hop is an existing AMM order, settlement and
claim. The intermediate asset is claimed before the next order is opened.
Orderbook, curve and NFT are not components of this path, and `invoke_sync`
is not used.

`liveTwoHop.mjs` is now a **read-only historical report reader**. Its former
financial runner bypassed the exact deployment-occurrence gate and is retired.
The original 2026-10-22 run and code at `93ad36f` remain historical evidence,
not dedicated composition authorization or current candidate acceptance.

`planAmmThenBook` adds one resting orderbook cross after that AMM floor. The
intermediate is sold as one order. The fill is the whole crossing bid, because
the orderbook checks the deposited amount against the signed order. There is
no partial fill and no `invoke_sync`. Curve and NFT are still outside this
path. This book hop has not been submitted.

## Strict intent candidate

`intent.mjs` adds a canonical domain/SDK/registry-bound intent, exact U124 units
and a two-AMM planner. Registry commitments include each market, vault, key,
code/layout/function roots, complete dependency metadata and asset decimals.
The v1 receiver is the owner; unsupported NFT/delegation scopes fail closed.
All returned plans explicitly remain **quote-only**, with unauthenticated source
snapshots. A digest is not a signature. Dedicated controller/SD-key bytecode,
workflow recovery and new isolated acceptance are still required. See
[CAPABILITIES.md](CAPABILITIES.md) for exact atomicity and compensation limits.

`workflow.mjs` tracks the staged request identities, confirmations and recovery
asset class. `store.mjs` persists append-only, hash-linked snapshots with revision
checks and the Executor's same-host lock. Unknown broadcasts prevent another
prepared task; a confirmed Outbox must be claimed before the next stage. An
observed actual fee breach is retained as `review-required`, not hidden by a
failed local assertion. This is an observation/control scaffold: receipt facts
still need a full-proof/historical/index verifier, and it currently has **no
financial adapter**. Local revision tests do not prove multi-host exclusion or
on-chain authorization. The initial store is one intent per dedicated case;
controller/key and actual new-instance acceptance remain uncompleted gates.
