# Four-market production candidate work — 2026-10-21

Branch: `markets-batch-capacity-recovery-20261020`; accepted starting commit
`e45d689e6806d362c03f15697c90aba44f8704e7`. No Node edits, old-contract update
probes, new branches or replacement of original artifacts are authorized here.

## Baseline verified before implementation

The 2,171 archived public files passed compressed and decompressed SHA256 checks.
The 124 included UPS identities and prior acceptance matrix remain the baseline;
they are not repeated or relabelled as acceptance of the new Executor. All 1,466
consumed SDK files match the frozen dependency snapshot. Node’s pre-existing
tracked diff remains `002e35e0b13cb6c422fe3abf500ce6aa5241229264d85a3314f22b5e14b59a64`.
NFT 2469 remains retired; NFT 2472 is the corrected live baseline.

## Current acceptance ledger (supersedes historical progress paragraphs)

Last completed milestone: exact sender return and ordinary claim, archived in
`bootstrap-orphan-return-v1/`. All four fresh deployments and activations are
confirmed; Curve inventory initialization is confirmed at checkpoint **359318**.
The LP order, authenticated admission (**359427**), sealing (**359465**,
after fixed source cutoff **359455**), commitment (**359484**) and settlement
(**359502**) are confirmed. Both QA FT reserves equal 20 tokens. The
maximum four-member economic batches, controlled warm/cold full-proof pairs,
omitted-order exits and replacement NFT expiry/competition stages have **not yet
completed**. Their scripts and waiting workers are not acceptance evidence.

The formal LP scanner rejected missing sponsorship without proving or sending;
its actual funding request is retained as
`public/liquidity-missing-gas-scan.json` in the original run. Funding remains an
explicit ordinary-wallet action. The immutable LP plan uses the existing
128-checkpoint bound, selected before admission; its cutoff is not moved when
proving or confirmation is slow.

The not-yet-created omitted-order recovery plan also selects the existing
128-checkpoint maximum. Its four independent vault starts and later aborts run
concurrently; `Promise.allSettled` waits for every sibling before surfacing an
error. This reduces avoidable scheduling delay without weakening any cutoff,
retrying an unknown submission or claiming same-pool parallel execution. The
script passes syntax validation; its live gate remains pending.

Team artifact integrity is reproducible using
`executor/acceptance/verifyCompactArchive.py` (read-only, optional exact original
comparison). Both completed milestone archives passed: 138 activation files and
75 sender-return files. Six negative/positive groups cover changed compressed
bytes, changed decompressed hashes, traversal, duplicate/unlisted files, changed
originals and symlinks. `artifact-integrity-v1.json` contains the transcript and
totals. This verifies archived bytes, not UPS validity or release authorization.

`runtime-source-overlay-v1.json` freezes 268 tracked JS source/regression files
at clean, pushed commit `a8fe653e56709c3c20a684a509605aba246d6b8e`, plus the Node
version, SDK snapshot manifest hash, driver-v3 build-manifest hash and immutable
release-file hash. Its SHA256 is
`9a8ccddafea6f1fe710102196d5bf5cda80875e26a6232c669145a84fa09fd33`.
This repository overlay supplements the earlier binary build-time snapshots;
it does not rename those snapshots or imply that later JS fixes existed when
the binary was built. Rust sources, Cargo dependencies, compiler and ordinary
signer remain covered by their separate frozen manifests. The overlay is not
a running-server identity or an audited upstream SDK release.

Read-only deadline review records an additional boundary in
`source-checkpoint-deadline-audit-v1.json`: contract cutoffs use the authenticated
proving source checkpoint. The inspected local edge/planner paths bind historical
membership and current own anchors but do not establish a maximum source age
or protocol enforcement of the application's send window. A confirmed seal
invalidates earlier vault anchors; the cutoff alone is not proof that all
admissions were actually included before that time. No late-submission probe
was sent, and normal send-window checks remain. See the external handoff for
strict inclusion deadlines and commit-before-reveal requirements. Node's
pre-existing tracked diff was rehashed unchanged during this inspection.

The real standalone `executor/run.mjs ... scan` loaded the frozen LP route in
a new process and observed the open queue. This exposed an inaccurate status
label: it said "sealed queue" before sealing. The reader now includes the
reported queue phase, an explicit sealed flag and `proofVerified:false`, and
labels the source as an RPC snapshot requiring authenticated execution. Queue
selection, policy/call bytes and every proof/send check are unchanged. Nineteen
targeted application checks passed (overlapping prior suites); the new group
covers open, sealed, completed and empty-aborted reporting for all markets.
Original CLI output is retained. This scan is not a positive daemon execution
or a cryptographic inclusion certificate. A new source overlay is required
for subsequent workers; the earlier immutable overlay remains historical.

The corrected standalone CLI output and a v2 source overlay are archived in
`queue-snapshot-release-v2/` (five files; original and decompressed hashes
verified). Overlay v2 binds pushed source `ffe7a05`; only the reader and its
test changed since v1. Later FIFO-accounting changes require a further overlay.

NFT asset accounting now includes each directed cohort pair's **unclaimed**
FIFO entries, using the recipient's claim cursor and wrapped ring indices,
alongside held NFTs. It rejects inverted/over-capacity cursors, zero unclaimable
identities and duplicate held/pending IDs. Existing native/FT and claim guards
remain covered; six accounting checks passed (three existing, three new).
A real read-only snapshot at checkpoint **359460**, across 14 explicit accounts,
found two held QA NFTs and zero unclaimed deliveries. This is not a closed trade
interval or global inventory proof: owned slots 0/1 and cohort outboxes are the
explicit scope. Subsequent acceptance asserts two held-plus-pending QA NFTs
before settlement and two held/zero pending after ordinary claims. Snapshots
also record their RPC/limiter/retry/local-accounting wall time separately from
proving and confirmation; that prospective timing was not retrofitted into the
earlier read-only sample. Maximum and recovery live gates are still pending.

Earlier runtime source overlay **v3** froze pushed source
`d7fefc5d70f42db54ebd7b0ffc67adefdea69c1b`, SHA256
`3ceabfe635b352eef1782a53d71a9ec0acee9796af87b22314624719c09c7867`.
It links v2's exact hash and lists the six changed accounting/acceptance JS
files. The registered keys, compiled market/asset artifacts, Rust driver and
SDK dependency snapshot did not change for these reporting/accounting fixes.

Before the maximum stage, review found an acceptance-only integer/prototype
comparison defect: persisted exact JSON has BigInt IDs/counts and null-prototype
objects; live snapshots have bounded Number IDs/counts. NFT sender lookups and
identity comparisons now use bounded canonical integer/hash rows, and persisted
counts are compared as BigInt. Amounts and hashes are never rounded. Seven
accounting regressions (overlapping the earlier six) and a read-only round-trip
of the two actual checkpoint-359460 NFT entries passed. Original snapshots are
unchanged. This fixes false acceptance failures; it does not change a market,
key, asset ABI or Node. Overlay v4 below supplements v3.

The maximum stage's pre-order snapshot completed at fixed checkpoint **359505**:
14-account asset/RPC accounting took **125,716 ms**, excluding initial head
reads and any proving. Two sellers' ordinary order UPSs are now in progress;
maximum settlement/claims have not completed.

The read-only `candidateLiquidityAccounting.mjs` closed the LP **tail** interval
**359460→359505**. Both QA FT totals remain 1,000 tokens; the same two QA NFTs
remain held, with no pending NFT deliveries. Native decrease equals exactly
**4.000057000 test PSY**, the fees of the four included UPSs in that interval
(seal, commit sponsorship, commitment and settlement). Earlier order/start/admit
costs are excluded; this is not total LP cost. `lp-tail-conservation-v1/` holds
both original snapshots and the fee/identity report, with verified hashes.

`lp-formal-closed-loop-v1/` contains 219 completed public files (about 5.8 MB
gzip): five formal market UPSs and eight ordinary UPSs, including two earlier
seed-return claims. All exact indexed identities/common visibility and archive
hashes passed. This is one LP initialization, not 13 trades. A separate
read-only ledger snapshot at **359515** confirms reserves and total shares of
`20 * 10^18`, provider 860352 shares `20 * 10^18 - 1000`, locked minimum 1,000,
and consumed order nonce 1. RPC readback supplements, not replaces, the saved
whole-UPS proof and inclusion evidence.

Current JS source overlay **v4** freezes 269 files at pushed source
`41c028561969cd07857ef3ccb5f80424fab3cb51`, SHA256
`04b8402d518e7e35be66b7c97aa1bcac751ac599d18363381ad097bdd8ff5cb9`.
It links v3's hash and lists its six changed files. This is a JS overlay revision,
not driver v4: LP used driver **v2**; maximum/exit/competition use frozen driver
**v3**. The earlier source/build manifests and original binaries remain.

All four maximum funding orders are included: Trader/Charlie at 359522,
Dave at 359543, Bob at 359545. The immutable **candidate** admission plan uses
source checkpoint 359545 and cutoff **359673**; it is not yet a sealed queue.
Recorded AMM/Curve priorities include real same-source-checkpoint ties and use
checkpoint then owner ID, not receipt arrival order. Maximum gas discovery
returned explicit funding requests before proving, and sponsorship is underway.

Measured ordinary order proof costs also informed the not-yet-started NFT
competition harness: independent seller jobs run together, then independent
buyers only after seller inclusion, and four consent wallets run together.
Each group drains all jobs before surfacing failure. Its future plan selects
the existing 128-checkpoint maximum; no existing plan is changed. Syntax checks
passed; live acceptance is pending. This change affects the future competition
script only, not the already running maximum stage or frozen driver/keys.
Future-stage overlay **v5** freezes that one changed script at
`b6a9959646e90e0b018ba61683cafa32e4a37d07`, SHA256
`8f12cf625154215dd4dc04931775939ac55f9b5ca226ec111c21717c7f0ceeb2`,
and links v4 unchanged. Maximum-stage loaded module files remain as in v4.

Maximum start encountered a preserved **pre-send** coordinator connection error
for AMM. The driver recorded `broadcastMayHaveBeenAttempted:false`; its fresh
send directory has neither child intent nor request. The other three starts
included (Book/NFT 359588, Curve 359590), and all parallel jobs drained before
the stage stopped. No transaction with an unknown outcome is being retried.

Review found the acceptance poller searched every historical rejection for a
task ID. It now reads terminal events only after that task's latest durable
broadcast intent: an old no-send result cannot hide a later unknown attempt or
exact inclusion. Fourteen targeted application checks passed, including one
proof reused across explicit no-send recovery, later unknown blocking and an
already-included duplicate. This does not weaken the production journal.
The preserved AMM proof is eligible for a deliberate restart only if its exact
manifest, own anchor/nonce, dependency identities, fee and original send window
(359643) still validate. Real resumption is pending; the original failure and
all earlier task/request/proof files remain unchanged.

## Ordered gates

| Gate | Current work | Not yet established |
| --- | --- | --- |
| 1 Formal Executor | Explicit `batch-admission-compact-v1` route; journal/locks and saved-proof broadcast; four fresh real activations, LP lifecycle and exact sender return/ordinary claim confirmed; 104 application regressions | Maximum economic entrance and replacement NFT competition/timeout acceptance remain in progress; application checks are not network trades |
| 2 End-to-end cost | Saved proof is not re-proved for broadcast; phase metrics; immutable circuit reuse with fresh sessions; strict same-checkpoint calibration implemented | Positive paired full-proof samples and maximum live cost report pending; no speedup or chain TPS claim |
| 3 Before-admission fairness | Own-consent lock, immutable finite plans, explicit gas requests, terminal exit and sender-bound recovery; one actual unused-funding return closed | Pre-admission selection/refusal is not global censorship resistance; omitted consented orders still need their new live terminal-exit matrix |
| 4 Random order | Deterministic mode retained | Authenticated future source, actual pre-revelation inclusion and anti-abort requirements remain external unless verified |
| 5 Release trust | Existing reproducible SDK snapshot and Node unchanged checks retained | Runtime image attestation, unique production domain and effective upgrade authorization remain unverified |
| 6 Current-version live matrix | Fresh 2473/2474/2475/2476 deployed, registered and activated; 2476 incorporates corrected 2472 semantics; 2469 retired | Maximum four-member batches, nonempty timeout/refreeze, contention and full ordinary economic claims remain pending |

## New Executor trust boundary

A separately selected profile is required; old routes are not silently switched.
The reviewed binary is sealed using the existing driver digest mechanism. ABI,
config, policy, network, complete dependency roots/whitelist/counts, and the
public admission plan remain immutable while a worker runs. The fixed plan
does not authorize an ordinary user or imply every market request was scanned.
After sealing, all accepted members are reconstructed from chain state.

Proving creates a durable `prepared.json` digest over the exact policy, calls,
guard, full preflight and request bytes. The journal stores that digest. A
separate broadcast process validates the expected digest, whole UPS against the
pinned Node verifier/common data, metadata/endpoints, full call count, original
stack/session preflight binding, fee budget, current own nonce/anchor, registration,
dependency roots and broadcast window. It never signs/proves a replacement.
The driver and runtime host remain trusted; this is not a hardware attestation
or an on-chain upgrade lock.

The journal persists its intent before starting broadcast. A durable child intent
and independently verified end leaf permit receipt recovery after parent loss.
Unknown attempts block new work. Only an explicit driver rejection before any
child broadcast intent permits a `not-submitted` outcome; a missing log or file
never authorizes retry.

Application regression records are distinct from full UPS or real acceptance.
See `executor/verification/2026-10-21-compact-candidate-v1/baseline.json` and the
subsequent evidence added as each gate completes. Production approval cannot
be inferred from a passing test count.

## Application changes and evidence — first checkpoint

The formal route now covers `start_epoch`, authenticated `admit_entry`, sealing,
empty-epoch abort, all-member commit, settlement, expiry/refreeze, and explicit
inactive sender recovery hints. Nine then ten targeted Executor tests and the
full 92-test application suite passed; these are application fault tests, not
92 on-chain proofs. Source substitutions, changed nonce/window, missing gas,
duplicate tasks, local two-worker locking, common-checkpoint lag and explicit
pre-broadcast rejection were exercised. Missing evidence remains unresolved.

The new prepared broadcast verifies the same saved UPS; it does not run a
second prover. The first live cold CLI sample spent 49,127 ms constructing the
session, 37,786 ms proving calls, 13,479 ms finalizing recursion, 5,080 ms proving
end-cap and 3,494 ms verifying the whole proof. Total preflight was 135,069 ms.
This is a single four-call maintenance sample, not a controlled trading speedup
or chain TPS. The optional resident mode retains only the immutable network /
policy circuit resources and explicitly removes the user manager after every
request. It creates fresh user/checkpoint/nonce/state sessions, never broadcasts,
and exits after a rejected proof. Default remains `subprocess`; full live warm
reuse acceptance is still required before recommending `resident`.

### Confirmed security defect and fresh candidate fix

Historical interim notes in this subsection are superseded by **Follow-up
security gates** below. In particular, the final candidate locks own signed
consent, including omitted orders, until terminal epoch evidence. Do not
implement an immediate exit based only on historical queue absence.

Against the unchanged previous compiled fixtures, actual VM execution reproduced
an admitted unfunded AMM order closing before commitment. Its immutable terms
then no longer match the sealed queue, so the whole accepted scope cannot
commit. The failing original regression is preserved. The fresh generator now
locks ordinary open/close/abandon mutations for an accepted unconsumed nonce
until a terminal result. Cancellation remains writable and excluded from the
immutable terms hash; zero-funding refunds remain terminal and then allow close.

New `release_unaccepted` requires signed cancellation and rejects exact live
queue membership or active frozen membership. It clears only the caller's
order/consent. Original sender enrollment and `recover_*` enforce return amounts
and recipient; ordinary claims are still needed. Actual VM tests covered both
winners of admission-vs-exit, rejected unsigned release, all four markets,
sealed terms, zero-funding refund, cancellation, timeout/refreeze, omission,
forgery/root replacement and legal carry. Seven VM groups passed using fresh
`/tmp/psy-market-admission-exit-20261021-v2` artifacts. This does not update any
old deployment or certify the new ordinary-wallet call proofs on the network.

### Live entry scope

`formal-empty-live-v1/manifest.json` archives the fresh formal-entry smoke run:
NFT 2472 only, zero economic trades. The parent exits after the broadcast child
returns but before journal result persistence. Restart recovers the exact
historical end leaf and indexed included receipt without another transmission.
An empty epoch later aborts after cutoff. A realm connection error occurred
before proving/broadcast on the first abort attempt; it was retained and only
an explicitly inspected fresh attempt was made. An initial nonexistent binary
path failed before process launch and is retained as a separate failure record.
Native conservation includes both ordinary sponsorships and both market UPSs.
Do not combine this smoke scope with prior four-market trading results to claim
that the new formal route's maximum-batch matrix has already passed.

## External requirements and deployment sequence

See [the concrete external handoffs](MARKET_BATCH_EXTERNAL_GATES_20261021.md).
Randomness stays disabled. Unique production network identity, effective upgrade
authorization and a reviewed upstream session-bound SDK release remain open.
Fresh isolated candidates are being deployed from the new generator, with new
keys/vaults; NFT 2472 remains the corrected prior comparison baseline and 2469
remains retired. No legacy contract is updated or update-probed. Maximum-batch
trading, ordinary exits/claims and replacement-version races/recovery still need
their own included receipts and exact conservation checks.


## Follow-up security gates: supersedes the provisional exit description above

Two further gates were added before spending into the fresh candidates:

1. Actual authenticated CFC proof generation found a fresh opening could read
   the zero old pool inside an inactive branch. The initial layout prover was
   stopped before any request/intent/receipt existed. Selecting a valid old or
   new pool address outside the conditional resolved the opening proof failure.
   The first successful normalized fixture still did not close gate 2 below.
2. Read-only review of `realm/edge/handler.rs` shows source checkpoint history
   authentication and current **own** user-leaf checks, not a latest foreign-read
   CAS. Accordingly a user's proof of historical queue nonmembership must not
   authorize release after a vault admission. The new generator locks the user's
   own consent immediately. It accepts consent only for an already open matching
   epoch, and permits immutable-term changes only after that epoch is terminal
   (or the vault has monotonically advanced). Before consent a cancelled sender
   may release immediately. After consent an omitted sender needs epoch closure
   plus exact sender-bound recovery. No Node change or latest-read assumption
   is needed. Root/nonce rules prevent an old vault admission applying after
   its terminal transition; the caller's own anchor prevents stale pre-consent
   releases applying after consent.

Fresh-state VM races alone were insufficient evidence for that cross-UPS case.
The new VM regression rejects release using an authenticated pre-admission
snapshot even if the sender was not accepted; it permits release after the
empty epoch's terminal timeout. Ordinary CFC gates also require the corresponding
negative close, positive terminal close and positive recovery release for all
four markets. Two candidate layout jobs were stopped before broadcast and their
artifacts are preserved; neither candidate contract was updated. Final candidate
outputs use another fresh directory. Full ordinary-wallet end-caps and real
acceptance of these revised methods remain a separate pending gate.

## Driver and receipt audit checkpoint

The full Executor application regression now has 96 passing checks, including
exact nonce handling beyond 2^53. The exact-integer RPC mode is opt-in for the
new route; existing control reads retain their established types. A new driver
also handles a newly registered user's zero materialized tree correctly: nonce
0→1, an actually absent user-tree leaf and a registration Merkle proof bound to
checkpoint global roots are all required. Existing materialized key/anchor/nonce
checks remain strict. Two Rust test groups cover the fresh and existing cases.
The revised driver has the same registered circuit identities; it is selected
through a fresh, hash-pinned release/toolchain manifest. Original binaries remain.

Actual new deployment progress: AMM 2473 / vault 1847488, Orderbook 2474 / vault
143552, Curve 2475 / vault 1192128. NFT deployment and the economic matrix were
still pending at this checkpoint. Their original indexed deployment/registration
gates remain enabled. The first AMM transaction was temporarily absent from the
services hash lookup, then the original workflow confirmed it and continued.
Do not misreport an early pending observation as the final deployment result.

An additional **read-only** verifier independently reverified the initial
0→71-field layout proof, exact original content hash/code/function/layout
endpoints, prior contract absence, new leaf presence, global/checkpoint roots
and both checkpoint membership paths. Six real-bundle substitutions were
rejected. Its anchor is supplied by the pinned coordinator RPC; this is not an
independently attested finality or running-binary certificate. It does not query
services and its `servicesIndexedReceiptVerified:false` means “not checked by
this tool”; separate original workflow receipts establish indexed inclusion.
See `checkpoint-deployment-audit-v1/manifest.json`. No receipt fallback or safety
check was removed. A services contract-info root display discrepancy is retained
for that service's review; transaction execution pins coordinator metadata.

## Four fresh registrations completed; economic acceptance in progress

| Market | Fresh contract | Fresh vault | Realm |
| --- | --- | --- | --- |
| AMM | 2473 | 1847488 | 1 |
| Orderbook | 2474 | 143552 | 0 |
| Bonding Curve | 2475 | 1192128 | 1 |
| NFT Market | 2476 | 667840 | 0 |

All four original initial-layout, exact deployed metadata, registration mapping
and indexed receipt gates passed. Public originals and identity/build hashes
are retained in `deployments-registered-v1/` under this day's verification
directory. NFT 2476 is a fresh admission-consent-lock candidate incorporating
2472's corrected missing-seller refund semantics. NFT 2469 remains retired.
There were no old-contract updates or update probes. The latest full Executor
application run passed 102 tests; this is not 102 network transactions.

QA setup uses original issuer/trader/sponsor wallets and two fresh ordinary QA
users, Charlie 1323200 and Dave 798912. Assets are QA FT-A 2464, QA FT-B 2466,
QA NFT 2467 and real faucet test PSY. Existing pUSDT and old MCP wallets are not
used. New registration success does not certify real economic settlement.

Explicit executable acceptance stages now include `candidateSetup.mjs`,
`candidateTrading.mjs` (LP then four-member maximum), `candidateRecovery.mjs`
(deliberately omitted consented sender; terminal epoch, sender-bound returns,
ordinary claims), and `candidateNftCompetition.mjs` (one listing/two buyers,
nonempty expiry/refreeze, cancelled second listing refund). Stages stop on an
unknown financial outcome and preserve original inputs, intents and failures.
Their implementation is not yet a claim that every stage passed on the network.

The maximum route includes an independent OS-process contender sharing the same
durable journal, which must reject before proving. The later NFT stage prepares
two valid different admission UPSs using independent journals before allowing
the winner to broadcast; after exact winning inclusion, the loser's stale
anchor must be rejected before sending. This deliberately scheduled contention
must not be called simultaneous two-RPC consensus acceptance. That stage also
discards the parent's submit result after durable child send and reconciles the
exact receipt, then rejects a duplicate task without a replacement proof.

Cost reporting requires eight full paired proofs: commit and settlement for
each market, same host/binary/threads/calls/fee/nonce/initial and final state.
Warm resident is followed by cold standalone, and only the warm proof is sent.
Each is one ordered sample, susceptible to cache/order bias; not a statistical
speedup claim or a comparison with the original 40-call route. The reporter
separates ordinary process time, acknowledgement-to-indexed/common observation,
server timestamps and task wall (which includes deliberate extra cold proofs).
Cargo cold build is outside those pairs. Offline proof rate is never chain TPS.

### Preserved configuration rejection before activation

After the ordinary seed transfers were included, the fresh formal factory
rejected the acceptance harness's compiled-artifact wrapper where a raw asset
ABI was required (`U124 Token ABI height: undefined != 31`). No activation proof
or activation broadcast existed. The harness now extracts each frozen asset's
`.abi` into a distinct raw ABI file and uses fresh `bootstrap-abi-v2` options.
Original failed options/logs remain in `bootstrap-config-rejection-v1/`; the
height/layout checks were retained and accepted the corrected configuration.
Actual activation UPSs were still in progress at this checkpoint.

AMM activation subsequently included at checkpoint 359154, and Orderbook at
359171, through the formal journal route. Their first-user broadcasts verified
the empty own leaf plus authenticated registration, nonce 0→1, full saved UPS,
exact stack/session and actual fee endpoints; neither was re-proved for sending.
The first AMM job's full preflight was 123,974 ms (initial resident key/session
construction excluded); this seven-call maintenance sample is not a trading
benchmark. A longer Orderbook confirmation wait was independently observed as
nonce 1 / exact expected end leaf and then the original indexed receipt; no
replacement or fallback submission was made. Other activations still pending.

Before the trading baseline the issuer claims the one-unit FT activation seed
returns. Later payout sweeps must not count those earlier returns as trade
proceeds. The cost reporter also publishes the actual test envelope and its
economic fills/s, explicitly including admission, sponsorship, extra cold
comparisons and claims. It leaves network TPS unclaimed. Six read-only HTTPS
samples (first round about 0.9 s, subsequent rounds about 0.34 s) are separately
labelled as read observations, not submission/confirmation performance or an SLO.

## Holder, recovery-budget and controlled-source gates

Curve activation included at checkpoint 359182. NFT activation preflight then
rejected Bob twice: the existing contract requires **NFT balance > 0**, not
merely a materialized tree. An acknowledgement against the new empty vault
also failed before ordinary broadcast; acknowledgement against the existing
holder succeeded but did not give Bob an NFT. No failed activation reached
chain submission. The current setup selects existing holder Trader as NFT
activation payer and explicitly recovers Bob's unused native/FT seed deposit.
All original failures remain. No deployed predicate or positive-balance check
was removed. The scanner now exposes both tree and holder prerequisites before
proposing a costly proof.

An empty vault's standalone `fund_gas` and subsequent sender return are **two
UPSs**. Recovery discovery now requests two conservative fee budgets, reports
existing pending sponsorship separately, and supplies the exact additional
amount; partial/overfunding still requires inspection. Single-UPS queue
maintenance remains one budget. Targeted reader/compact checks passed 34 and
the full Executor application run passed 104; those overlapping suites are
not added together and are not network transactions. Live orphan return and
the four-market economic matrix are still pending at this checkpoint.

Controlled commitment comparisons must share a source checkpoint because
`commit_batch` stores it in `batch_cutoff`. Driver v3 adds a **read-only**
standalone source calibration using existing frozen SDK public constructors:
materialized unchanged own anchor/key/nonce, historical registration, valid
checkpoint bounds, fresh session stores/UPS-start, full stack/session/signature,
whole pinned Node proof verification, fees and endpoint checks are retained.
Normal Executor child environments strip the calibration selector. The prepared
broadcast path rejects declared calibration artifacts. Two Rust negative groups
and a real saved-request marker substitution passed without broadcast; full
positive source-calibration proofs are still pending. All four registered
fingerprints/public keys match v3 unchanged, so no key or contract was updated.

Maximum/exit/competition stages explicitly select a fresh immutable
`candidate-release-v3.json`; earlier v2 manifests/binaries remain. Each full
paired sample must match source checkpoint, entire new user leaf, start/end
hashes, calls, nonce and fee before the normal warm proof may be sent. Cold
source-setup overhead is separately recorded; no state equality check is
removed to make a comparison pass. The driver build manifest is a build-time
source snapshot; subsequent JS runtime commits are separately reviewable.

## Four fresh activations confirmed

All four first-account activations are now included: AMM 359154, Orderbook
359171, Curve 359182 and NFT Market 359242. Each saved proof's new nonce is 1;
all four fresh registration witnesses, entire UPS/stack/session, fee endpoints,
indexed identities and common-realm visibility were checked. Sending did not
re-prove. `four-fresh-activations-v1/manifest.json` contains 138 completed public
files (about 4.2 MB gzip), including requests, actual proof bytes, preflight,
guards, registration witnesses, raw responses and receipts. Every compressed
and decompressed hash was checked against the unchanged original files.
This selected archive is activation-only, not the full eventual run.

NFT activation's scenario tag `holder-v3` is a scenario revision, using frozen
driver **v2**. Later maximum/exit/competition stages select driver **v3** for
controlled-source cost comparison; registered identities are unchanged. Bob's
original unused NFT activation deposit is being returned separately, with a
closed three-account native/FT interval and ordinary-wallet claim. No economic
batch or production-readiness result follows from activation alone.

## Real unused-funding return closed

Bob's original wrong-payer NFT bootstrap funds were returned through the formal
route and claimed by his ordinary wallet, completing at 03:08:15 UTC. Returned
principal: **1.0001 test PSY** and **one smallest unit of QA FT-A 2464** (18
decimals, not one whole token). An initially underfunded vault requested two
fee budgets; explicit sponsorship funded gas, then the exact sender-bound
return executed at checkpoint 359288. Total fees across enrollment, sponsorship,
fund-gas, return and ordinary claim were **5.000020000 test PSY**, of which
Bob's two recovery wallet UPSs paid **2.000006000**. The closed Bob/sponsor/new
NFT-vault interval includes all pairwise pending transfers: FT total unchanged,
native decrease exactly equal to those included fees. This covers failure
recovery without redirecting principal or borrowing another sender's funds.
Full public requests/receipts/proofs and before/after accounting are archived
under `bootstrap-orphan-return-v1/`; original files remain untouched. Curve
inventory, LP and maximum economic batches were still progressing afterward.
