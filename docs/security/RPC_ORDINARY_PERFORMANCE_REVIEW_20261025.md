# RPC waits and resident ordinary wallet: actual pair — 2026-10-25

Later [memory/cold-start pair](PROVER_MEMORY_REVIEW_20261025.md) includes slower
warm/whole-round results; do not infer overall acceleration.

## Scope and results

Same isolated QA Book 2497/vault 662720, two consecutive epochs, two users/one FT
per side/one fill and actual ordinary claims per round. **34 actual UPS/distinct
requests independently verify**, including receipts/identity/fees and inter-round
nonce/endpoints. Each finite known FT total stays1000; exact state continuity and
fund/claim conservation verify. Client stages improved, not whole-round time or
commit/settle proving; no four-market TPS/production claim.

Same branch, baseline5ac1bf32, unchanged1,466-source SDK/config/original Node diff;
no contract upgrade. SDK manifest:
`0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`.
Compiler nightly-2025-09-20. Actual ordinary-binary SHA256:
`0aa27f29334307de94be586c185f36951d9cad2f6d4d9dd920ba242d6e4226eb`. QA FT 2483/2484:18 dec; native testPSY0:9 dec; **no existing pUSDT**.
NFT 2496/other inventory unchanged.

## Changes

1. Explicit ordinary resident lifecycle binds binary, SDK, network, complete
   dependencies and one wallet. Private-file digest stays memory-only. Recheck
   before/after construction and each task; handshake precedes dispatch and IPC
   binds raw input hash.
2. Reuse only public circuits, immutable code and HTTP client; reset transaction
   session and regenerate state/nonce/witness/signature/full UPS each job.
3. Bounded independent dependency and leaf/nonce reads all drain before proceeding.
   Fee/expiry/code/layout/function/field/slot/endpoints/full-proof checks remain.
4. Historical receipts use up to four parallel reads but verify ordered history
   and indexed content hash. A single source-bound candidate overlaps both required
   reads. Shared concurrency cap, no completed/negative cache.
5. One financial job per wallet; ACK does not release the gate before reconciliation.
   In-flight reconciliation shares reads but returns copies; late A cannot clear
   subsequent B. Unknown/failure never auto-signs/reproves/pays again.
6. Finance uses strict integer serialization; only observation DTOs accept fractional
   milliseconds. Job times include writing/closing result logs.

Sources: [ordinary client](../../executor/ordinaryResident.mjs),
[native](../../amm/u124/vm-tests/src/bin/isolated_wallet.rs),
[receipts](../../executor/chainReceipts.mjs), [pair runner](../../executor/acceptance/runRpcOrdinaryComparison.mjs),
[audit](../../executor/acceptance/auditRpcOrdinaryComparison.mjs),
[report](../../executor/acceptance/reportRpcOrdinaryComparison.mjs).

## Ordinary-wallet pair (seconds)

Same machine/SDK/network/assets/market/vault/users/Sponsor, two Rayon threads per
prover, same calls/parameter counts/economic volume. Nonces/checkpoints/balances
naturally differ sequentially.

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| First Sponsor fee job, cold process | 104.823 | 108.309 |
| Four later fee jobs, mean (cold→warm) | 104.380 | 57.260 |
| Owner claim client job | 102.057 | 55.411 |
| Buyer claim client job | 110.425 | 63.948 |
| Owner claim end-to-end | 132.240 | 86.602 |
| Buyer claim end-to-end | 131.922 | 97.034 |

Fee-job reduction45.14%; claim client45.71%/42.09% are local paired observations,
not p95 or network throughput. Cold build did not improve: first Sponsor
circuit/session41.284 s, first total slightly slower. Warm tasks omit rebuild but
prove fresh. End-to-end includes JS reads, job, ACK, exact indexed receipt/common
checkpoint. Owner confirmation24.987→24.997 s, Buyer15.482→26.892 s, not faster.
Warm fee stages: session10.6–11.2 s, call proof19.7–21.1 s, signature/end-cap18.8–19.0 s,
final checks/submit4.4–4.9 s; SDK reads/recursion remain inside, not pure CPU.

## Actual readonly RPC ABBA

Same included transaction, serial/parallel/parallel/serial. Full returns retained;
compare identity/economic receipt, not per-GET envelope timestamps.

| Path | Serial1 | Parallel1 | Parallel2 | Serial2 | Requests/run |
| --- | ---: | ---: | ---: | ---: | ---: |
| Single recent candidate | 2.893 | 0.719 | 0.718 | 1.056 | 3 |
| Historical search | 8.204 | 2.843 | 1.855 | 6.124 | 14 |

Max fetches2/4, same request counts/checks. First serial includes cold connection,
so total delta is not attributable to scheduling. Recent queries occurred during
cutoff with provers idle; history after finance. Neither measures broadcast→confirm.

## Full proofs, confirmation and cost

| Seconds | Baseline | Candidate |
| --- | ---: | ---: |
| Commit cryptographic preparation | 99.211 | 99.655 |
| Settle cryptographic preparation | 160.740 | 161.162 |
| Commit ACK→indexed/common | 27.551 | 118.363 |
| Settle ACK→indexed/common | 163.621 | 26.984 |
| Cutoff wait | 329.930 | 612.110 |

Commit+settle stays~260 s. Confirmation combines network/index/common visibility/
polling and varies; it cannot be attributed to proof caching or RPC ordering.
Each round17 UPS/one fill/**17.000115 testPSY**, identical per-operation fees despite
limb carry changes. Ordinary-wallet sampled RSS7.966/10.688 GiB increases with
resident resources; sums include idle/shared pages, not physical/instantaneous peak.
Initial observer omitted compact-driver SHA, leaving full-prover RSS missing;
ordinary RSS is not all proving memory. Whole envelopes58.923/63.093 min include
development pauses/recovery/different cutoffs, not overall speedup or chain TPS.

## Failures and missing data

- First baseline order hit consumed-but-unclosed slot before request/broadcast.
  Both versions explicitly close_0/1 under existing rules before new orders.
- A512-checkpoint plan rejected before start proof/send; preserve it and use a new
  plan within deployed128 cap, not config-only capacity expansion.
- Native v1/v2 never used financially: retired for startup-binding window/missing
  IPC input hash. Actual release is v3.
- Candidate first two native jobs proved/ACKed but parent observation serialization
  used an integer-only writer. Exact original identities/receipts recovered; no
  replacement orders/proofs/payments. Financial integer checks remain strict.
- Those two outer totals stay null, not inferred from mtimes. Native stage data
  remains; after restart owner/buyer first consents are cold, not warm.
- Early baseline slightly overlaps builds/tests; final commit/settle/claims do not.
  All source generations/failures remain.

29 RPC/resident/integration,21 journal/recovery and3 native ordinary tests pass.
Independent audits verify all 34 actual signed full UPS against fixed key/common,
signer/vault, metadata/fees, nonce/root chain, FT/native and claims. Counts alone
are not production evidence.

Original `rpc-ordinary-performance-live-v1` is durable; old three-markets run stays
closed. Closure public/ACCEPTANCE-CLOSED-v1.json and PERFORMANCE-v1.json supersede
initial pending fields in original COMPLETE without overwriting it.

- [Baseline requests/proofs/receipts/source](../../executor/verification/2026-10-25-rpc-ordinary-baseline-live-v1/manifest.json)
- [Candidate and readable evidence](../../executor/verification/2026-10-25-rpc-ordinary-complete-v1/README.md)
- [Build/regressions](../../executor/verification/2026-10-25-rpc-ordinary-candidate-v3/manifest.json)
- [Exact timing-failure recovery](../../executor/verification/2026-10-25-ordinary-timing-recovery-v1/manifest.json)

Local Executor/QA ordinary CLI only, not browser/MCP migration. Local gate is not
cross-machine coordination. Upstream SDK/running images/upgrades remain in the
[main review](MARKET_BATCH_RELEASE_REVIEW_20261020.md). Deterministic pricing,
matching and NFT unique-sale semantics remain; one Book pair does not establish
other-market TPS, global fairness or production readiness.
