# PSY/pUSDT exact-fill orderbook

This is a two-sided **limit-order** test implementation for Psy staging. It uses PSY contract `0`, pUSDT contract `4`, an orderbook guard contract, and one escrow user with a public software-defined key. It does not use the AMM reserves or pricing formula.

**Current staging status:** the corrected seven-method contract is deployed as `64`, with SD-key escrow user `591872`. Real PSY/pUSDT cancellation, matching, payout claims, and order closing were confirmed on Psy Sepolia staging. See [STAGING_FINAL_2026-09-30.md](STAGING_FINAL_2026-09-30.md) for the initial verification and [STAGING_MULTIUSER_2026-09-30.md](STAGING_MULTIUSER_2026-09-30.md) for the four-user match and cancellation test. Contracts `62` and `63` are historical test deployments; do not route new orders to them.

## How an order executes

1. A seller signs `open_sell(pool, asset, amount, min_buy, deadline, nonce)` in their own partition and sends the exact sell amount plus a PSY fee escrow to the escrow user in the same transaction. The orderbook currently allows one active order per seller.
2. An off-chain indexer or matcher finds one PSY sell order and one pUSDT sell order with compatible amounts. This first version fills both orders completely. It does not offer partial fills or an on-chain enumerable book.
3. Anyone can run the public escrow wallet. Its registered fingerprint authorizes only three complete transaction shapes: match, PSY cancellation, and pUSDT cancellation. `match_orders` checks both signed orders, their deadlines and nonces, both price limits, and both exact cumulative token Outbox deltas. The same atomic stack claims the payments and transfers PSY to the pUSDT seller and pUSDT to the PSY seller.
4. `cancel_psy_order` and `cancel_usdt_order` each claim only the original seller's exact unpaid amount and return that asset to the **same seller**. Cancellation works even after an order's deadline. A seller may call the matching `close_psy_order` or `close_usdt_order` once the escrow has claimed every outstanding payment, or if the order was never funded. This releases their slot for the next higher nonce.

The PSY seller funds the matching transaction's network burn. The pUSDT seller's PSY fee escrow is returned as part of their PSY match output. Each seller funds the network burn if their order is cancelled. Actual network burns can be slightly below the maximum escrow; that small difference stays in the escrow account. The test cap is `10,000,000` base units per sell amount.

## Components

- [contract/src/main.psy.rs](contract/src/main.psy.rs): signed order slots, prices, replay cursors, match and cancellation guards.
- [sdkey-circuit/src/lib.rs](sdkey-circuit/src/lib.rs): Plonky2 authorization of all seven calls, including the automatic fee burn.
- [sdkey-circuit/src/bin/orderbook_wallet.rs](sdkey-circuit/src/bin/orderbook_wallet.rs): public escrow registration and proof submission. Its private key is intentionally fixed and public; the fingerprint defines spending authority.
- [operationCalls.mjs](operationCalls.mjs): exact signed and escrow call builders.
- [matcherCore.mjs](matcherCore.mjs), [chainReader.mjs](chainReader.mjs), and [matcherRunner.mjs](matcherRunner.mjs): exact-fill selection from authenticated staging state, read-only by default.
- [sdkey-circuit/src/bin/deposit_proof.rs](sdkey-circuit/src/bin/deposit_proof.rs): reconstructs a claim proof for an already-recorded L1 deposit if the optional Psy CLI proof export fails **after** the deposit succeeds. It does not initiate another deposit or alter psy-node.

Build and test from the workspace root:

```sh
psy-node/target/release/psy_user_cli compile --source psy-template/orderbook/contract/src/main.psy.rs --output-dir psy-template/orderbook/contract/target
node --test psy-template/orderbook/*.test.mjs
CARGO_TARGET_DIR=psy-template/amm/sdkey-circuit/target cargo test --offline --manifest-path psy-template/orderbook/sdkey-circuit/Cargo.toml --lib
```

Staging deployment, transaction hashes, checkpoints, and verification are recorded in [STAGING_FINAL_2026-09-30.md](STAGING_FINAL_2026-09-30.md) and [STAGING_MULTIUSER_2026-09-30.md](STAGING_MULTIUSER_2026-09-30.md). The deployer and seller test keys, plus per-deposit bridge secrets, are local mode-0600 files under `psy-template/.secrets/`; that directory is Git-ignored. Back them up securely if future operations are needed.

## Read-only matcher and optional one-pair execution

From `psy-template/`, provide the seller IDs to inspect:

```sh
npm run test:orderbook
npm run matcher:orderbook -- --users 329728,1640448
# Historical replay only; never submits:
npm run matcher:orderbook -- --users 329728,1640448 --checkpoint 88516
```

The runner reads a single checkpoint's order slots, escrow replay cursors, and exact PSY/pUSDT Outbox totals. It prints eligibility reasons, one compatible full-fill match, and eligible expired refunds. At checkpoint `88516`, the two example users produced the historical `match_orders(329728, 1640448, 400000, 200000, 1, 1)` proposal; the latest-state smoke check at checkpoint `88959` correctly found both slots closed. These checks were read-only.

`--execute` proves the current match, rescans immediately before submission, and submits **one pair** with the public SD-key wallet. `--execute-refund` does the same for the first fully funded expired order; it accepts a single seller ID. Both modes require the locally built `orderbook_wallet` and network RPC config. The `.runtime/` lock and JSONL ledger prevent this runner from repeating an ambiguous local submission. Review the ledger and chain transaction status before clearing a stale lock or retrying. They do not coordinate separate machines; the on-chain order nonce, cumulative payment checks, and fingerprint remain the final authority. The runner does not discover sellers, run continuously, confirm settlement, or guarantee fair ordering. Those are milestones in the [execution network roadmap](../SDKEY_EXECUTION_NETWORK_ROADMAP.md).

## New deployment layout gate

The current deployment has a 17-field layout. `check_deploy_layout.mjs` pins the contract `64` code root and verifies that a **new deployment** request proves empty layout → 17 fields. It never submits the request. The independent canonical verifier must also verify the proof bytes before submission, and `next_contract_id` must be read again immediately before deploying. Rebuild the pin when source changes.

Historical contract `62` had 14 fields before its update. A 17 → 17 proof was once prepared against that 14-field chain leaf and stalled block production. The full investigation and the old ABI snapshot remain in [STAGING_TEST_2026-09-29.md](STAGING_TEST_2026-09-29.md) and [contract/deployed-62.abi.json](contract/deployed-62.abi.json). Do not use those old update instructions for contract `64`.

```sh
node psy-template/orderbook/check_deploy_layout.mjs \
  /private/tmp/psy-orderbook-deploy64-prepared.json
```

## Local matching priority update (2026-10-12)

The source matcher now ranks PSY orders by ascending `minBuy / sellAmount` and
pUSDT orders by descending `sellAmount / minBuy`, using exact BigInt cross-products.
Equal limit prices use seller ID as a deterministic tie-breaker. This selection is
independent of snapshot enumeration and does not mutate the snapshot. Incompatible
full-fill sizes are skipped; on-chain price and payment guards remain authoritative.
There is no authenticated order creation timestamp in the current snapshot, so this
is **not price-time/FIFO fairness**. It remains one active order per user and full
fills only. The frozen staging executor has not been switched to this source revision.
