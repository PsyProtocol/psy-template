# Composition candidate boundaries — 2026-10-23

## Code-based capability matrix

| Property | Existing implementation / evidence | Boundary |
| --- | --- | --- |
| One UPS | `isolated_wallet.rs` / `compact_market_wallet.rs`, verified end-cap start/end leaf and exported state changes | One signing user; multiple contracts under that user's state. Foreign-user snapshots are reads, not arbitrary writes to those users. |
| Deferred sequence | Complete known call stack, caller/parameters/stack hash/signature-session binding | Known inputs execute in order. No synchronous return-value routing or `invoke_sync`. |
| FT transfer | Sender-owned balance and sent cursor; receiver separately claims | Outbox is not the recipient's spendable balance. Claim must be included before spending by a different user. |
| Same user, multiple contracts | One end-cap binds every intermediate call and final root | Atomic only within that UPS's proven state transition; no guarantee for independent vault accounts. |
| Distinct vaults / realms | Existing ordinary funding, foreign reads, public-key registration and exact receipts | Multiple own-account UPSs, staged confirmation and claims. Cross-realm visibility waits are explicit; no global atomic rollback. |
| Ordinary acceptance driver | At most 16 explicit contract calls, validated bindings and canonical fields | SDK adds its fee operation. This driver limit is not the protocol's universal call limit. |
| Compact market key | 40 logical constrained slots; compact removes canonical noops; bulk admission has 7 physical calls including burn | Capacity 4 accepted members; AMM/Curve 4 fills, Book/NFT at most 2. New larger paths need new proofs/key and acceptance. |
| Inputs / writes / fees | Existing policy validates up to 128 input fields per described call; market amounts are U124, two 62-bit limbs | Not evidence of unlimited state writes or a universal maximum fee. Actual slot counts and burn come from each complete UPS/receipt. |
| Random order | Generator rejects random mode and supplied seed | Deterministic only; certified future source and finalized seal witness remain external dependencies. |

## First implementation path

Use a **two-AMM workflow** with a dedicated composition account, independent
controller, client and SD-key. Two fresh market instances are required for new
acceptance. A→B→A is a round-trip mechanics test; do not label it three-token
A→B→C. No uniform clearing price, liquidity sharding or changes to base pricing.

A user-signed request binds domain/genesis identity, SDK release, version,
owner/nonce/unique intent digest, input asset/max spend, output/min receipt,
expiry, native fee cap, receiver and the two complete market/vault/key/asset
bindings. Initial v1 restricts final receiver to the owner and FT outputs only;
NFT and arbitrary receivers are rejected until their dedicated policies exist.
Quotes are advisory; on-chain market arithmetic enforces per-hop limits. No
executor-supplied address or `verified:true` JSON flag authenticates a route.

1. User publishes terms and exact input/fee funding; composition controller
   consumes one owner nonce and claims only that owner's unspent funding.
2. Composition account opens/funds the first AMM order. The base Executor retains
   its admission/seal/commit/settle semantics. Composition records exact included
   request, proof, nonce, market order and queue identity.
3. After confirmed settlement, composition claims the actual intermediate FT.
   Check amount, asset, cursor and state-root evidence before the second order.
4. Open/fund the second order under the original bounds, confirm, claim and
   transfer only to the intent receiver. Final receiver then claims its outbox.
5. Cancellation/timeout does not reverse an executed swap. Before hop 1 settles,
   cancel and use sender-bound market refund. After hop 1 settles, recover the
   **intermediate** asset; after hop 2, recover/finalize the output. Accepted orders
   remain locked until the market's terminal epoch. Anyone can relay the public
   key path but needs proof resources and explicitly bounded gas; no free-service
   or unconditional liveness guarantee.

Controller transitions, stack authorization, gas accounting, exact residual
return and intent replay protection must be compiled/proved **before delegated
funding**. The intent and client state modules are candidate scaffolding until
that gate closes. The old two-hop runner is read-only and cannot substitute for
this acceptance. All cross-UPS stages remain non-atomic.
