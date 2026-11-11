# U124 Bonding Curve

Token A supplies U124 inventory, Token B supplies U124 quotes, and native PSY pays
fees separately. `lot_size`, prices, reserves, fills and graduation amounts use
two Felts; lots remain bounded by 1,000,000. Buys, sells, stale-quote refunds and
the fixed graduation destination retain their original semantics.

Token, issuer, destination and pricing parameters are fixed by the new build;
initialization cannot replace them. The original launch-token is not changed.
Entry points: `contract/src/main.psy.rs`, `client.mjs`.

See the [shared build, arithmetic, SD-key and evidence](../../amm/u124/README.md).
Fresh Curve **2436**, vault **1014848**, completed actual buy/sell, stale-quote
refund and graduation handoff tests with U124 assets 2431/2432. Existing Curve 66
was not updated.

The deployment IDs above are historical staging evidence, not current-chain
identity bindings. The current ordinary-call candidate is
[`coreClient.mjs`](coreClient.mjs), re-exported by `client.mjs`. It requires an
explicit-selected-orders policy with the frozen SDK/client, current Native ABI,
nonzero checkpoint-one chain anchor and exact compiled Curve configuration.
It builds limit orders, cancellation requests, recovery enrollment and separate
activation, inventory and graduation-fee funding calls. Shared U124 encoding and
pricing remain unchanged. Cancellation and enrollment do not themselves refund
funds; the vault must process the original authenticated order and funding.

These are host-side construction checks. The issuer ID supplied by the caller
is not proof of signing authority, and policy metadata is not an authenticated
deployment, active user leaf, key registration or receipt. The ordinary wallet
and formal driver must check those bindings. The current formal selected-order
route is AMM-only; Curve builder, native scope, Executor integration and actual
buy/sell/refund/graduation plus ordinary output claims remain unaccepted.
`CURVE_CORE_CLIENT_STATUS` therefore reports both formal integration and
current-chain acceptance as false. No randomness or account-universe traversal
is required by this client.

[`core-build.mjs`](core-build.mjs) provides an isolated fresh Curve builder.
Its schema-1 spec pins `sdkCommit`, `clientCommit`, `chainRootAt1`, the declared
`marketId`, the complete fixed Curve `config`, and `{path, sha256}` records for
`compiler`, `native`, `tokenA` and `tokenB`. The compiler record additionally
requires `api: "compile-pair-stream-market-v1"` and permits no extra CLI arguments.
`prepareCurveCoreBuild` validates
those inputs and writes exact dependency bytes plus the existing
`generateBatch('bondingcurve', config)` source into a new output directory.
It does not invoke the compiler. `buildCurveCore` additionally probes the
reviewed compiler's network domain, invokes the existing
`SOURCE FRESH_OUT ASSET_A ASSET_B false` interface, checks and hashes the emitted
`FOREIGN_READ_AUDIT.json`, and generates the policy. That interface belongs to
`compile_pair_stream_market.rs`; `compile_market` and `compile_batch` accept
different arguments and are not silently substituted. Ordinary limit-open,
cancellation and recovery method arities are checked before policy publication.
Failed outputs are retained and an existing directory is never reused.

The builder rejects asset/market aliases, invalid issuer/recipient roles,
U124 inventory or full-curve price overflow, wrong network/release, random
ordering and AMM bootstrap. Initialization, exact/limit buys and sells, original
funding refunds and the fixed graduation destination retain the shared source
and policy semantics. No global scan, source stream or admission epoch is
introduced. Eight host builder checks pass without launching a compiler or
generating a proof. Preparation checks use retained token fixture bytes; full
build control-flow checks explicitly inject a host fake compiler. Their
synthetic ABI/output checks establish neither native compilation nor
compiled-bytecode correctness. Successful domain/audit checks remain compiler
output consistency checks, rather than independent build-provenance attestation.
The emitted policy/report keep formal integration and live authorization false.
Actual compilation under the pinned compiler, deployment/key binding, native
Curve scope, formal routing and current-chain acceptance remain open.
