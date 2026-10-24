# Composition service candidate — local acceptance, 2026-10-24

Branch: `markets-batch-capacity-recovery-20261020`.
Baseline: `9acb6d614f6aad7b7e9a1fe5c6e0cb9e71273363`.
No Node, SDK, pricing, controller bytecode, SD-key policy or old contract update
is part of this change. This is not a production certification.

## Implemented

Formal `composition/run.mjs` uses `composition/service.mjs` for reconciliation,
action selection, bounded session recovery, orderly shutdown and unsigned
ordinary-owner final-claim handoff. The service holds no ordinary owner key.

Recovery requires a matching sealed proof-child response, exact
`start-compact-session` rejection for a pinned HTTPS endpoint, a regular output
directory containing only matching `failure.json`, and positive no-broadcast
evidence. Source, dependency, key and journal identities are checked. The old
proof child must exit before rebuilding. Restart reservations persist in the
financial journal; unresolved broadcasts block new business operations. Generic
errors, partial proofs, unknown ACKs and security failures do not authorize
substitute financial requests.

`composition/buildResources.mjs` reuses only three immutable source/IR/layout
verification closures, within one process and exact financial scope. Bound
inputs/tools are rehashed on every reuse. Live state, nonce, fees, signature
context and full UPS checks remain fresh. No transaction witness is cached.

An optional separate authority supplies authenticated leases and a durable
journal. Local HTTP/process tests cover contention, death/takeover before
broadcast, append ACK loss, authority restart, stale fences and no-send evidence.
See `executor/coordination/README.md`. Two physical hosts are unavailable;
cross-machine financial validation is not claimed.

## Matched source-verification experiment

Same machine, dependency, sealed driver, immutable configuration and live
read-only identity checks. ABBA order after a separate priming run:

| Adapter reconstruction | Trial 1 | Trial 2 | Median |
| --- | ---: | ---: | ---: |
| Full source verification each time | 207.000 s | 219.534 s | 213.267 s |
| Reuse verified immutable closures | 13.143 s | 11.321 s | 12.232 s |

Priming took 212.494 s. Two repetitions per variant establish reduced adapter
reconstruction cost, not faster transaction proving, settlement TPS or a matched
end-to-end trade speedup. No transaction was signed/broadcast by this experiment.
RSS endpoints are observations, not whole-process peak memory.

All five original rows are retained. The original benchmark failed while
serializing a fractional ratio through the integer-only protocol codec, after
all trials completed. `finalizeBuildBenchmark.mjs` checks those original rows,
identity/configuration/cache hits and exclusively writes the missing summary.
No trial or failed log is replaced. Future runs use the observational serializer.

Closed benchmark/dependency/regression evidence:
`executor/verification/2026-10-24-composition-build-reuse-v1` (82 files,
12,432,687 compressed bytes, every original compared). Its integrity result is
separate from the pending actual service financial proof/claim acceptance.

## New isolated financial acceptance

New controller **2494**, vault **117952**, owner **406720**. QA-A 2483 and QA-B
2484 use 18 decimals; test PSY contract 0 uses 9. No pUSDT is used.
Independent publisher deployment request:
`3fe717a2e5076cc7b8ee064dd6fa9308e4694583329a631275571970729d50e8`.
Registration checkpoint: 372739.

An earlier deployment returned a historical receipt for old controller 2492.
The fresh-occurrence guard rejected it before registration or funding. Request,
rejection and logs are preserved; possibly allocated 2493 is unselected and
unfunded. Content hash is not a unique queued deployment occurrence; an index
404 is not cancellation.

Accepted flow: ordinary funding plus cancellation in one UPS; explicitly injected
proof-session read rejection; formal service rebuild; controller fund/return
UPSs; ordinary-wallet claim of the exact exported unsigned request. This is a
zero-fill recovery case, separate from the baseline's real two-pool successful
trade and one-fill intermediate-asset recovery.

**Status: local financial acceptance and independent post-run audits passed.**
The complete marker, ordinary claim proof, exact fee accounting, zero controller
residual and cohort audit are present. Final integrated regression: 118 passed.

| Actual operation | Included checkpoint | Fee (test PSY) |
| --- | ---: | ---: |
| Ordinary funding + cancellation | 372882 | 1.000013 |
| Controller fund (7 actual calls including fee) | 372962 | 1.000011 |
| Controller return-input (5 actual calls including fee) | 372987 | 1.000008 |
| Ordinary owner claim | 372997 | 1.000006 |

Four actual UPSs cost **4.000038 test PSY**. The controller's 20.002 PSY budget
equals 2.000019 controller fee burn plus 18.001981 gross refund. The ordinary
claim separately costs 1.000006; its native balance moves from 19.994526 to
36.996501 PSY. Actual spendable QA-A increases by exactly 1 token and QA-B by
exactly 1 atom (0.000000000000000001 token), matching sender and claim cursors.
Controller phase is 99 with zero QA-A, QA-B and native balance.

The ten-account explicit cohort conserves 1,000 QA-A and 1,000 QA-B including
all directed internal Outboxes. Its accumulated 102.000815 PSY burn matches
102 independently verified actual UPSs, with an actual-fee mutation rejected.
The new ordinary claim is also checked against its historical start/end leaves
and asset/native cursor deltas. This is not a global inventory/finality proof.

A second independent local process is excluded by the live financial holder's
lock before quote/prove/submit (all three invocation counters zero). Its first
attempt timed out waiting for a post-rebuild execution window, before entering
the financial service; the original log remains and the later observation has
a fresh label. This test uses actual guarded startup/live journal plus unused
QA tripwires, not two physical hosts or coordinator-mode financial takeover.

Actual `composition/run.mjs CONFIG once` after ordinary claim returns completed,
creates no new broadcast and leaves the financial journal byte-identical.

The first live harness invocation stopped on a frozen-array mutation before any
owner funding request file, wallet command or financial journal existed. Its
source snapshot, source-build metrics and failure log are preserved. The client
now has an explicit `prepareOwnerFundingAndCancel` builder which clones the
unsigned input, preserves canonical funding authorization and binds cancellation
to the actual intent nonce. A regression verifies this with the frozen model.
Continuation `v3` resumes only the failed live stage with fresh source/log names;
deployment, registration and the completed before-audit are not repeated.

## Actual timing and remaining bottlenecks

The zero-fill cancellation/recovery case takes **2,687.793 seconds** wall time,
including cold construction, ordinary funding, explicit failure injection,
bounded restart/backoff, fee preparation, proofs, submission/common-checkpoint
observation, ordinary claim and final reads. It excludes the earlier deployment,
standalone benchmark and independent post-run proof audit. It is not trading TPS.

| Measurement | Observed duration |
| --- | ---: |
| Live cold source/IR/deployment verification closures | 204.410 s total |
| Same three closures rechecked on recovery cache hits | 0.510 s total |
| Actual guarded adapter reconstruction on recovery | 18.473 s |
| Ordinary funding process / acknowledgement to common inclusion observation | 218.020 s / 120.313 s |
| Controller fund preflight / durable intent to inclusion observation | 142.199 s / 130.893 s |
| Controller return preflight / durable intent to inclusion observation | 86.904 s / 105.485 s |
| Ordinary claim process / acknowledgement to common inclusion observation | 119.082 s / 61.252 s |
| Terminal CLI full startup/re-entry, no financial work | 241.864 s |

The first service adapter factory handoff was 23 ms because acceptance had
already built that adapter before ordinary funding; it is **not** cold startup.
The guarded reconstruction interval excludes the separately recorded restart
backoff. The earlier ABBA experiment is the matched comparison; these live
phases are one recovery case, not a matched before/after financial comparison.

Actual SDK preflight timers (seconds):

| Operation | Call proving | Signature | Recursive finalize | End-cap | Full verify |
| --- | ---: | ---: | ---: | ---: | ---: |
| fund | 80.217 | 2.397 | 21.923 | 4.937 | 3.368 |
| return-input | 36.053 | 2.240 | 14.980 | 4.509 | 3.008 |

These are the SDK's measured wall intervals, not VM benchmark numbers. Do not
add nested timings or treat missing construction timers as free construction.
Ordinary process times combine construction/read/proof/verify/HTTP. Inclusion
observation intervals also include verification, fresh reads and polling; pure
network confirmation latency is not isolated. Six fee traces were generated
across initial preparation, reconstruction and refund. Repeated fee preparation,
guard reads and SDK session work remain end-to-end optimization targets; the
startup experiment does not establish that trading settlement is faster.

Maximum sampled sum of the covered wallet processes' RSS: 6,261,899,264 bytes
(about 5.83 GiB), across 2,291 two-second samples. Node parents, compiler/
inspector/verifier binaries with other names and unsampled peaks are excluded;
shared pages may be counted twice. This is neither per-stage peak memory nor a
matched memory improvement result.

The route still requires the owner's explicitly declared refundable **one-atom
QA-B initialization** and PSY fee budget. A-only onboarding, arbitrary routes
and cross-vault atomicity remain unimplemented. No executor pre-funding or
implicit recipient/fee authority is introduced.

Closed financial/service evidence:
`executor/verification/2026-10-24-composition-service-live-v1` (837 files,
24,932,866 compressed bytes; all originals compared). It includes the joined
`SERVICE-LOCAL-ACCEPTANCE-COMPLETE-v1` marker, requests/receipts/full proof reports,
all post-run audits, SDK/core recheck, process/resource logs and original failed
invocations. Read-only finalization initially rejected observational fractions
with the protocol parser; v2 separates observational parsing from all financial
integer parsing. Source/logs remain, and no financial artifact was changed.

## Frozen dependency and external evidence

SDK manifest remains
`0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`;
the 1,466-file local snapshot and lock/config/genesis hashes remain frozen.
The user identified `release/testnet-stable` as the deployment branch; a branch
name or HTTPS observation does not attest the running binaries.

| Owner | Required delivery and acceptance |
| --- | --- |
| Runtime operations | Coordinator/realm/edge binary or image digests linked to reviewed commits/config; authenticated checkpoint and state anchors. |
| Security/operations | Effective upgrade RPC auth configuration and isolated unauthorized/replay rejection evidence; code/layout trust boundary. No old-contract upgrade probe. |
| SDK maintainers | Reviewed reproducible release matching frozen session binding, source/toolchain and dependency locks. Upstream migration remains separate. |
| Deployment API | Caller-bound idempotency and durable accepted/queued/included/rejected/expired status; terminal rejection/expiry guarantees no later enqueue. |
| Randomness provider | Authenticated unpredictable, hard-to-bias future seed/checkpoint proof, commit-before-reveal and timeout/non-redraw rules. Deterministic mode remains enabled. |
| Execution operations | Future second host, authenticated TLS authority and identically mounted durable artifacts, tested partitions/fencing/takeover. User currently requests local acceptance. |

Test counts and startup speed do not close these boundaries. Selected-queue
completeness does not prove global inclusion or censorship resistance. Multi-UPS
composition remains a staged financial workflow, not cross-vault atomicity.
