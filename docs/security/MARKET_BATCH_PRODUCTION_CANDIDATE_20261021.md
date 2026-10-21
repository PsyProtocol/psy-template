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

## Ordered gates

| Gate | Current work | Not yet established |
| --- | --- | --- |
| 1 Formal Executor | Explicit `batch-admission-compact-v1` route, authenticated queue maintenance and compact settlement; existing journal/locks; prepared-proof hashes and fresh broadcast checks | New entrance real network acceptance, full fault matrix and release review remain in progress |
| 2 End-to-end cost | Prepared proof can be broadcast without invoking the prover again; phase measurements added | No measured speedup claimed until same-host full-proof and live timing comparison completes; persistent circuit/session reuse still under evaluation |
| 3 Before-admission fairness | Public immutable admission plans are hints; every admission requires chain-authenticated user consent; missing sponsorship yields a concrete funding request | Opt-in/finite queue is not global inclusion or censorship resistance; exit/recovery review in progress |
| 4 Random order | Deterministic mode retained | Authenticated future source, actual pre-revelation inclusion and anti-abort requirements remain external unless verified |
| 5 Release trust | Existing reproducible SDK snapshot and Node unchanged checks retained | Runtime image attestation, unique production domain and effective upgrade authorization remain unverified |
| 6 Current-version live matrix | Preserve earlier results; target NFT 2472 and full four-member capacity | New route and replacement-version races, nonempty timeout/refreeze/recovery and maximum live batches remain pending |

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
