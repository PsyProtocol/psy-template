# Full proof and resident-resource memory acceptance — 2026-10-25

Closed milestone; later [fixed-verifier investigation](FIXED_VERIFIER_PERFORMANCE_REVIEW_20261025.md).

## Result and scope

Formal Executor supports optional macOS `release-unused-v1`; **default remains
retain-v1**. Collection-point/post-job resident RSS fell, but whole settlement did
not become faster. Several ordinary jobs and the full candidate round were slower.

Same branch; fixed SDK manifest
`0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`, all 1,466
consumed sources verified before/after. No Node, SDK, contract/layout or original
artifact changes. New matched live pair uses only **Book 2497/vault 662720**, two
members/one fill per round, one QA FT each. No four-market/max-capacity/multi-host
acceptance claim.

## Changes

1. Ordinary lifecycle JSONL is exclusively created/fsynced, recording process,
   ready/dispatch/native result/identity/completion, including client failure after
   ACK. Unknown results never trigger replacement signatures/payments.
2. Strict observer identifies ordinary/full-market/sealed binaries by release
   SHA, recording observer/release identity, PID/parent and streaming one-second
   samples; earlier full-market omission is fixed.
3. After owning full proof/end-cap input, release transaction session before full
   verification/final dependency/nonce/state checks and submit. Public circuits
   stay resident. Allocator only returns unused pages; no old state/witness/signature.
4. proverMemoryMode is configuration/resource identity. Unknown mode rejects;
   non-macOS new drivers reject reclaim mode. Stack/session/fee/fixed verifier/
   endpoints are not relaxed for old versions.
5. JSONL joins archive/wallet-material checks.

Use only the SHA-bound release in archived RELEASE.json; an option name does not
prove arbitrary old drivers support it. Default retain-v1; explicit opt-in:

```json
{"proverMemoryMode":"release-unused-v1"}
```

## Matched live measurements

Same machine/SDK/binary/source closure, two Rayon threads/native process,
QA instance/volume and resident resources. Every state/nonce/witness is new;
inter-round balance/Outbox/nonce/root continuity verifies.

| Metric | retain-v1 | release-unused-v1 |
| --- | ---: | ---: |
| Max sampled native-process RSS sum | 12.452 GiB | 12.011 GiB |
| Ordinary post-job median RSS | 1525.4 MiB | 1374.1 MiB |
| Market post-job median RSS | 1853.4 MiB | 1723.6 MiB |
| Executor Node endpoint max RSS | 489.9 MiB | 537.9 MiB |
| Public circuit builds, four/round | 41.62–42.18 s | 41.69–42.04 s |
| Fresh-process seller/buyer order | 135.850/131.527 s | 148.266/166.146 s |
| Four warm fee jobs, mean | 61.829 s | 72.872 s |
| Commit full preparation | 146.363 s | 124.601 s |
| Settle full preparation | 194.674 s | 202.207 s |
| Commit+settle preparation | 341.037 s | 326.808 s |
| Commit ACK→indexed/common | 34.423 s | 39.041 s |
| Settle ACK→indexed/common | 77.374 s | 35.693 s |
| Seller ordinary claim end-to-end | 142.352 s | 138.358 s |
| Buyer ordinary claim end-to-end | 142.326 s | 153.336 s |
| Protocol cutoff wait | 0.411 s | 58.827 s |
| Full round including reads/waits/snapshots | 2255.177 s | 2694.058 s |
| Actual fills/UPS | 1/17 | 1/17 |
| Actual test PSY fees | 17.000115 | 17.000119 |

All22 ordinary jobs have outer/lifecycle times; eight process builds and76
build/proof/session-cleanup collection points are complete. Two earlier missing
outer timings remain missing, not reconstructed. Candidate ordinary cleanup median
1539.3→1374.1 MiB, market1888.8→1723.6 MiB; retain points mostly unchanged.
Allocator API median51–199 ms is inside outer timing. Advisory released-bytes=0
is not used as a benefit; actual before/after RSS and independent samples are.

RSS includes idle residents/shared pages, not true instantaneous/physical/exclusive
heap peaks. Node endpoints are separate; asynchronous peaks are not summed. Cold
means a fresh process building SDK circuits, not flushed OS/disk cache. Cargo45.07 s
belongs to separate compilation evidence. Full preparation includes SDK reads,
call proofs, recursion/end-cap, not pure CPU/VM. One sequential pair with different
starting balances/nonces/network/compression cannot establish general peak benefits.
The observed3.54% sampled reduction does not hide slower warm fees, higher Node RSS,
slower settle or longer round. Evidence does not justify enabling reclaim by default.

## Security and actual acceptance

50 JS regressions plus two native mode/live-buffer tests and one JSONL archive/
secret-rejection test pass. Counts do not replace proof/financial audits.
34 actual UPS/requests independently verify using fixed Node key/common,
metadata/fees/endpoints; no orphan request, pending or duplicate payment.
Both ordinary claims succeed per round: each user -1 input/+1 output FT;
finite-account FT/native plus Outbox conserves, NFT identity/metadata unchanged.
No extra funds between rounds; four signer nonce/root chains are continuous.
QA FT 2483/2484 have18 decimals, native testPSY0 nine; QA NFT 2496 does not move;
existing pUSDT is unused.

Separate setup sends10 testPSY seller→Sponsor and claims it: two independently
verified UPS, fee 2.000004, excluded from comparison. Script stopped after original
transfer ACK to correct native claim method, then reconciled original identity.
Two parent-helper failures created no replacement transfer/extra claim; helper
source/logs remain. Initial inline-parent source and one EEXIST terminal output
were not archived and are not fabricated. Actual native source/binary, input,
wire/proof/receipt are complete; SETUP-RECOVERY-NOTES-v1.json documents the gap.
Total actual fee 36.000238 = pair34.000234 + setup2.000004. Keys/wallets excluded.

The extra0.000004 PSY is DA, not reclaim: cumulative claim cursors cross2^62,
four high limbs change0→1 at next four-Felt leaves because low lies at offset3.
Four new leaves ×1000 atoms. Send/balance limbs share leaves; not every high scalar
is another DA leaf. Exact requests/receipts: U124-FEE-EXPLANATION-v1.json.

## Remaining limits and evidence

Public builds still~42 s and resident SDKs keep several GB. This milestone did
not cache fixed common data; verification still~3.1 s. Full calls/recursion/SDK
reads, confirmation and protocol waits dominate. One macOS Book thin pair is not
four-market/max-capacity, multi-host, long-run memory or high-load acceptance.
Authenticated randomness, global inclusion, running images/upgrades remain open.
No chain TPS or production claim.

- [Build/regressions](../../executor/verification/2026-10-25-prover-memory-build-v1)
- [Actual pair](../../executor/verification/2026-10-25-prover-memory-complete-v1)
- [Memory/performance](../../executor/verification/2026-10-25-prover-memory-complete-v1/MEMORY-PERFORMANCE.json)
- [Closure](../../executor/verification/2026-10-25-prover-memory-complete-v1/ACCEPTANCE-CLOSED.json)
- [DA explanation](../../executor/verification/2026-10-25-prover-memory-complete-v1/U124-FEE-EXPLANATION.json)

Entries: config.mjs, compactAdmissionAdapter.mjs, ordinaryResident.mjs,
prover_resources.rs. runProverMemoryComparison serializes retain→audit→release→audit;
errors stop, never auto-resume finance. Source freezes before run. Auditors/reporters:
auditRpcOrdinaryComparison, auditMemoryFunding, reportRpcOrdinaryComparison,
reportProverMemory, verifyCompactArchive. Build/SDK/toolchain: RESOLVED-BUILD-v1.json.
Original `psy-market-recovery-20261023/prover-memory-performance-live-v1` is closed;
new experiments need new directories, retaining originals.

Branch identity: `markets-batch-capacity-recovery-20261020`.
