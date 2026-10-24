# Full proof and stage costs — 2026-10-24

## Scope and current acceptance status

Continues `d13bcf8c` on `markets-batch-capacity-recovery-20261020`.
The selected SDK manifest is still
`0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`.
Its 1466 source files, build config and original Node worktree diff have been
checked again. No Node edits, SDK migration, old-contract upgrades or overwriting
of prior requests/proofs occur in this work.

This is a new performance case, not completion inferred from old `/tmp` runs.
Durable original directory:
`psy-market-recovery-20261023/three-markets-performance-live-v1`.
Current deployments: fresh QA NFT 2496; Orderbook 2497 / vault 662720;
Curve 2498 / vault 302272; NFT Market 2499 / vault 1072320. New fee sponsor
519360 is registered. Initial NFT mint, asset distribution and both ordinary
claims are included. Market activation is running; no new fill is claimed yet. Existing owned QA FT 2483/2484 (18 decimals) and test PSY (9 decimals) are
used; existing pUSDT is unused. Old NFT 2469 remains retired.

## Changes being accepted

1. **Application guard reads:** independent contract checks are scheduled in
   groups of at most four in the Rust application. All started reads finish
   before an error propagates, and no later proof/broadcast starts on failure.
   Existing identity, code/layout/function roots, layout counts and fees stay
   mandatory. The current leaf and leaf hash are read together. This does not
   change a circuit, key, state witness or SDK. Per-process bounds do not imply
   a global four-request bound across multiple processes.
2. **Explicit resident scope:** `executor/residentScope.mjs` retains at most
   four distinct resource entries across adapter/stage lifetimes. Entries bind
   binary (hence compiled SDK), policy/config bytes, network/key identity,
   dependency code/layout endpoints and launch environment. Identical stage
   copies can share resources only after both original and new file paths are
   rechecked. Calls, guards and output directories are fresh per job; the native
   server still removes each transaction's user session after completion.
   No state witness, nonce or signed request is retained by this scope.
3. **Failure handling:** one active proof per exact resource/key; failed native
   entries are poisoned. Restart needs original leases released and confirmed
   process exit. A scope-close failure stays an error on subsequent closes.
   Factory acquisition occurs after all initialization guards, avoiding leaked
   leases on rejection. Unknown financial broadcasts remain journaled and do
   not authorize replacement operations.
4. **Executor integration:** the production CLI owns/closes this resource scope;
   the public compact adapter forwards it. The actual three-market acceptance
   also uses the formal adapter and durable journal, not a separate signer.
5. **Stage scheduling:** the finite acceptance graph groups existing independent
   sponsorship calls, serializes every ordinary payer, and overlaps independent
   owner consent/sponsorship and Curve admission/buyer consent only after their
   dependencies are confirmed. Existing grouping was already available; it is
   not claimed as a newly invented feature or cross-vault atomicity.

## Controlled measurement plan

- Before: original application driver SHA
  `343f0b01b45b178127afe4916964bdf9107630c867f8984df05ef4219d922259`.
  Candidate: new application-only binary, pinned by `TOOLS.json`; same SDK.
- For the necessary Curve inventory initialization, after releasing its setup
  adapter: warm resident proof versus a separate cold process at the
  **same authenticated source checkpoint**, with complete public core, calls,
  nonce, fees and end-state equality. Historical calibration proofs are never
  broadcast. Such a comparison measures resource/cold-process costs, not an
  independent warm algorithmic speedup or two matched confirmations.
- For each market's seal: ABBA `verify-prepared` over the **same exact proof**
  with original and candidate drivers. Both independently verify the full UPS,
  actual fee, context, own leaf/nonce and live code/layout; neither calibration
  writes a broadcast intent. This is verification/guard wall, not proving time.
- The candidate alone submits each financial request once through its original
  journal. Real indexed/common confirmation, ordinary payouts, all fees and
  assets are audited separately. Deliberate calibration time stays visible in
  the test envelope and is not normal optimized throughput.
- Process RSS sampling starts after initial deployment work. It records selected
  wallet processes and parent IDs, no arguments or wallet material. Missing
  samples do not establish zero memory or a true peak.

## Regression evidence at this milestone

77 core application tests pass, including public factory scope forwarding, failure
before lease acquisition, exact resource identity, altered files, failed-child
isolation, unconfirmed exit, compact four-market security/nonce/expiry paths,
bounded reads and durable journals. One Rust scheduler test covers serial/four
concurrency, all checks on success, failed-chunk draining and no next chunk.
Three further seed-recovery tests reject possible broadcasts, extra original
request files, altered calls and diagnostics that signed/broadcast or did not
fail the exact NFT call. Mocked IO tests do not substitute for full proof or
live acceptance.

[Regression and frozen dependency archive](../../executor/verification/2026-10-24-proof-stage-regressions-v1/manifest.json).

## Gates still open

Actual Book/Curve/NFT fills and ordinary
claims, independently verified saved UPSs, exact receipt-fee/cohort conservation,
closed per-stage performance/RSS evidence and archive comparison remain open.
No speedup, four-market throughput or production readiness is asserted here.
Random ordering remains off; authenticated finite queues are not global
inclusion/anti-censorship proofs. Runtime/upgrade-auth/upstream SDK release and
cross-machine coordination evidence remain separate boundaries.

## Preserved startup and seed recovery

Registration indexing initially lagged its acknowledgement. The same saved
request was reconciled read-only. A later HTTP 503 during NFT registration
reconciliation was preserved; no registration or deployment was repeated.

The first seed preparation failed at `prove-ordinary-calls`, with explicit
`broadcastMayHaveBeenAttempted=false` and only `failure.json` in its output.
A separate proof-only diagnostic reproduced failure of the last, redundant
owner-to-uninitialized-NFT-vault `acknowledge` call. It created no signed endcap
or broadcast request. The owner already holds the minted NFT; required vault
activation/holder/acknowledgement checks remain in the market and SD-key.

An explicit `seed-without-ack-v1` continuation verifies original failure/input
hashes, the exact diagnostic, unchanged owner nonce, zero seed outboxes and
positive owner NFT balance. It removes only the diagnosed preparation call and
uses `activation-seeds-reviewed-v1`, with a fresh proof and distinct artifacts.
That seed transfer is now included. Three prior confirmed initialization UPSs
are adopted by their original receipts. Original and resumed worker sources
are preserved separately by the original manifest hashes; post-launch copies
are not falsely described as pre-execution snapshots.

## NFT activation acknowledgement loss

Book 2497 / vault 662720 and Curve 2498 / vault 302272 activation were
confirmed at checkpoints 374716 / 374717. NFT Market 2499 / vault 1072320
activation's first transport timed out after a durable broadcast intent.
The saved request hash is
`82240a91caa412741defb1f20fab9ea64293feaa182142a926ca50b7b4cc0786`.
Missing indexed receipts and unchanged nonce do **not** establish rejection or
queue absence. The selected SDK's `get_tx_status` locally compares nonce and
also does not establish queue absence; the remote RPC returned Method not found.

An explicit acceptance-only recovery preserves the original journal as the
authority and rechecks its manifest, signed request bytes, source and endpoints.
It invokes the existing native `broadcast-prepared` for **one identical request**
in a new evidence directory. The native verifier repeats full UPS, stack/session,
fee, dependency, registration, current anchor/nonce and expiry checks; it neither
signs nor builds a new proof or business operation. Original and retransmitted
requests, if both reach the network, describe the same state transition. This
is not a general automatic retry or proof of remote queue idempotency. If the
original is included during checking, native anchor validation rejects another
send and the original receipt remains authoritative. The original journal subsequently reconciled the exact end leaf at checkpoint
374754. Activation is confirmed; it is not a market fill.

The earlier diagnostic metadata recorded the current reference source digest
rather than the frozen binary's compiled source. A separate additive correction
binds the actual frozen source and build manifest; the original metadata remains
untouched. The only reference-source difference adds diagnostic report tags.

[Exact-proof recovery and additive provenance correction archive](../../executor/verification/2026-10-24-exact-proof-recovery-v1/manifest.json) preserves the accepted retransmission, original request identity and five recovery / two transport-reporting regression results. The latter tests explicitly keep a timed-out send plus exact retransmission as one signed transaction, and refuse to count HTTP 200 with RPC error as acknowledgement.

## Completed initialization calibration and unsigned-send recovery

Curve inventory initialization now has an actual included UPS at checkpoint
374808. Its warm/cold complete public cores match. Warm preflight was 98,504 ms;
cold was 180,060 ms, including 41,244 ms session construction, 1,090 ms key
construction and 7,353 ms additional authenticated historical-source setup.
This is one sequential same-host resource comparison, not an isolated proving
algorithm improvement, matched chain confirmation comparison or confidence
interval. The source checkpoint, nonce, fee and all public endpoints match.

After calibration, a coordinator connection error stopped native live checking
**before** creation of a wire request or native broadcast intent. Explicit
`resumePreparedInventory.mjs` binds the saved comparison and original proof,
forbids its `prove` callback, and lets the formal journal redo the normal fresh
current-state and native submission checks. The journal contains one `proved`
record, two local submission intents and one final inclusion for this task.
A separate failed parse attempt (decimal observations read with integer-only
JSON) remains preserved; it performed no transaction. Reporting now keeps all
submission attempts and includes restart/recovery delay in the original
attempt-to-final-observation interval.

`completedCalibration.mjs` adds exact-manifest adoption checks for completed
cold comparisons and ABBA guard measurements; its three regressions pass.
It is not wired into the currently running, source-frozen financial worker;
that integration will be committed after this worker closes. Native financial
full-proof and fresh identity/anchor/expiry checks remain mandatory.

[Initialization exact-proof recovery archive](../../executor/verification/2026-10-24-exact-initialize-recovery-v1/manifest.json) contains both calibration requests, the unsigned coordinator rejection, the unchanged prepared proof, the successful formal recovery and its actual checkpoint receipt. All 41 files were byte-compared with originals. Archive integrity is not cryptographic proof verification; final independent UPS accounting remains open until the three-fill route closes.

## Ordinary sponsor exact-wire recovery

The grouped `start-fund-v1` ordinary UPS timed out during its first POST. Its
original request, intent, wire and private-error digest remain untouched; there
was no process timing return for that failed invocation. The independent frozen
verifier confirmed its full signed UPS before recovery. A read-only first
recovery attempt stopped on Number/BigInt representation in contract bindings;
its artifacts and source are retained. The corrected path compares lossless
canonical bindings without narrowing amounts or relaxing fields.

`recoverOrdinaryWire.mjs` reuses the existing exact-wire validator and no wallet
secret. It checks original input hash, actor/key, signed core, complete dependency
coverage, original fee cap, current network, registered identity, exact nonce /
start leaf, expiry and code/layout/function endpoints, reconciles receipts again,
and writes a per-original exclusive one-send marker. Only then does it transmit
the original wire. The recovery received `ok` and the original UPS was confirmed
at checkpoint 374896. Neither missing receipts nor an unchanged nonce establish
that the original remote queue entry is absent. No replacement funding was made.

The old compact recovery utility's transient `/tmp` verifier path was removed;
its CLI now requires explicit frozen `TOOLS.json` with the selected SDK digest
and verified binary SHA. Saved retransmission wires/responses use the same
transport evidence format. Four ordinary/compact recovery regressions pass.
The original compact wire validator's source actually imported by the ordinary
recovery is preserved separately from this subsequent maintenance change.

Three new epoch-1 plans are now fixed at cutoff 375031: Book has two members,
Curve one and NFT Market two. This is still five accepted-to-be members / three
planned fills, not yet successful fills. All accepted members remain mandatory.

## In-flight public read coalescing (same SDK / native proof binary)

Subsequent actual starts hit both an unsigned partial-call EOF and a bounded
pre-session connection retry. Curve's start eventually confirmed at checkpoint
374934. Book's full start proof was saved, but native live checking rejected
its send before broadcast. Those failures remain in the run; no old contract
was updated and no old request was replaced by a new payment.

`publicState.mjs` now coalesces only simultaneously outstanding identical public
reads via `readSingleFlight.mjs`. Keys bind exact configuration digest, endpoint,
method/params and fetch transport identity. Only `psy_get_` methods qualify.
The result is raw response bytes; each caller parses its own object, including
lossless integer mode, and independently checks identities/code/layout. The
entry is evicted on both success and failure before consumers resume. A later
read always goes to the network. This is neither a state-proof cache nor reuse
of nonce/witness context; native full proof and final submission guards remain
unchanged. Logical waiters and physical transport owners are recorded separately.

20 public-reader/coalescer/limiter/retry regressions pass. The initial test attempt
exposed legacy mocks with only `json()`; mocks now model `Response.text()` and
the expected coalesced physical count. Existing checkpoint separation, malformed
heads, invalid IDs, failure draining, observer failure and exact large nonce
checks remain. The new `state-reads-v2` financial continuation records an additive
11-file source manifest and preserves all older manifests / loaded source copies.
The source used by the still-running continuation must remain unchanged until
it closes. No network confirmation speedup is inferred from these tests.

The read-only NFT-start recovery found the original inclusion at checkpoint
374965 and stopped before starting a native broadcast command. No retransmission
was needed for that start. Its review and executed source are preserved in
[the in-flight reader/source regression archive](../../executor/verification/2026-10-24-inflight-reads-regressions-v1/manifest.json), alongside both prior unsigned start failures and the initial mock failure / corrected 20-test reader run. All 24 files match originals.

The independent final audit now verifies the exact finite-cohort FT delta for
every account/vault (including unchanged sponsor and legacy holdings), zero new
market/trader FT pending payouts and the unique NFT owner/identity/metadata.
Two regressions reject a conserved total with the wrong vault, unclaimed payout,
wrong NFT owner and metadata substitution. This strengthens audit assertions;
it does not replace the pending full saved-UPS and actual-receipt verification.
Read telemetry reports observed physical owners, not every transport: sharing
with a caller outside instrumentation can leave an unobserved owner, and native
SDK/ordinary wallet RPC reads remain outside the JS count.

## Real expired epoch and ambiguous-admission recovery

The first intake exceeded cutoff 375031 during real SDK/transport failures.
Book/NFT were empty and their standard `abort_empty_epoch` UPSs confirmed at
375146 / 375145, using their existing explicit maintenance grants. Original
orders remained unconsumed and vault FT roots unchanged. No owner deposits were
repeated. The original Curve admission remained ambiguous; expiry alone did
not authorize a replacement, and the native verifier rejected retransmission
of the expired proof. A log-open collision in the recovery wrapper also stopped
before child creation; the original log/marker and explicit review remain.

Curve still had the exact original start leaf, nonce 3 and an expired empty
queue. Under the original vault lock, an explicit **timeout abort** candidate
was proved from that same leaf with nonce 4, using the same SD-key and existing
gas authorization. It confirmed at checkpoint 375200. Independent pinned
verification of BOTH full UPSs establishes same user/key/start leaf/nonce 4,
different end leaves, and a real historical/common receipt for the legal abort.
The original request can no longer consume that nonce under the chain's account
transition rules. Its earlier broadcast remains recorded; it is never called
not-submitted. No expired request was transmitted by bypassing native checks.

`ExecutionJournal.resolveByConfirmedConflict` is an explicit operator recovery
interface, restricted to compact ambiguous admissions and a verified expired
empty abort. It requires an independent proof/receipt verifier and validates
same source, same nonce, distinct ends and common inclusion. The truthful
`resolved-by-confirmed-conflict` record clears the block; that original task ID
can never re-execute. Ordinary unknown broadcasts still block by default.
17 journal/conflict regressions pass, including invalid verifier/nonce/receipt,
persistence, replay refusal and unchanged unknown-broadcast blocking.
Actual resolution evidence is `CURVE-ORIGINAL-RESOLVED-v1.json`, with both full
proof verification reports. This is a one-host recovery, not distributed lease
or arbitrary transaction cancellation evidence.

The fresh epoch runner first verifies every old queue is terminal/empty and
all original orders unconsumed. Sponsor funding confirms before a NEW cutoff
is chosen; the original `PLANS.json` and all proofs stay untouched. Users sign
new admission consent; their original FT/NFT deposits are reused. A 92-file
static application import closure is captured before this financial run, while
SDK/native release and data remain separately pinned.

Completed calibration adoption now reaches the formal harness. Saved exact
warm/cold comparisons and ABBA samples can be reused only for the same proof
manifest. Partial ABBA samples persist individually. A strictly classified
unsigned public-transport failure may mark a PERFORMANCE sample unavailable;
proof/state/layout/expiry rejection never takes that path. Financial submission
always repeats native full-proof/session/fee/current-state verification. The
report must show missing samples, not fabricate speedups or zeros.

[Expired-admission recovery archive](../../executor/verification/2026-10-24-expired-admission-conflict-live-v1/manifest.json) now preserves 2,128 public files / 32,920,348 original bytes, with compressed/original SHA checks and byte comparison. It includes the complete original journals, all three real empty aborts, both independent Curve proofs and the truthful terminal conflict event, exact executed-source reconstruction and failed attempts. It excludes wallets and sealed binaries; archive integrity and full proof verification remain distinct.

The final auditor resolves multiple local attempts only when every original
intent has identical task, scope, driver, prepared manifest and signed request
bytes. Different requests may not be assigned to a receipt by end leaf alone.
It verifies all completed saved UPSs, including unused candidates at nonces
consumed in the actual chain, rather than counting only successful requests.
The actual Curve conflict is independently cross-checked against the verified
abort receipt. Native no-send/measurement failures stay separate from settled
UPSs and fees. A Mac canonical temporary-path expectation in the locator test
was corrected without relaxing path containment; two locator regressions pass.

By the second epoch's admission stage, telemetry has observed 40 coalesced
logical waiters. This is evidence of avoided simultaneous duplicate reads,
not an end-to-end acceleration result. Book/Curve starts confirmed at 375281;
NFT start at 375300, renewed owner consent at 375306, buyer consent at 375317,
Curve admission at 375319 and first Book/NFT admissions at 375324. Actual fills
and final ordinary claims still remain open at this milestone.

### Sealing calibration exhausted the NFT send window (preserved)

The second epoch admitted all five original members. Book and Curve sealed at
375425 / 375427. Their exact-proof guard ABBA samples completed: Book baseline
17,893/17,348 ms, candidate 13,724/14,525 ms; Curve baseline 16,927/15,828 ms,
candidate 16,378/14,367 ms. These are full saved-proof/live-check observations,
not proving speed or confirmation performance.

NFT produced a complete seal UPS but slow reads and the diagnostic samples
exhausted its 375493 send window. The third sample correctly rejected it as
`prepared broadcast window expired`. Two partial samples (54,121 ms baseline,
64,987 ms candidate) remain preserved; they do not form a matched ABBA result.
No financial intent was appended for that old task. The recovery entrypoint
checks no unresolved intent, the old unchanged start leaf/nonce, the same two
admitted orders and the expired unsigned failure before requesting a fresh
seal proof. Its financial path omits diagnostic calibration and retains all
native proof/session/fee/dependency/expiry checks. Already confirmed Book/Curve
seals and original owner deposits are reused. The new static source closure is
captured separately; the earlier 92-file closure and its outputs remain intact.

The independent reporting gate additionally requires a distinct, fully verified
actual request to consume the original nonce from the same start leaf. It never
marks an expired proof reusable or converts an unknown broadcast to unsigned.
One regression covers valid reporting and seven tampering/replay variants.
At this milestone, actual fills and final ordinary claims are still pending.
