# Deterministic four-market batches: implementation and verification

Historical 2026-10-20 initial two-order AMM/Curve candidate; later four-order/
recovery work is [separate](MARKET_BATCH_FOLLOWUP_20261020.md). Branch
`markets-deterministic-batches-20261020`, independent batch-v2 contracts/key/
compiler bridge/Executor. Shared vaults retained, randomness off. No Node edit,
registration, deployment, legacy update or network transaction.

## Implemented rules

| Market | Verified semantics | Initial cap |
| --- | --- | --- |
| AMM | Checkpoint/user order, updated reserves, exact integer quote, common LP/swap order, checked slippage/refund | 2 members |
| Curve | Sequential sold/reserves, distinct exact/limit modes, buy surplus refund, inventory/graduation | 2 members |
| Book | 248-bit cross-product prices, checkpoint/user ties, earliest compatible whole pair, fee-free carry | 4 members/2 pairs |
| NFT | Listing nonce, identity/FIFO/funding, one winner and original-payer loser refunds | 4 members/2 sales |

Exact 40 calls including burn, 74-Felt witness. Commit freezes a Poseidon set;
settle processes it in another UPS. No cross-UPS atomicity; SHA 256 is file integrity
only. Entries: `batching/v2/{generate,controller,guards,funding,policy,reader,planner,
recovery,client}.mjs`; Rust batch_policy.rs, batch_compile.rs, wallet_driver.rs.
Build/config/activation/sponsorship: [profile](../../batching/v2/README.md).

## Security, concurrency and asset semantics

31 JS tests cover regenerated ABI/policies/templates, wrong padding, sequential
quotes, frozen restart, lost-receipt blocking, exact prepared request reuse, pair/
NFT discovery, stale listing, backpressure/funding drift and expiry. Nineteen actual
VM groups use market/FT/NFT/native bytecode: omission/order/replay/root/duplicate/
nonce/expiry/slippage/price/surplus/unique-sale/cancel/refund/partial/excess/wrong-asset/
FIFO/remainder/sponsor/recovery constraints. Four 40-slot keys prove 58 positive
stacks and reject each method/order/caller/hash/length/count/session/unused-field/
burn mutation. These authorize calls, not asset CFCs.

Driver checks 39 explicit calls/74 fields before RPC, accepts only canonical
computed-burn placeholders, then binds call 40. Existing 126 JS regressions pass;
recompiled legacy-profile artifacts remain byte-identical (`legacy-artifacts.json`),
without implying chain migration. First/middle/tail failures discard overlays;
independent vault writes do not clobber each other. Eight same-vault workers plus
user cancellation yield one local compare-and-commit winner while preserving
another user's writes. **Local model, not coordinator acceptance.**

Full UPS separately checks CFC/recursion/key/end-cap, public roots/nonce/fees/count,
exported Merkle delta and VM/proof-write equality; commit end links settle start.
Metadata mutations reject. Synthetic checkpoints are not network admission.

Purpose-1 sponsorship prepays 2F (F=1,000,100,000 native units); purpose 2 funds
maintenance. Pool/amount/increasing nonce bind consent, not transfer alone.
Cancelled/expired/invalid-funded/NFT losers refund actual input and prepaid fees to
sender. Valid AMM/Curve quote failures retain processing fees; carry claims neither
principal nor fees. Arbitrary recipient parameters cannot drain reserves.

Sender recovery requires a terminal order. Extra NFTs return by actual FIFO ID,
not claimed listing identity. Every FT account needs materialized state; volunteer
one-atom funding plus ordinary claim may initialize it. A zero RPC leaf is not a
proven empty tree. NFT buyers ACK vault; vault activates; FT seeds return to payer.
Post-commit funding drift/capacity waits for claims or expiry/refreeze. Expiry claims
no principal; default 256 checkpoints, cap 1024. Deadline is admission eligibility:
orders committed by cutoff remain bound until batch expiry, not an absolute
wall-clock inclusion deadline or retroactive invalidation of old proofs.

## Scope and trust boundaries

The dependency baseline `5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6` already included
uncommitted session-binding patches. Tracked-diff/key-source hashes match preflight
(`node-unchanged.json`); none are copied into Node by this work. A clean commit
alone does not reproduce APIs/security. Reviewed SDK release remains required.
Discovery is not global completeness; random seed/commit-before-seed is unavailable.
Public orders/Outbox, not private orders/notes; one active order per user/market.
Same-pool transitions remain sequential despite recursive aggregation. All local
funds/users/checkpoints are synthetic; no faucet, PSY/pUSDT transfer, registration,
40-slot network admission, RPC/claim/confirmation throughput measured here.

Use fresh contracts/keys/vaults and reviewed migration, not widened old identities.
Upgrade authority/root authentication remain open. Users must verify actual public
registration/fingerprint, not trust an arbitrary pool parameter or encoding helper.
Small batches, whole-order Book, no automatic Curve→AMM bootstrap. Online submit
reproves, so offline preflight understates full pipeline cost. Not production-ready.

## Preserved failures

Initial activation end-cap failed (`activation-v20-amm.log`): fixture incorrectly
prewrote an empty new user's ordinary leaf. Actual first UPS needs empty user
leaf, registration public-key commitment/start proof and ZERO state transition.
Corrected fixture uses registration tree/is_new_user and revalidates metadata/
Merkle delta; no weakened gate or Node change. Resource interruptions remain.

## Offline measurements

M1 Max/10 logical cores/32 GiB/macOS 15.7.3, Rust nightly-2025-09-20 release,
Node.js 18.16.0. Full end-cap serialization is 130,328 bytes. All assets/users synthetic. VM benchmark: 12 rounds per size,
commit plus settle with write tracking. Proof cost and VM are separate.

| Market | Fills/members | Cold s | Commit s | Settle s | Warm proof fills/s including commit |
| --- | --- | --- | --- | --- | --- |
| amm | 2 / 2 | 56.19 | 108.01 | 209.63 | 0.00630 |
| orderbook | 2 / 4 | 52.68 | 139.79 | 118.18 | 0.00775 |
| bondingcurve | 2 / 2 | 52.24 | 104.69 | 103.09 | 0.00963 |
| nftmarket | 2 / 4 | 69.10 | 211.59 | 150.68 | 0.00552 |

| Market | One-fill two-stage VM fills/s | Two-fill VM fills/s | Two-fill settle P50/P95 ms |
| --- | --- | --- | --- |
| amm | 177.79 | 266.73 | 4.963 / 6.118 |
| orderbook | 145.22 | 219.31 | 6.827 / 9.536 |
| bondingcurve | 191.39 | 284.80 | 4.390 / 5.284 |
| nftmarket | 282.45 | 438.01 | 2.634 / 3.344 |

VM excludes proof/RPC/confirmation; it is not hundreds of chain TPS. Earlier
upper-median summaries are superseded, with original samples retained.

All four new-vault activations pass complete 40-call UPS with actual registration
tree/start proof/ZERO transition/delta (`activation-summary.json`). Four dispersed
NFT/FT/native refunds for users 1000001/8388607/12345679/16777214 touch 71 distinct
four-Felt leaves, below 100; asset/fee recovery verifies. That case has no separate
end-cap and is not counted as full UPS. Initial nonconsecutive mint IDs rejected;
corrected fixture uses 4..7 after bootstrap; both logs remain, NFT unchanged.

Eight one-fill controls, eight two-fill UPS and four activations total **20 complete
UPS**, each endpoint/delta verified:

| Market | Commit s | Settle s | One-fill proof fills/s including commit |
| --- | --- | --- | --- |
| amm | 113.36 | 104.69 | 0.00459 |
| orderbook | 114.29 | 120.38 | 0.00426 |
| bondingcurve | 104.63 | 103.96 | 0.00479 |
| nftmarket | 107.15 | 104.35 | 0.00473 |

One-fill used one worker/on-demand cache; earlier two-fill retained all CFCs under
different load. Not a controlled speedup. Both are v2 40-slot batches, not old
9/10-slot operations. No old/new controlled comparison or network TPS. Final VM
numbers reran 12 write-tracked rounds; two earlier summaries remain historical.
Evidence: `batching/evidence/20261020/implementation-v2/`, CHECKSUMS and source-inputs.
