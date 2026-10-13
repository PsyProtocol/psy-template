# PSY bonding curve launch candidate

This module implements a fixed-inventory PSY-priced token launch using a contract accounting guard and a public SD-key vault. On 2026-09-30 the companion token was deployed as **65** and the bonding curve as **66** on Psy Sepolia staging. MCP faucet funding and all six public SD-key branches have succeeded on-chain, including multiuser buys, a sell, both refund types and graduation; the 48 submitted transactions were reconciled against included receipts. The zero IDs in `launch.example.json` are deliberately invalid placeholders; use the verified staging configuration or your own verified chain IDs before fingerprinting or funding.

Current confirmed tests are recorded in [STAGING_TEST_2026-10-04.md](STAGING_TEST_2026-10-04.md). The [original deployment report](STAGING_EXECUTION_2026-09-30.md) and [preflight report](STAGING_PREFLIGHT_2026-09-30.md) are historical snapshots. Public source, compilation artifacts, prepared/submitted layout proofs, and deployment receipts are preserved under `deployments/staging-2026-09-30/`; new execution evidence is under `deployments/staging-2026-10-04/`.

## Components

| Path | Role |
| --- | --- |
| `contract/src/main.psy.rs` | Per-user signed orders, exact price and inventory checks, replay cursors, refunds, graduation |
| `launch-token/` | Fixed-supply companion token with the PSY-compatible Outbox prefix |
| `sdkey-circuit/` | Public vault fingerprint; restricts the entire UPS stack, recipient, amount, method IDs and fee burn |
| `curveMath.mjs` | Exact integer quotes in base units |
| `operationCalls.mjs` | Builds payer, issuer and vault call stacks |
| `receiptCheck.mjs` | Reconciles an ambiguous broadcast against historical user leaves and included receipts |
| `contract/target/` | Reviewed local ABI and compiled artifacts; a new build goes to `target-next` |

The sale token must have the companion `launch-token/target/abi.json` Outbox layout and its `transfer`/`claim` methods. PSY is contract 0 with `simple_transfer`/`simple_claim`. The ordinary `token/src/main.psy.rs` template uses a different Outbox offset and cannot be substituted without changing and re-proving the curve contract and SD-key policy.

## Staging readiness, 2026-09-30

The token deployment was included at checkpoint `92385`, and the curve deployment at `92460`. Both chain leaves match the reviewed code and layout roots. Existing test token contracts `48`, `49`, and `53` have different Outbox layouts and method IDs, so none is a drop-in sale token. Companion token **65** has Outbox offset `3`, `claim` method `2394033944`, and `transfer` method `194520553`; it fixes issuer user `1882112` and supply `6,000,000,000` base units. The staging handoff account is a receipt-test destination. An automatic handoff to a compatible AMM market still requires a successor market policy and deployment.

## Price and inventory

One lot contains `lotSize` smallest token units. With `s` lots sold, the cumulative PSY cost is

```
F(s) = basePrice × s + stepPrice × s × (s − 1) / 2
buy(s, q)  = F(s + q) − F(s)
sell(s, q) = F(s) − F(s − q)
```

The issuer funds `(maxLots + liquidityLots) × lotSize` tokens. Sale inventory is capped at `maxLots`; `liquidityLots` is reserved for the graduation handoff. `psyReserve` rises and falls by exactly the above quotes. All values are integer base units. Limits on lot counts, price and lot size keep intermediates inside a Goldilocks field and JSON amounts exactly representable.

## Operation sequence

1. Configure and deploy the companion launch token with the exact registered issuer and inventory amount. Choose a new curve contract ID and a successor vault that can safely receive PSY and that token. Review both compiled ABIs, chain token ABI, curve parameters, and both new-deployment empty → new layout proofs. Compute the fingerprint for the **actual** curve contract ID and immutable launch config. Register the vault with that fingerprint before sending it assets.
2. The issuer sends exact inventory and `1,000,100,000` PSY base units of fee escrow to the vault. Anyone may submit the vault's `initialize` UPS. The guard checks both cumulative payments, then the stack claims them.
3. A buyer signs `open_buy` plus exact quoted PSY and fee escrow. A seller signs `open_sell` plus exact tokens and fee escrow. Each payer has one active order. The vault's `settle_*` UPS checks the signed snapshot, current sold lots, quote, deadline, nonce, and exact cumulative incoming payment, then claims the payment and transfers the exact output in one authorized stack. The payer calls `close_*` after settlement to open another order.
4. If an order is stale, expires, or is not executed, anyone may call the matching vault `refund_*` UPS. The refund goes only to the original payer. It returns the trade amount; the fee escrow pays the automatic PSY burn. The payer closes the order after the refund. Refunds remain available after graduation.
5. When `soldLots >= thresholdLots`, the issuer sends another fee escrow. Anyone may submit `graduate`: it closes trading and transfers the entire PSY reserve and all unsold sale and liquidity tokens to the fixed successor vault. A separate authorized transaction must establish the successor market. The existing PSY/pUSDT AMM cannot directly seed a newly launched token; its asset pair and policy would need compatible new deployment logic.

All vault actions contain six explicit contract calls plus the automatic fee burn. The SD-key circuit binds the whole stack and exact recipients. Competing operators may prepare the same order, but the vault's nonce and Outbox cursors permit only one settlement or refund; a quote from an old `soldLots` snapshot fails and can be refunded. This design does not require `invoke_sync` or a PSY node change.

## Local checks

```sh
npm run test:bondingcurve
CARGO_TARGET_DIR=../psy-node/target cargo test --offline --manifest-path bondingcurve/sdkey-circuit/Cargo.toml --lib
cargo test --offline --release --manifest-path bondingcurve/sdkey-circuit/Cargo.toml --test compiled_lifecycle --target-dir ../psy-node/target
PSY_USER_CLI=../psy-node/target/release/psy_user_cli npm run build:bondingcurve
LAUNCH_ISSUER_ID=<registered-user-id> LAUNCH_FIXED_SUPPLY=<exact-inventory> LAUNCH_OUTPUT_DIR=/safe/review/directory PSY_USER_CLI=../psy-node/target/release/psy_user_cli npm run build:launch-token
CARGO_TARGET_DIR=../psy-node/target cargo run --offline --manifest-path bondingcurve/sdkey-circuit/Cargo.toml --bin layout_root -- bondingcurve/contract/target/abi.json
# Once a deploy request is prepared, before any submission:
node bondingcurve/check_deploy_layout.mjs /path/to/prepared-deploy-command.json
node bondingcurve/launch-token/check_deploy_layout.mjs /path/to/token-deploy-command.json /path/to/token-abi.json /path/to/token-code.bin /path/to/configured-main.psy.rs
```

The Rust policy tests prove all six authorized branches and reject extra/missing/reordered calls, wrong tokens, changed nonces, redirected/inflated outputs and excessive fees. The compiled VM tests cover a multiuser lifecycle and 100 buy/sell cycles using the preserved deployment artifacts and local state. These local tests do not establish production UPS rollback or live transaction inclusion. The layout root is independently recomputed from the reviewed ABI (`25f75784df8420fe918ac28cc845880f4c4c1e3891976b2a06577b177df51888`); the deployment gate compares the prepared request and proof public inputs with this root and the empty old layout. The coordinator must still verify the proof itself. Before a chain action, inspect the prepared request and current chain state, verify the token contract code and vault fingerprint, and preserve all artifacts for review. Do not update contract 62 to deploy this product.

## Additional local boundary verification (2026-10-12)

`invariants.test.mjs` checks 1000 deterministic segments against an independently
summed per-lot price oracle, reserve reversibility and graduation inventory.
The shared local harness at `../amm/wide/vm-tests/tests/compiled_markets.rs` executes
the existing compiled curve guard at maximum parameters, rejects stale competing
quotes, checks exact graduation amounts and verifies stale funded buy refunds after
graduation. These are local VM/state-fixture tests, not new live transactions or full
state/UPS proofs. Curve 66 and its already-graduated vault remain unchanged.
