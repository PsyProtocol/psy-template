# U124 Orderbook

Exact whole-order matching for two U124 tokens. Amounts, minimum returns and
cumulative Outbox cursors use `[low62, high62]`; native PSY pays fees only.
Original-payer cancellation, deadlines, nonces, limits and settlement races remain.

Entry points: `contract/src/main.psy.rs`, `client.mjs`. The SD-key fixes nine calls,
binds both counterparties and both asset amounts, and refunds only the payer.

See the [shared build, arithmetic, SD-key and evidence](../../amm/u124/README.md).
Fresh Orderbook **2435**, vault **1539136**, completed actual fills, refunds and
replay rejection with assets 2431/2432. Existing Orderbook 64 was not updated.

`coreClient.mjs` separately encodes ordinary whole-order funding and cancellation
requests for a fresh explicit-selected-orders v2 candidate on the frozen audit
SDK/current Native ABI. It binds the declared policy market/assets and keeps
both U124 limbs. It authenticates neither actual deployment identity nor wallet
approval. Both FT accounts for each participant must exist before the complete
UPS reads them; a missing receive account requires an ordinary seed transfer
and claim, rather than treating an absent tree as prepared zero state.

The selected route can reuse `batching/v2/generate.mjs`, `reader.mjs` and
`planner.mjs`. Price/time priority applies to the authenticated frozen selected
members, at most four, with owner ID breaking equal-checkpoint ties. It does
not establish whole-market inclusion. After commitment, the frozen members,
nonces, funding and cutoff control settlement and refunds across restarts.
An ordinary cancellation after commitment affects a later snapshot; the current
frozen batch retains its authenticated cancellation flag. Unique consumption
still prevents a second fill or refund.

The shared AMM-only compact Executor profile must be explicitly extended and accepted
for Book before this becomes a formal Executor/network route. The three host
client checks are encoding/refusal evidence only. Historical live U124 receipts,
the separate v19 synthetic linked-UPS evidence, and current-network acceptance
are distinct; no current Book deployment, registration, proof or send is made
by this client change.

`core-build.mjs` now provides the isolated fresh Book candidate builder:
`makeCoreBookPolicy(marketId, config, artifact, token, chainRootAt1)` and
`buildCoreBook(spec, freshOutput)`. The schema-1 spec requires the fixed audit
`sdkCommit` and `clientCommit`, nonzero `chainRootAt1`, `marketId`, a reviewed
`intendedVaultId`, and `compiler`, `native`, `tokenA`, `tokenB` path/SHA256
records. Config accepts only `assetA`, `assetB`, string `networkMagic`, and an
optional deterministic `ordering`. The intended vault is recorded solely in
the manifest; the existing v2 policy does not cryptographically bind that ID.

Compiler API must explicitly be `compile-pair-stream-market-v1` in the compiler
record. The existing `compile_pair_stream_market.rs` accepts
`SOURCE FRESH_OUT ASSET_A ASSET_B false`, supports the network-domain probe,
and emits the checked foreign-read audit. `compile_market` has four arguments;
`compile_batch` requires a `0|1` flag. Neither is silently substituted. The
builder pins input hashes, preserves dependency/artifact bytes including full
u64 constants, checks heights and policy ABI, and preserves failed output in
its original directory. The compiler label and hash do not independently prove
the binary's build provenance or that its output executes correctly.

Six lightweight tests use a host fake compiler and tiny synthetic ABI/IR
envelopes. They cover exact argument shape, byte preservation and rejection
paths, not a native compilation, SD-key proof or complete UPS. Shared formal
Executor/native dispatch, current deployment identity, registration, both FT
account preparation, whole-order fills, cancellation/refunds and ordinary final
claims still require separate current-instance acceptance. No global account
scan is a prerequisite of this selected-member candidate.
