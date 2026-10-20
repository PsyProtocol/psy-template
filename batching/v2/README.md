# Deterministic shared-vault markets (batch-v2)

Independent release profile for AMM, Orderbook, Bonding Curve and NFT Market.
It generates new source, layout, ABI and SD-key policies; it does not update a
registered contract or replace a deployed vault key. Random ordering is disabled.

## Execution model

1. Each user writes their own order and cumulative payment outbox. Independent
   user partitions can be prepared concurrently.
2. Executor discovers candidates at one checkpoint. `commit_batch` authenticates
   and stores a canonical, unique ascending-ID set, its full order snapshots,
   funding cursors and Poseidon commitment in the shared vault's market state.
3. A subsequent UPS binds that batch ID/root, begins settlement, executes the
   verified operations and finishes. Every shared-state step sees the preceding
   step's reserves, inventory or consumed nonces.
4. Each UPS has exactly **40 calls**, including its automatic native burn, with
   **74 witness Felts**. Four operation blocks contain 9 calls each; unused slots
   are restricted market noops. A refund can need all 9 slots.

This profile reads public order state and the public transfer/claim outbox of
U124 FT. It does not accept private-note funding or promise private order flow.
Each user has one active order in a market partition; the batch set has unique
user IDs.

All four markets admit at most 4 members. AMM and Curve can settle 4 orders;
Book and NFT can settle at most 2 pairs/sales. A Book match
uses 2 members; an NFT sale uses seller and buyer, and a closed-listing reference
also occupies a member slot. Book matches whole orders only. Priority is verified
**inside the committed set**: the RPC discovery list is not an authenticated
complete-market queue, so this version does not promise global price/time FIFO
or censorship resistance. Same-checkpoint ties use user ID, not network arrival.

Commit and settlement are **two independent UPSs**, not a jointly atomic pair.
Commit claims the consenting sponsor's fee budget, but never user order assets.
Failure of settlement leaves the committed batch available for retry. After its
expiry, an expire UPS permits a new snapshot; unclaimed user funds remain intact.
Historical checkpoint proofs mean a late cancellation cannot revoke an already
frozen order or guarantee that cancellation wins the vault-state race.
In V2, an order `deadline` is its eligibility cutoff for admission into a batch.
An order admitted before that deadline stays bound until the batch expiry;
passing the order deadline after commitment does not undo its acceptance.
`batch_expiry` bounds the settlement proof checkpoint. Neither bound promises
an absolute wall-clock inclusion deadline under historical checkpoint proofs.

## Build (offline, fresh directories)

Prerequisites: the application compiler bridge and its frozen local Node library
checkout, `nightly-2025-09-20`, actual U124 public FT artifacts (height 31), NFT
artifact (height 30), native artifact (height 32). This code does not modify Node.
The bridge implements this profile's scalar read lowering in the application;
legacy profile artifacts are checked separately for byte-for-byte stability.

```sh
cargo +nightly-2025-09-20 build --offline --locked --release \
  --manifest-path amm/u124/vm-tests/Cargo.toml --bin compile_batch
node batching/v2/build.mjs \
  --compiler /absolute/path/to/compile_batch \
  --native /absolute/path/to/native.json \
  --token-a /absolute/path/to/token-a/compilation_artifact.json \
  --token-b /absolute/path/to/token-b/compilation_artifact.json \
  --nft /absolute/path/to/nft/compilation_artifact.json \
  --config /absolute/path/to/config.json \
  --market-ids /absolute/path/to/market-ids.json \
  --out /absolute/path/to/fresh-release
```

`config.json` contains the existing U124 market generator configuration (`issuer`,
`assetA`, `assetB`, Curve `base`, `step`, `unit`, `cap`, `liquidity`, `threshold`,
`target`), plus `nftId` and `tokenId`. NFT's payment token must equal assetA in
this builder. Amounts use decimal strings. An optional `networkMagic` must match
this compiler. `market-ids.json` has four distinct keys:
`amm`, `orderbook`, `bondingcurve`, `nftmarket`. Asset, collection and market IDs
must be distinct. Automatic launch-AMM bootstrap is rejected in this profile.
The output includes sources, ABI/layout artifacts, policies and a `BUILD.json`
hash manifest with `broadcast:false` and `fullUpsVerified:false`: successful
compilation alone is not a proof or deployment acceptance.

`prepare.mjs` is the separate reproducible offline-test fixture builder. It uses
M=1000, FT=42/43, NFT=41, vault=100, and synthetic balances; those IDs and balances
are test inputs, not real network registrations or funds. It accepts
`--compiler BIN --assets FROZEN_ASSET_DIR --native JSON --out FRESH_DIR`.

## Initialization, ordinary users and fees

- Before committing, activate the fresh vault using its maintenance operation.
  FT markets need F native and 1 smallest unit of each FT from the activation
  payer. The FT seeds are returned to that payer; the native budget covers burn.
  NFT activation requires an NFT issuer payer, F native and 1 payment-token unit,
  which is returned. This materializes authenticated asset/market subtrees.
- Every selected participant also needs an initialized account in **both** FT
  assets (or NFT Market's payment FT). A zero user-contract leaf cannot supply
  the current SDK's foreign nonzero-height state proof, even when an outbox is
  logically zero. `assetSeedTransfers` lets a consenting funder send 1 smallest
  unit of each missing FT to that user; `assetSeedClaims` lets the ordinary user
  claim it before placing/funding orders. Previously used accounts need no new
  seed. The scanner returns `asset-account-initialization-required` with missing
  user/contract pairs before committing. Orphan recovery participants need the
  same referenced-asset preparation. NFT seller-only accounts need payment FT
  preparation too. No asset faucet, minting or Node change is involved.
- NFT buyers must call `NFT.acknowledge(vault)` before `open_buy`. The helper
  `nftBuyCalls` in `client.mjs` includes both in the ordinary user call sequence.
- `curveLimitCalls` builds atomic ordinary-wallet limit orders and funding. Buy
  limits fund max quote; sells fund token lots. It uses the new limit entrypoints
  with `expected_sold=0` ignored in limit mode, avoiding stale exact quotes.
- `sponsorCalls` binds the pool, amount, nonce and purpose in the sponsor's own
  market partition, followed by their native transfer. Purpose 1 authorizes an
  exact **2F** commit budget; purpose 2 authorizes maintenance gas funding only.
  F = **1,000,100,000 native smallest units**. Native decimals remain unchanged.
  Each UPS burns actual protocol fees, bounded by F; padding does not make it free.
- Cancelled/expired orders, invalid deposits and losing NFT buyers get actual
  pending assets and native order fee back to their original sender. Live AMM /
  Curve orders failing authenticated quote conditions use the quote-refund
  branch with the existing processing fee. Book carry claims no user fee.
- For orphan funding, the sender first calls `request_recovery(pool)`. Active
  unconsumed orders cannot use maintenance recovery to bypass settlement.
  Refunds never withdraw a pool balance based only on an arbitrary payee ID.
  Remaining excess NFTs are recovered FIFO after the order's terminal outcome.
- Gas recovery itself costs a UPS. Use a purpose-2 **2F** sponsor transfer when
  the vault lacks funds: its own funding UPS burns up to F, leaving a recovery
  budget. A bare transfer is not fee-spending consent.
- NFT delivery queues can require recipients to claim before the next payout.
  Frozen funding changes require expiry/refreeze. Scanner reports these states
  instead of repeatedly proving an invalid settlement.

Users must pin and verify the configured vault's registered public key / SD-key
fingerprint before transferring. An arbitrary `pool` account is not certified
by having the same market ABI. The helpers only construct calls; Executor
identity/code/layout checks are not a substitute for this user-side selection.

Use `losslessJson`/BigInt for every amount and commitment. Amount limbs are
canonical 62-bit values, with U124 accounting and integer quote multiplication;
Poseidon root fields use the complete canonical Goldilocks range.

## Executor integration

Use `profile:"batch-v2"` and the existing Executor configuration, explicit code /
layout / asset bindings, reviewed `walletSha256`, plus:

```json
{"batchSponsorId":300,"batchExpiryCheckpoints":256,"automaticInitialize":true,"activationPayerId":5}
```

These are illustrative IDs only. `activationPayerId` is optional; NFT activation
requires the actual collection issuer. Expiry is 1..1024 checkpoints, default
256. Budget it for your actual checkpoint cadence, cold proving, preflight,
submission re-proving and confirmation; it is not a fixed wall-clock duration.
The Executor currently proves again on guarded submission, so a preflight-only
benchmark understates its complete online processing latency.

Runtime task kinds are `batch_commit`, `batch_settle`, `batch_expire` and
`batch_maintenance`. The existing sealed driver, immutable requests, intent log,
precise end-leaf receipt reconciliation and network/vault process lock apply.
A lost response is unresolved until reconciled, not automatic permission to
resubmit. After restart the scanner reads committed members from contract state,
not from a newly edited users file. Current-state consensus remains the final
cross-host arbitration; no distributed Executor lease is provided.

## Tests and measurements

Use a fresh fixture directory in `BATCH_BUILD`. Rust tests need the same frozen
library checkout as the compiler; integration builds can compile other binaries.

```sh
BATCH_BUILD=/absolute/path/to/fixtures npm run test:markets-batch
BATCH_BUILD=/absolute/path/to/fixtures npm run test:markets-batch:vm
BATCH_BUILD=/absolute/path/to/fixtures npm run test:markets-batch:sdkey
BATCH_BUILD=/absolute/path/to/fixtures \
 BATCH_FULL_UPS_OUT=/absolute/path/to/fresh-proof-results \
 npm run test:markets-batch:ups
BATCH_BUILD=/absolute/path/to/fixtures \
 BATCH_BENCH_OUT=/absolute/path/to/fresh-benchmark.json \
 npm run bench:markets-batch:vm
```

UPS options: `BATCH_FULL_UPS_MARKETS=amm,orderbook,bondingcurve,nftmarket`,
`BATCH_FULL_UPS_SIZE=1` or `2`; `4` is supported for AMM and Curve. The activation test is selected explicitly with
`cargo ... --test batch_lifecycle full_ups_fresh_vault_activation`,
`BATCH_BOOTSTRAP_MARKET=...` and a fresh `BATCH_FULL_UPS_OUT`.
VM benchmarks run 12 repetitions for each market and batch size (1/2/4 for
AMM and Curve, 1/2 for Book and NFT). Complete UPS
benchmarks prove and verify CFC/recursion/SD-key/end-cap, validate public endpoint
metadata, compare VM writes and verify exported Merkle deltas, linking the
commit end root to settlement start root. They construct authenticated synthetic
checkpoints and do not query, deploy to, or submit to a network.

The harness seeds raw function-whitelist paths into the public command cache
because the local in-memory getter has a legacy index conversion. Each path is
checked against the authenticated whitelist root; no Node changes or skipped
CFC verification are used. This local store workaround is not an RPC integration
test. Fresh empty asset trees require the activation/ACK steps described above.

See `docs/security/MARKET_BATCH_V2_RESULTS_20261020.md` and its compact evidence
manifest for completed runs, limits and the distinction between VM speed,
cryptographic proof throughput and unmeasured chain-confirmed TPS.

## Capacity and recovery follow-up

The current four-member AMM/Curve sources have different code roots from the
original two-member candidate. They require fresh artifact/root verification;
no existing registered contract is updated by this change. The layout and the
40-call/74-field policy schema remain fixed. Larger Book/NFT batches still need
a new profile and measured call/write/proof budgets.

For linked timeout recovery proofs, select
`full_ups_expire_refreeze_and_refund_four_markets` in the Rust integration test,
with `BATCH_BUILD`, a fresh `BATCH_FULL_UPS_OUT`, and optionally
`BATCH_FULL_UPS_MARKETS`. Each market proves commit → expire → recommit → refund.
The test also checks premature expiry, rejected settlement, nonce reuse and
actual bytecode recipient claims. The ordinary user cancellation and claim
calls are VM checks, not ordinary-wallet UPS proofs or network confirmations.

`node batching/v2/proof-cost.mjs --out FRESH_JSON PROOF_REPORT...` attributes
measured full-UPS timings to work calls, noops and untraced overhead. It does not
predict speedup or chain throughput. Follow-up evidence and unresolved release
gates: `docs/security/MARKET_BATCH_FOLLOWUP_20261020.md`.
