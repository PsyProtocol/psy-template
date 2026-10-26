# U124 upgrades for three markets

These versions use `token/wide` amounts `[low62, high62]`, bounded by `2^124 - 1`.
Tokens support 0–18 decimals; market arithmetic always uses raw integers. Both
trading assets must be U124 tokens. Native PSY (contract 0) pays fees separately.

| Market | Changes | Public methods |
| --- | --- | ---: |
| AMM | Bidirectional swaps, initial/additional liquidity, LP shares/withdrawals, payer refunds | 16 |
| Orderbook | Exact two-asset fills, limits, independent payer cursors, cancellation | 7 |
| Bonding Curve | Two-Felt inventory/quotes, buys/sells, expiry/stale refunds, graduation | 11 |

Sources: `amm/u124`, `orderbook/u124`, `bondingcurve/u124`; shared integer generation,
build tools and SD-key driver live here. Fresh contracts/vaults completed actual
settlement. Original markets, native PSY/pUSDT, Node, installed MCP and original
Executor remain unchanged. Tests used assets 2431/2432 at 18 decimals; markets:
AMM 2434, Orderbook 2435, Curve 2436. See [actual settlement](deployments/staging-2026-10-12/continuation-2026-10-13/REPORT.md).

## Contract and SD-key

- Contracts check signed orders, both cumulative Outbox limbs, nonce, deadline,
  price, inventory/reserves and advance cursors.
- SD-key fixes nine calls: market guard, fee/asset claims, fixed-recipient
  transfers, noops and final automatic PSY burn.
- Anyone may execute the public SD-key; refunds return only to the payer.
  High-limb changes, extra transfers, wrong assets/order/recipients fail fingerprint.
- One order per user; nonce/cursors allow only one fill/refund winner. Curve also
  binds `expected_sold` and permits stale-quote refunds.
- No invoke_sync. Supplied swap/LP results must satisfy integer products and
  exact floor upper/lower bounds.

Add/subtract checks enforce 62-bit limbs, carry, borrow and overflow. Multiplication
uses 30-bit internal digits with complete 248-bit products and wider weighted
quotes; each column stays below `2^63`. U124 is not merged into one Felt or a JS
Number.

AMM retains 30 bps, 1000 locked raw LP units and exact-ratio additions. Orderbook
retains whole-order matching. Curve uses discrete linear prices; cap/liquidity
are at most 1,000,000 lots. U124 unit/base/step are checked at build time against
inventory/full-curve overflow.

## Foreign ABI and proof heights

New token Outbox: offset **33554453**, stride **4**, two-Felt sent amount, tree
height **31**. Native PSY: offset **3**, stride **2**, one Felt, read height **32**.

The current DSL typed foreign read inherits the market height. Application
`vm-tests/src/lib.rs::compile_market` injects height 32 only for native PSY,
retains height 31 for market/tokens and regenerates bytecode without editing Node
or its compiler repository. Targets must be densely numbered. `ranges.rs` lowers
close's two-Felt self-external range read into two transaction-local single reads,
avoiding the frozen SDK range-cache-key defect while preserving preceding calls'
state in the same UPS. `artifactGate.mjs` checks positions/heights, dense targets,
amount width, layout, methods and parameter counts.

**Old v6 instances read the UPS starting snapshot and require separate close.
New same-UPS claim/close needs its own actual UPS evidence. Never deploy raw DSL
compiler output; use this build entry.**

## Build

Build tools against a verified adjacent `psy-node` SDK:

```sh
CARGO_TARGET_DIR=/private/tmp/psy-u124-target cargo +nightly-2025-09-20 build \
  --offline --locked --release --manifest-path amm/u124/vm-tests/Cargo.toml --bins

node amm/u124/build.mjs \
  --config config.json --market-ids market-ids.json --out /private/tmp/u124-build-new \
  --compiler /private/tmp/psy-u124-target/release/compile_market \
  --token-a token-a-compilation_artifact.json --token-b token-b-compilation_artifact.json
```

`verification-2026-10-12/fixture-config.json` uses local-only token IDs 42/43,
markets 1000/1001/1002, issuer 5 and target 400. Real builds need actual token ABIs/
IDs, expected new market IDs and Curve issuer/target/economics. Builds create new
artifacts, fixed policies and provenance and refuse existing directories.

## Client and execution

`client.mjs` implements BigInt encoding, swap/LP/Curve quotes, whole-order matching,
ABI calls, funding and lossless JSON. Market-specific client files are entry
points. `closeCall` selects methods by actual order/asset and does not read unused
tokens. Parse RPC with `parseLosslessJson`; ordinary JSON.parse loses integer
precision. Rust preserves original ABI/artifacts; JS checks do not rewrite them.

Policy witness order:

```text
branch, payer, peer, x_low, x_high, y_low, y_high,
z_low, z_high, lots, nonce, peer_nonce, actual_fee
```

`makePolicy` builds complete calls from the ABI. `signingRequest(policy, fields)`
creates eight explicit calls/signing parameters. Field thirteen may be zero;
the driver fills actual automatic SDK burn (`1e9 + DA_slots*1000`, at most 100 slots).
Orderbook returns the second seller's complete fee deposit; the first seller
pays network fees. Other unburned surplus stays in the vault, outside reserves.

The driver uses public SD-key values, never ordinary private keys:

```sh
market_wallet fingerprint policy.json
market_wallet preflight policy.json calls.json rpc-config.json
```

Preflight proves/independently verifies the full UPS end-cap without submitting.
Explicit register/submit entries also exist. `market_wallet` and
`market_wallet_verified` share the driver; submit/verified-submit independently
verify the same UPS to be broadcast, check fresh user anchor/nonce, and send once.

Candidate Executor uses `guarded-preflight ... guard.json` / `guarded-submit`.
Bindings cover every policy contract, including PSY fees/bootstrap AMM. The Rust
driver rechecks roots, tree heights and registration before proof, after verify
and before broadcast. Older drivers cannot downgrade these gates. Legacy explicit
entries remain but lack this added guard. See [binding details](../../executor/README.md#u124--nft-market-submission-guards).
RPC checks are not circuit-authenticated code roots or a freeze on chain upgrades.

Call count, market and limbs are checked before RPC initialization. Amount-range
panics discard the proving session and return `invalid_amount_range`, exit 1,
without signing/broadcast. Unknown panics return `sdk_runtime_panic` without raw
panic contents. This application handling does not remove SDK-internal unwinding.

Before sending, the driver flushes `broadcast_intent` with userId, nonce and
endUserLeafHash. Errors after send begins return `submission_unknown`,
`submitted:null`; reconcile by that leaf hash. Stdout is not a durable journal:
`executor/journal.mjs` persists intent before send and blocks unresolved vaults.
Local locks coordinate executors; chain nonce/anchor adjudicates competing proofs.

[Hardening and concurrency report](verification-2026-10-13-hardening-01/REPORT.md)
includes actual-state invalid-quote rejection and local executor races, with
[audit handoff](verification-2026-10-13-hardening-01/AUDIT_HANDOFF.md). Local races
are not a chain TPS measurement.

## Verification and testnet release boundary

[Initial offline results](verification-2026-10-12/REPORT.md) cover JS, actual
market/token bytecode, wide-integer op-gadget proofs, positive/negative SD-key
proofs and all CFC builds. Native PSY used an accounting oracle then; no initial
offline deployment/register/funding/broadcast occurred. Later actual acceptance
includes 64 user transactions, 12 independently verified full SD-key UPS and five
unsubmitted rejection tests in the settlement report above.

Layout is incompatible with single-Felt markets. Deploy **new contracts and new
SD-key vaults**. Verify token roots/heights, independent initial layout proofs and
fingerprints, then actual-state UPS preflight/small trades. Do not apply this as
an in-place legacy layout update or assume automatic balance/order migration.

The [2026-10-14 live report](../../executor/verification/2026-10-14-resume-01/REPORT.md)
confirms same-UPS claim/close on fresh 2443/2444/2446, Curve seeding a predeployed
AMM and two actual executors recovering a proof-owner crash without duplicate
broadcast or asset movement.
