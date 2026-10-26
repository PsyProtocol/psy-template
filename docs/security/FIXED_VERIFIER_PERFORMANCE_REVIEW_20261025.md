# Fixed-verifier reuse and warm-job regression investigation

2026-10-25/26, same branch and selected session-bound SDK. No Node/SDK/market-
semantic/legacy-code/layout change; original builds, requests and receipts remain.
This English editorial revision puts the final result first and retains the
historical recovery chronology below. The complete earlier wording remains in Git
at the pre-language-review commit; raw evidence is unchanged.

## Final 2026-10-26 pair: actual fills and full lifecycle memory

[Closed report/2682 originals](../../executor/verification/2026-10-26-complete-cold-warm-pair-v1/README.md):
**34 actual UPS, two Book fills, four ordinary claims, zero failures/retries**.
Same source closure/v4 binaries/frozen SDK/machine/two threads/retain/warmup/cutoff;
only fixed verifier fresh/cached differs. Every full proof/receipt/fee/finite asset
and cross-round nonce/root chain verifies. Node/SDK unchanged.

| Metric | fresh | cached |
| --- | ---: | ---: |
| Whole parent lifecycle, bootstrap/claim/cleanup | 1954.649 s | 3925.458 s |
| Three ordinary cold builds, individual range | 43.046–43.644 s | 41.285–41.757 s |
| Four warm fee jobs, mean | 57.025 s | 53.143 s |
| Fixed-resource builds/count/time | 23 / 70.591 s | 10 / 30.352 s, 13 hits |
| Full commit+settle preparation | 259.600 s | 279.600 s |
| Cutoff wait | 102.316 s | 1294.638 s |
| Whole process-tree sampled RSS maximum | 9.159 GiB | 12.641 GiB |
| Cold-build-window tree RSS maximum | 9.144 GiB | 12.111 GiB |
| Warm-fee-window tree RSS maximum | 3.690 GiB | 3.290 GiB |
| Actual test PSY fees | 17.000117 | 17.000115 |

Repeated verifier construction decreases and every proof still verifies, but
whole round is slower and cold/full sampled memory higher: **no overall speedup,
memory reduction, chain TPS or production conclusion**. Financial delta+1970.824 s:
cutoff+1192.323, ordinary critical intervals+332.790, market-success+441.100,
other+4.612. SDK RPC is inside settle proving, so CPU/network/memory causes are
not fully separable. Fee difference comes from slots_modified21→19, not cache.

1951/3918 samples, max gaps1167/1199 ms, cover before launch through final snapshot/
claim/cleanup. RSS includes shared pages/concurrency/idle resources, not physical
or instantaneous peak; component/window peaks cannot sum. Cold means fresh process/
circuits, not flushed OS/SDK disk cache. One sequential pair is not universal or
an actual rerun of the other markets. Preparation52/report10 regressions pass
(with reruns);80 archived signed copies have consumed nonces; three real wallets'
27key representations yield zero matches.

## Candidate mechanics and earlier attribution

`fixed_verifier.rs` OnceLock stores only immutable fixed Node end-cap key/common
within one binary/frozen SDK. It caches neither proof-validity result nor witness,
state, nonce, fees, transactions or signatures. SDK get_cached_common_data_library
otherwise constructs four lookalike circuits each call; retain only needed common
data, not the temporary proving library.

Every access checks explicit profile/compiled network domain. Each request runs
full verification and compares session verifier with fixed key. Stack/session/
sig_hash/caller/parameters/fees/endpoints/dependency roots/nonce/expiry and outer
resident identity/state isolation remain. No disk cache or supplied verifier key.
Modes only fresh-v1/cached-v1; invalid fails without downgrade. Default cached-v1;
proverMemoryMode stays retain-v1. First access still builds; short-lived verify/
broadcast-prepared children each pay it. No cross-process cache claim.

Earlier saved-proof component test, same process/two included ordinary+SD-key UPS,
ABBA fresh/cached/cached/fresh: fresh median3098.54 ms/four samples, first cached
3119.93 ms/one, warm cached median3.545 ms/three, full proof verified each time.
Not new proof/RPC/confirmation/claim/fee throughput. Native equality rejects
unrelated circuits under both paths. Earlier53JS and later 74JS, three fee-only/
lossless tests, three transport, two fixed-verifier tests and eight real saved-proof
positives plus mutation/domain/mode negatives are staged evidence, not additive
production certification.

Previous reclaim pair (one Book fill/17 UPS each) warm mean stage delta:

| Stage | release-unused minus retain |
| --- | ---: |
| Session initialization incl SDK reads | +3.660 s |
| Call proving incl SDK RPC | +2.075 s |
| Signature/end-cap | +0.147 s |
| Full verify | -0.057 s |
| Final state checks | +1.470 s |
| Broadcast→HTTP result | +3.780 s |

All four jobs were warm, without WalletSession rebuild. Fixed verification still
rebuilt~3.1 s but was not the entire regression. Whole2255.177→2694.058 s,+438.881:
ordinary critical+295.974, market-success+63.539, cutoff+58.416, other+20.952.
Parallel critical paths use real intervals, not summed job durations. Reproduce
readonly with diagnoseWarmFees.mjs CASE FRESH_REPORT, recording source hashes.
No attribution of all slowdown to allocator or RPC.

## Recovery chronology (historical, not current pending states)

### Initial v1 network interruption and v2 cutoff

After commit HTTP result, receipt reads repeatedly500; parent exited safely,
retaining request/proof/identity. Readonly reconcileComparisonOriginal confirmed
the original commit without reproving/resubmitting, then only settle/claims ran.
17actual UPS/one fill/full audit closes that interrupted round, excluded from
clean cache A/B. Missing parent time/cutoff/failure logs remain missing/original.

receiptReader catches only exhausted ReadUnavailable, returning unresolved/
readUnavailable with original gate. Later same-identity polling is allowed;401,
invalid identity/structure/authentication still throw. Unknown is not rejection or
re-sign permission. PSY_RECEIPT_READ_UNAVAILABLE records failures; polling budget
still bounds prolonged outages.28related tests pass, including three 500/no other
request and next-poll recovery;401 is not swallowed.

v2 second admit proved then final broadcast-window-expired rejected, without send.
Original cutoff 381727 unchanged; first member accepted, second not. Freeze exactly
one accepted member, commit/finish lawful Book carry, zero fills/payout. A helper
incorrectly expected refund; empty payoutClaims rejects before constructing a claim.
Original owners then cancel/release_unaccepted under terminal epoch/request_recovery,
restricted payer refund and ordinary claim. Carry is not itself a refund.

Warm fixed policy/config before fixing the real epoch; warm metadata is not an
accepted set. Re-read fresh checkpoint after warmup then never alter cutoff.
Count warmup in total/cold cost. Independent users' consent and one Sponsor fee
may overlap; subsequent shared Sponsor grant waits for consumption/nonce. Warm/prove
mutually exclude and dead children do not auto-restart.45related tests pass;
128 checkpoint contract cap not expanded. Both future controls use identical warmup/
authorization scheduling, with setup/recovery separate from fills.

### Original unknown cancel, authorized nonce 44 noop and HTTP413

QA 1717440 request_cancel/release_unaccepted/request_recovery at transaction nonce 44
(order nonce 7) timed out30.0198 s. Suppressed-error SHA matched the public realm 1
operation-timed-out error. Session25.797 s/final reads16.662 s were network waits,
not verifier construction. SDK get_tx_status reports nonce-derived Submittable/
Stale, not durable accepted/queued/finally discarded status. Service team still
needs source-bound durable original-request disposition; no Node edit here.

First noop v1 was never sent and expired before authorization. User authorized
one fresh same-nonce pure noop, fee 1.000001 PSY/no FT/NFT. Account nonce 43/start
root rechecked, expired candidate retained, v2 fully proved/verified. One formatted
send returned413 invalid-or-oversized-body, no ACK/exact receipt. Original lock/
request/failure preserved. Wire1,119,272→466,115 bytes via token-aware whitespace
compaction without JS Number, preserving U124 literals/escapes/proof/signature;
independent proof reverified. This establishes size, not server limits/disposition.

At10:52:15UTC common382678/realm 382679, account still43/root
23189890dec66366d00fbbf9b88d6911fb594ecb6727b2ece23cf42c5665dfb8.
No evidence of permanent discard. Compact retry awaited explicit one-time
additional authorization; no new cancel/transfer/refund or confirmed noop fee then.
Same-nonce conflict audit requires both full proofs, same user/public-key/nonce/
start and winner historical endpoints/indexed receipt/fees/common visibility.
Timeout/413/expiry/high nonce alone cannot retire an original.

After additional authorization, exact original/noop lookups, fresh window and
absence of added send lock passed. Lossless status/trailing-newline type fixes
were tested; two pre-send format rejections made no submission. Compact request
sent once, HTTP200/ok, exact inclusion/common **382717**, fee**1.000001 PSY**, no
FT/NFT. Both cancel and winning noop independently verify, same start/user/key/
nonce 44 and distinct end. Confirmed conflict retires original; no further noop.
[413](../../executor/verification/2026-10-25-nonce-retirement-413-v1/README.md),
[confirmed conflict](../../executor/verification/2026-10-25-nonce-retirement-confirmed-v1/README.md).
Active signed payloads stay private until consumed; public early evidence is
nonexecutable summaries/verification/responses only.

### Nonce45 cancel and failed-round refunds

Fresh cancel45 compact477,572 bytes also413 after68.662 s. Readonly HTTP1.1/2/Node/
same Rust dependency succeeded on comparable reads, not proof of actual413 cause;
no protocol switch/check deletion or declared repair. Under existing recovery
authorization, reconcile exact original, independently verify and recheck network/
roots/start/user/key/nonce/expiry, then send identical signed bytes once under a
new recovery lock. No signature/business/fee/expiry change. Duplicate receipt
surfaces deduplicate one UPS, fee 1.000005 PSY. First refund confirmed382810/claimed.
[Exact original cancel](../../executor/verification/2026-10-25-ordinary-exact-recovery-v1/README.md).

At12:28UTC both users' refund/claims and two unfunded-order cleanups close:
**24 UPS/zero fills/24.000133 PSY**. Both FT totals1000, individual balances restore,
FT Outbox clear, NFT 2496/metadata/pending unchanged, no pUSDT. Snapshot comparison
now handles lossless/live object prototypes and BigInt versus Number IDs without
omitting Outbox.15targeted tests pass. Confirmed nonce consumption makes archived
old proofs unusable;1466SDK sources/Node unchanged.
[Closed failed round](../../executor/verification/2026-10-25-retired-refunds-closed-v1/README.md).

### Sponsor surplus, scoped recovery and 15-UPS closure

v3 after orders/first fee but before start_epoch rejects strict fee cursors:
Sponsor→Book sent48.0048, claimed/settled43.0043, pending**5.0005 PSY**. Of it4.0004
was old blind two×2F top-up despite adequate gas;1.0001 new. Previous24 UPS audit
included pending as assets, not falsely claimed returned Sponsor funds.

sponsorGrant now requires zero pending or adopts one exact unused amount/purpose/
vault/nonce grant; rejects mismatches/duplicates/cursor drift/overflow. Entry checks
before orders and each fee. Recovery funds actual gas deficit, optionally fund_gas,
not blind2F. Only explicitly recovery-enrolled Sponsor may request own unused input;
normal discovery excludes it to prevent old enrollment revoking fresh grants.
Uninitialized foreign state reports a gap before proving. Two one-atom QA FT seeds
materialize accounts then return/claim, not market trades.

63related JS tests pass; first expanded regression used wrong deployed-asset IDs,
retained failure, then standard41/42/43fixtures passed without weakened assertions.
Sponsor refund confirms**383109**/claimed; buyer order refund**383213**/claimed,
plus separately accounted10 PSY internal QA funds. Native refund send/buyer cancel68
had transport exceptions. Reconcile then controlled identical signed request once,
without new proof/nonce/amount/expiry; each moves assets once. Ordinary claim
start-ordinary-session failed before request/proof/intent; exact original input/
deadline retried in new directory under strictv3 mapping.

Guard accepts reviewedv4 SHA/exact files/known pre-sign stage/no-broadcast markers,
rejects any signed payload/intent. Observation metrics use fractional JSON only;
finance/proofs remain lossless. Oldv1/v2 retained;78related tests pass. No inference
that exceptions mean server discard. [Scoped originals](../../executor/verification/2026-10-25-scoped-original-recovery-v1/README.md).

Final cleanup also had broadcast uncertainty/one exact-delivery timeout. Added send
binds first failure/original bytes, rechecks receipt/full proof/identity/dependencies/
nonce/start/**owning realm** expiry, sends same request. No resign/replacement.
83 tests reject stale common masking realm expiry, changed request/lock, already
ACKed and third added send. **15actual UPS/zero fills/15.000077 PSY** closes refunds,
Sponsor 5.0005 PSY, two seeds, per-account FT/native/NFT/Outbox and four nonce chains.
Separate internal10 PSY U→buyer is not fees/faucet.
[Unused Sponsor closure](../../executor/verification/2026-10-25-unused-sponsor-closed-v1/README.md).

Readonly setup inheritance checks full preceding audit/four current endpoints,
reusing existing two QA transfers, **zero new transfer/claim**, no old-proof resend
or double-counted fee. v1/v2/v3 directories remain; v4 pair was planned with only
verifier mode changed, same binaries/SDK/threads/retain/warmup/scheduling.

### v4 checkpoint read failure, unsigned session recovery, actual fill

v4 before warm/freeze, after orders/fee: public heads timeout, **3 UPS/zero fills/
3.000015 PSY**. Sampler stops, not a clean performance pair. Bounded classified-
transport recovery drains old reads then rereads all heads; no extra normal-path
request or broadcast retry. Manual guard verifies all three proofs/receipts, three
current nonce/endpoints, vault/dependencies/network and exact one unused grant.
Initial prototype mismatch rejects; corrected comparison passes,21 tests. Fractional
outer observations no longer use financial integer writer.
[Prefix evidence](../../executor/verification/2026-10-26-checkpoint-read-recovery-v1/README.md).

First admission start-compact-session fails unsigned; guard binds exact directory/
producer/driver/policy/network/journal and rejects proved/sent/wrong stages. Readonly
sampling does not establish root cause; no proxy/SDK/Node edits. Head383492 shows
original send window383522 still valid, so stop empty-queue waiting before any exit
submission and resume original admission. Members confirm**383503/383524**, epoch 9,
cutoff 383577, original deposits/orders, no new consent or actual abort.109 tests.
Snapshot comparison handles persisted BigInt/prototypes/live metadata without
weakening asset/pending/NFT checks. [Unsigned recovery](../../executor/verification/2026-10-26-unsigned-session-recovery-v1/README.md).

Final original epoch 9/two members/order nonce 11 closes **17 UPS/17unique full proofs/
one fill/17.000118 PSY**, ordinary claims**383716**, FT totals1000 each, all per-account
and native fee changes/NFT 2496/nonce/root chain verify. Native vault+1.000623 PSY is
authorized execution surplus, not extra burn/unclaimed Sponsor. All scoped native/
FT pending clear, no duplicate funding/new consent/empty abort.

Seal connection failure reuses the same verified full proof→**383609**; commit
**383637**. Settle VM proof gets empty JSON: guard proves fixed pure-proof producer,
no complete request/broadcast, unchanged committed state/task, then rebuilds settle
→**383705**. Local VM partial work is not full-proof reuse. Exact-reuse overly broad
guard, snapshot type mismatch and failed-child timings fixed;122related tests.
[Full closure](../../executor/verification/2026-10-26-fixed-verifier-recovery-closed-v1/README.md).

Bootstrap267.731 s; successful commit/settle327.808/235.058 s incl reads/recursion.
24 fresh verifier builds78.855 s; verification itself~89.674 ms total. Ten ordinary
cold builds42.964–50.835 s reveal restart overhead. Only one genuinely warm fee job
57.685 s plus153.284 s confirmation, not four-sample paired mean. ENVIRONMENT→snapshot
142.250 min includes cutoff/network/manual pauses/rebuilds. Full parent timing null;
sampling did not continue after first failure. Not a clean A/B or speedup.
2403originals compare hashes; consumed signed nonces, zero key-value matches,
1466 sources/original Node diff unchanged. RPC structured diagnostics/stability,
service/network/upgrade authorization/replay rejection, multi-host/random/global
inclusion remain external.

### v5 complete lifecycle preflight and final pair

fixed-verifier-performance-live-v5 inherits previous 17 UPS audit/four live endpoints
readonly, no setup transfers/claims, same SDK/binaries/Node. Two process-tree
samplers ready before children, stop after cleanup. Only fresh/cached differs;
strict cold/full-proof/conservation/session/endpoint gates remain. Narrow read
recovery only reuses a valid verified original demonstrably unsent, stopping after
one further failure; never retries unknown payment.52preparation tests pass.
[Preflight](../../executor/verification/2026-10-26-complete-measurement-preflight-v1/README.md).
The final measured pair is the first section of this document, not these earlier
pending notes.

## Submission transport follow-up

Process-local immutable HTTP client replaces per-send construction, without
request/witness/nonce/response cache. Per-send domain/realm checks remain.
Connect cap10 s; total explicitly30/120 s, default120 (old30). One idle connection/
host; clientInitializedBeforeCall records lifecycle, physicalConnectionReuseMeasured=false.
No unsupported TLS/physical reuse claim. Redirects and reqwest protocol-NACK retry
disabled; one explicit send. Timeout is RPC_SEND_TIMEOUT_UNKNOWN, not rejection/
rollback. Original retryAllowed=false files remain. Real latency benefit from
client/timeout changes is not measured.

[2026-10-26 continuation](EXECUTOR_COMPOSITION_CONTINUATION_20261026.md): compilation
cold/warm now measured; new two-pool pair still blocked by readonly503. Broad scan
concurrency withdrawn after16 samples, all failures retained. Prior fill/performance
conclusions unchanged. Sources include exactJsonWire.mjs, ordinaryNonceConflict.mjs
and bounded broadcastNonceRetirement/auditOrdinaryNonceRetirement/
finishRetiredVerifierRecovery acceptance entries. Original running images,
upgrade authority, multi-host coordination, global censorship resistance and
authenticated randomness remain unclosed. No production claim.

## Additional preserved source references

- [README.md](../../executor/verification/2026-10-25-fixed-verifier-build-v4/README.md)
- [README.md](../../executor/verification/2026-10-25-fixed-verifier-recovery-v1/README.md)

Branch identity: `markets-batch-capacity-recovery-20261020`.

QA payment assets in the accepted Book rounds: FT 2483/2484, each 18 decimals; native test PSY pays fees.
