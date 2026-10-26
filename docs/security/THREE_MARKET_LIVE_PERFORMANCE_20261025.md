# Three-market actual fills and proof recovery — 2026-10-25

Same branch/frozen SDK; no Node/SDK/legacy contract/layout change. All originals
and failed attempts remain. Event times UTC; report date Asia/Taipei.

## Financial results

**Three economic fills, five members, 48 actual UPS receipts, 51 distinct complete
proofs independently verified.** Both ordinary QA claims confirmed **376332**;
FT pending between new vaults/traders cleared. NFT belongs only to buyer 406720,
with unchanged token ID/metadata. Finite eight-account totals are1000 per FT;
per-account/vault/native fee changes conserve.

Assets: QA FT-A2483/FT-B2484 at18 dec, NFT 2496; test PSY fees at9 dec. No pUSDT.

| Market | Contract/vault | Members/fills | Commit checkpoint | Settle checkpoint |
| --- | --- | --- | --- | --- |
| Orderbook | 2497 / 662720 | 2 / 1 | 375695 | 375801 |
| Curve | 2498 / 302272 | 1 / 1 | 375675 | 375786 |
| NFT | 2499 / 1072320 | 2 / 1 | 376149 | 376278 |

Owner1717440 gains5 QA-A, unchanged QA-B; Buyer406720 loses4 QA-A/1 QA-B and gains
one NFT. Curve loses1 QA-A/gains1 QA-B; Book/NFT/existing AMM vault FT net changes
zero. Curve cap2 QA-B costs1; surplus1 claimed. Snapshot38 UPS cost38.000412 PSY;
setup10 cost10.000077; total 48 cost**48.000489**. Readonly proofs/rejection tests
have no transaction burn.

## Application changes

Persist complete verified UPS before final public reads, separating liveGuardsPending
from success. Persistence alone does not authorize broadcasting. After final-read
or parent failure before journal proved, locate by exact driver/task/policy/RPC;
native rechecks full stack/session/sig_hash/fees/network/code/layout/start/nonce/
expiry before reusing the original. Recheck failure stops, never auto-reproves/
pays; unknown broadcasts reconcile first. Proving resources start lazily only for
new proof work. Resident identity/key exclusivity/failed-child checks remain.
Coalesce only identical simultaneous reads, removing completed entries; Rust guard
reads have bounded1/4 concurrency. Confirmed nonce conflicts report terminal state.
Pricing/priority/NFT uniqueness/shared vaults/deterministic order unchanged.

## Actual thin-batch observations

| Market | Commit→settle window | Commit+settle fee PSY | Response→indexed/common commit/settle s |
| --- | ---: | ---: | ---: |
| Book | 19.62 min | 2.000048 | 32.455 / 41.099 |
| Curve | 17.49 min | 2.000045 | 22.660 / 35.700 |
| NFT | 22.60 min | 2.000072 | 32.771 / 27.673 |

Windows include actual preparation/proof/checks/HTTP/polling/local scheduling,
exclude earlier admission/funding/final claims; NFT includes injected restart.
Invalid tasks/development/build/recovery remain in the whole timeline. Not pure
block time, steady throughput or chain TPS; no controlled old network group.

| Market/stage | Calls | Native full preflight s | SDK calls incl reads s | Explicit recursion s | End-cap s | Verify s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2497 commit | 3 | 293.331 | 179.439 | 9.346 | 4.628 | 3.052 |
| 2497 settle | 11 | 345.911 | 253.303 | 33.434 | 4.601 | 3.047 |
| 2498 commit | 3 | 167.756 | 106.569 | 8.937 | 4.657 | 3.024 |
| 2498 settle | 8 | 277.426 | 188.797 | 24.389 | 4.597 | 3.137 |
| 2499 commit | 3 | 190.930 | 123.971 | 8.997 | 4.449 | 3.014 |
| 2499 settle | 12 | 326.449 | 223.312 | 35.738 | 4.803 | 3.087 |

Wall times include SDK execution/RPC/partial recursion, not pure CPU. Key/session
startup is separate in originals; unexplained native time is not labelled RPC.

| Ordinary claim | Cold process→response s | Response→indexed/common s | Fee PSY |
| --- | ---: | ---: | ---: |
| buyer-payout-claim-v1 | 224.940 | 48.480 | 1.000009 |
| owner-payout-claim-v1 | 228.781 | 59.180 | 1.000009 |

Cold client includes build/read/prove/verify/HTTP; old client lacks internal pure
proof/RPC separation, explicitly left missing.

## Same-input component checks

Curve initialization full UPS from the same authenticated start/public core/nonce/
fee/end: warm 98.504 s, cold 180.060 s, including42.334 s build/7.353 s historical source
and call variance. One pair is not algorithm/network speedup. Saved-proof guard
ABBA means: Book 17.621→14.124 s, Curve 16.378→15.373 s, not reproof. NFT window expired
before completion; two partial samples retained, no acceleration claim.

Actual NFT parent restart: original cryptographic preparation182.122 s (final checks
separate), exact native reverify22.873 s. Same request hash, one generated proof,
one journal proved/intent/receipt, no repeat payment. Different stage scopes mean
no whole-round percentage.

Readonly coalescing ABBA, four simultaneous snapshots/four fixed-checkpoint leaf
reads each, all values equal:

| Order | Logical attempts | Physical owners | Waiters | Wall s |
| --- | ---: | ---: | ---: | ---: |
| baseline | 12 | 12 | 0 | 17.746 |
| optimized | 16 | 4 | 12 | 39.835 |
| optimized | 12 | 3 | 9 | 2.377 |
| baseline | 12 | 12 | 0 | 9.537 |

First optimized includes timeout/retries; no slow sample excluded. Fewer requests,
mixed latency, no overall-read speedup. This deliberately repeated pattern is not
whole-Executor acceleration. Actual JS instrumentation:3625 logical/3536 physical/
89waiters, excluding SDK reads.

Memory:13086 samples, max selected wallet RSS sum12.134 GiB on32 GiB; observer-version
gap8.332 s. Includes concurrent wallet/verifier/shared pages, not exclusive/physical/
instantaneous peak or reduction; missing parent endpoints stay null. Incremental
v3 build40.78 s used existing SDK cache, not clean compilation. Stopped default
compiler attempt never published/executed; logs remain, frozen toolchain explicit.

## Recovery and audit

- Empty-queue timeouts lawfully abort Book/NFT. Unknown Curve admission ends only
  after a legitimate timeout abort with same start/nonce 4 confirms. Both proofs
  verify; journal resolved-by-confirmed-conflict does not pretend no broadcast.
- Original deposits reused with new epoch consent; no duplicate funding, complete
  accepted-set processing.
- NFT restart reuses original; native rejects unexpired consumed UPS on start/
  nonce checks without broadcast.
- All48 receipts match proof/core/fees/nonce/endpoints. Cold/unselected candidates
  bring distinct proofs to51; actual fee tampering rejects.
- 47 client/adapter/resident,20 journal/terminal, two Rust guard and report tests
  pass; counts do not establish production readiness.
- First aggregator stopped on null-prototype comparison; field comparison fixed
  then all records reverified. Missing memory initially stopped reporting; explicit
  null fixes it. Original failures/source generations remain.

## Boundaries and reproduction

No controlled full-route old/new network or steady/full-capacity load group.
The~5.07 h financial snapshot interval includes failures/recovery/waits/development,
not normal transaction latency/capacity. Full calls/SDK reads/repeated checks/
ordinary cold startup dominate; explicit end-cap4.4–4.8 s alone is not the pipeline.
SDK release/running image/upgrade trust remain external; fixed dependencies are
not migration. Same-host locks/restarts are not multi-host acceptance. Scoped
queue completeness is not global censorship resistance. No authenticated future
seed, uniform clearing, liquidity sharding or invoke_sync. One pool remains ordered.

Sources: compact_market_wallet.rs, preflightRecovery.mjs, compactAdmissionAdapter.mjs,
residentScope.mjs, readSingleFlight.mjs; actual resumeDurableNftV2/rejectConsumedNftProof,
auditThreeMarkets/reportThreeMarketPerformance acceptance tools.

[Closure](../../executor/verification/2026-10-25-three-market-performance-complete-v1/ACCEPTANCE-CLOSED.json),
[audit](../../executor/verification/2026-10-25-three-market-performance-complete-v1/AUDIT-SUMMARY.json),
[performance](../../executor/verification/2026-10-25-three-market-performance-complete-v1/PERFORMANCE.json),
[reads](../../executor/verification/2026-10-25-three-market-performance-complete-v1/READ-ABBA.json),
[dependencies](../../executor/verification/2026-10-25-three-market-performance-complete-v1/DEPENDENCY-CHECK.json),
[original manifest](../../executor/verification/2026-10-25-three-market-performance-complete-v1/manifest.json).

SDK manifest 0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425:
all 1466 sources/config/original Node diff unchanged. Original client bb15dc44…6e520,
durable39be37cc…3c02f, verifier95344886…9cf; full hashes in TOOLS/RELEASE. Book/Curve
used original app, NFT durable app; same SDK/semantics is not controlled version A/B.
Original durable directory: `psy-market-recovery-20261023/three-markets-performance-live-v1`.
Final independent-verification-v2/SUMMARY.json, public/PERFORMANCE-v3.json. Binaries
are excluded from Git; source/frozen builds/hashes supplied. No keys/recovery files.

```sh
python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-25-three-market-performance-complete-v1
# Integrity is not cryptographic verification. Resolve original paths via manifest.
# Set PSY_CASE_DIR to the restored original run, without editing signed requests.
PSY_REVIEW_LABEL=review-$(date -u +%Y%m%dT%H%M%SZ)
PSY_FRESH_AUDIT_DIR="$PSY_CASE_DIR/independent-$PSY_REVIEW_LABEL"
PSY_FRESH_REPORT="$PSY_CASE_DIR/public/PERFORMANCE-$PSY_REVIEW_LABEL.json"
node executor/acceptance/auditThreeMarkets.mjs "$PSY_CASE_DIR" "$PSY_FRESH_AUDIT_DIR"
node executor/acceptance/reportThreeMarketPerformance.mjs "$PSY_CASE_DIR" "$PSY_FRESH_AUDIT_DIR/SUMMARY.json" "$PSY_FRESH_REPORT" "$PSY_CASE_DIR/public/RESOURCE-SEGMENTS-v1.json"
```

Readonly re-audit only. Financial recovery refuses closed COMPLETE cases. A new
network/case needs fresh isolated identities/deployments/funding, not zero-config
release or replay of historical operations.

## Additional preserved source references

- [compact_market_wallet.rs](../../amm/u124/vm-tests/src/bin/compact_market_wallet.rs)
- [auditThreeMarkets.mjs](../../executor/acceptance/auditThreeMarkets.mjs)
- [rejectConsumedNftProof.mjs](../../executor/acceptance/rejectConsumedNftProof.mjs)
- [reportThreeMarketPerformance.mjs](../../executor/acceptance/reportThreeMarketPerformance.mjs)
- [resumeDurableNftV2.mjs](../../executor/acceptance/resumeDurableNftV2.mjs)
- [compactAdmissionAdapter.mjs](../../executor/compactAdmissionAdapter.mjs)
- [preflightRecovery.mjs](../../executor/preflightRecovery.mjs)
- [readSingleFlight.mjs](../../executor/readSingleFlight.mjs)
- [residentScope.mjs](../../executor/residentScope.mjs)
