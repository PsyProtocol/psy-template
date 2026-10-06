# AMM lifecycle candidate preflight — 2026-09-30

Contract `59` remains the deployed nine-method implementation. The 13-method source and compiled artifact in `target-next/` are an **unsubmitted update candidate**. No `psy-node` source was changed.

## Layout and compiler checks

- A read-only live query of contract `59` returned code root `2bf37d3c38869cafd5ad9b4e09247ac9ee2f437fa89468d009b69f50e7fc42bf`, state layout root `5ff1d11b3ceac86c3b1e7eb587964371e98b3cab316e774bd0e724775c961f81`, 22 fields, 2,214,592,529 slots, and state-tree height 32.
- The deployed artifact and candidate have identical state layouts, tree heights, and original nine method IDs. Four new payer close methods were added.
- `amm/check_update_layout.mjs` pins the observed live old root and code root and checks a future prepared request's old/new layout proof endpoints. It does not submit. A prepared request was not generated or checked in this run; cryptographic verification of the layout proof remains a separate deployment gate.
- The new close methods compare payer token Outbox totals with pool contract settlement cursors. They do not combine a payer Outbox read with a pool token `amount_claimed` read, the combination that previously failed CFC proving.

Run the read-only live gate from `psy-template/` with `node amm/check_update_layout.mjs`. Once an authorized update request has been prepared to a separate file, use `node amm/check_update_layout.mjs --request /absolute/path/to/prepared-update.json`. This gate checks proof endpoints and request metadata; it does **not** verify the proof cryptographically or submit it. Preserve both compiled artifact directories and the request file for review.

## Real-state, non-submitting method diagnostics

Test user `1640448` opened an **unfunded** 1-base-unit PSY swap order on the existing contract in transaction `55b660332cdbfc62cbffdb469a7a45384c7ba625de275fd71e99b8d9dd8a7d51`, confirmed at checkpoint `89062`. No token transfer was included. Using that authenticated state, `pool_wallet witness` ran the candidate `close_psy_swap`; the saved witness passed base CFC proof and verification. This proves the candidate method circuit for that state, not a complete signed close transaction.

The same user opened an **unfunded** 1-base-unit pUSDT swap order in transaction `6c50477deff120240b46ac547157d5d6879b44c91af5693765627a139c91ba59`, confirmed at checkpoint `89085`. The candidate `close_usdt_swap` witness passed base CFC proof and verification against that state. Both tests spent ordinary test-user network fees and transferred no PSY or pUSDT to the pool.

Test user `329728` opened an unfunded LP-add order in transaction `82ecddf858d69c74faa374af91524be8ee4d4a7752146c4e789b1433954239ed`, confirmed at checkpoint `89110`. The candidate `close_add` witness passed base CFC proof and verification. The same user then opened an unfunded LP-remove order in transaction `0de31cd27092d338fe357edad358f469581de016b1dc6ffd3be29f15b57ebb76`, confirmed at checkpoint `89130`; `close_remove` also passed base CFC proof and verification. These are four distinct real-state method proofs, not complete user-signed close submissions.

At read-only checkpoint `89141`, user `1640448` had AMM order kind `1`, nonce `2`, and user `329728` had kind `3`, nonce `2`. Each user's cumulative PSY and pUSDT Outbox amount sent to pool `1347584` was `0`, and both corresponding pool settlement cursors were `0`. Thus the test left two unfunded order slots and no outstanding deposit to the pool. The old deployed code has no close methods; those slots will remain until a safe update or later cleanup.

These orders used the still-deployed contract's old opening method, which permits overwriting the prior unfunded order. The candidate opening methods reject that overwrite. The final live slot values should be re-read before any later operation.

## Remaining gates

1. Prepare an actual update request with the contract `59` deployer key and **explicit** old and new ABI paths; verify the request with `amm/check_update_layout.mjs`, then verify its canonical layout proof cryptographically. Re-read the chain leaf immediately before submission. The local `.secrets/` wallets do not match the contract `59` deployer hash, so no authorized update request was prepared here.
2. Prove a complete payer-signed close call and reopened order, then run settlement and refund regression tests against the updated code on staging. The current diagnostics stop before updating the contract.
3. Revisit fee economics, trade-size bounds, and upgrade authority before production liquidity.
