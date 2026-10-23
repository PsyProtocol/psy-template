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

`liveTwoHop.mjs` submits one such plan on the isolated staging testnet. With
only assets A and B available, hop 1 is A→B on the existing pool and hop 2 is
B→A on a second deployment of the same AMM. The completed acceptance case is
read-only. The 2026-10-22 run settled both hops at the planned floors; see
`docs/security/MARKET_BATCH_PRODUCTION_CANDIDATE_20261021.md`.

`planAmmThenBook` adds one resting orderbook cross after that AMM floor. The
intermediate is sold as one order. The fill is the whole crossing bid, because
the orderbook checks the deposited amount against the signed order. There is
no partial fill and no `invoke_sync`. Curve and NFT are still outside this
path. This book hop has not been submitted.
