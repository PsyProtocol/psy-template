# 2026-10-23 review and continuation

Reviewed baseline: `7c90fb7`, branch `markets-batch-capacity-recovery-20261020`.
Frozen SDK manifest SHA256: `0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`.
No SDK migration, Node edit, old-contract update probe or evidence replacement.

## Confirmed completed work

The four-market maximum/recovery/NFT competition archive was reverified against
its original files. Maximum: 4 members per market; fills 4/2/4/2; ordinary claims
included; exact native fee interval 32.000504 test PSY. Omitted-sender recovery:
21.000203 test PSY fees and principal returned. NFT: one sale, original accepted
set retained across timeout/refreeze, losing/cancelled orders refunded, ordinary
claims included, 25.000228 test PSY fees. Scheduled independent-journal loser
rejection is not simultaneous RPC admission. Do not repeat these completed runs.

## Findings and disposition

1. **P1: composition deployment fallback bypassed the fresh occurrence gate.**
   `liveTwoHop.mjs` caught the historical-index rejection and inferred allocation
   from `next_contract_id`, then registered/funded 2482 despite
   `servicesIndexedReceiptVerified:false`. Current leaf equality and an allocation
   counter do not prove the submitted request's authenticated occurrence. The
   script also reused the earlier deployment owner, reproducing the known alias.
   Financial execution is now removed from this entry; it is a read-only
   historical report reader. Original code remains at `93ad36f`; original artifacts
   remain unchanged. No replacement deployment or old-contract probe was made.
2. **P1 release gap: quote planners are not the requested authorized execution
   layer.** Existing route/book modules accept supplied reserves/addresses; they
   neither verify dependencies nor authorize funds. The historical run uses
   ordinary owner signatures for every step, without a dedicated composition
   contract/key or bounded delegated intent. Its successful sequential trade is
   evidence of market mechanics, not compositional authorization or recovery.
   Keep it explicitly historical; add a separately maintained intent/policy/
   workflow module before enabling delegated execution.
3. **P2: benchmark cold failure text overstates behavior.** An existing preserved
   cold failure is skippable, but a first `run()` failure still stops that attempt.
   Warm safety checks are not removed. The missing Curve cold sample must remain
   missing. Fix this measurement-only control flow with focused regression.
4. **Measurement gap:** prior cost reports contain no peak-memory measurement,
   one warm/cold pair and no service-wide controlled confirmation comparison.
   New timed full-UPS runs record Darwin process peak RSS; historical memory stays
   null. No statistical or network speedup is established by one pair.

The Node checkout remains at `5b7f4e1`; its pre-existing diff SHA256 remains
`002e35e0b13cb6c422fe3abf500ce6aa5241229264d85a3314f22b5e14b59a64`.

## Work continuing

- Executor: collect full-proof resource baseline, add optional phase observations
  to the formal adapter, inspect resident lifetime and exact-proof recovery.
- Composition: domain/identity/amount-bound intent, independent recovery state,
  then a dedicated controller and exact-stack session-bound key. Quote planners
  remain non-authorizing. No UI, new repository or market mechanism change.
- External gates in `MARKET_BATCH_EXTERNAL_GATES_20261021.md` remain open.

## Implemented continuation checkpoints

- Strict unsigned intent/registry and two-AMM planning now live in
  `composition/intent.mjs`. Identity/decimals/U124/substitution tests pass. Quotes
  explicitly remain unauthenticated/non-authorizing until the dedicated contract
  and SD-key proofs are complete; no delegated funding is enabled.
- `performanceMetrics:true` opts the formal compact factory into phase records.
  Observation failures cannot change transaction outcomes. Parent RSS endpoints
  and full timed-process RSS have separate names/units/scopes.
- First transport failure during optional cold calibration is now recorded as
  missing in that same attempt; existing failures are validated too. Unknown,
  cryptographic or possible-broadcast failures cannot use that escape. This
  changes measurement control flow only; all warm proof checks remain.
- The new four-market timed fixed40/compact full-proof comparison is running in
  `/tmp/psy-market-profile-resource-20261023-v1`; no new result claimed yet.

## Formal scan observation (not financial acceptance)

The actual `executor/run.mjs ... scan` entry passed current complete dependency
and key registration checks at common checkpoint **368187**. Scan: **6,213.48 ms**;
Node parent RSS after scan: **82,509,824 bytes** (endpoint, not peak). It returned
only a 1.0001 test PSY start sponsorship request; no proving, funding or submit
was attempted. Six original/hash-verified public files are archived at
`executor/verification/2026-10-23-review-v1/formal-performance-scan-v1/`.
The current focused complete JS regression is **157/157**, supporting evidence
rather than a production certificate. New composition controller/SD-key and
financial acceptance remain pending.

## Independent composition recovery state implemented

The intent now also binds the dedicated execution account, controller and full
key/code/layout metadata. `workflow.mjs` and `store.mjs` implement exact pending
request identities, stage order (including mandatory claims), duplicate receipt
idempotency, caller/nonce/fee bounds, explicit intermediate-asset compensation,
append-only hash-linked snapshots, restart restoration and local revision/lock
competition. Over-budget observed inclusion is retained as `review-required`.
These modules **do not send funds**: receipt verification adapter, dedicated
controller bytecode/key and fresh-instance full-UPS/live acceptance are still
required. Their tests must not be presented as a chain authorization certificate.

## Resource comparison finished

All eight timed fixed40/compact four-market processes completed with matching
full-UPS state/fee endpoints. Full methodology, cold/warm, peak RSS and separate
actual confirmation/claim boundaries are in `MARKET_EXECUTOR_PERFORMANCE_20261023.md`.
Compact warms were 180–206 s versus 578–603 s; process RSS was higher for compact
in this sample. No concurrency increase or new algorithmic speedup is claimed.
Thirty original/compressed-hash-verified public files are archived. These are
synthetic full proofs, not a new real-network economic run or chain TPS.

## Optional pre-admission fallback

`bulkFallbackRemainingCheckpoints` adds an opt-in deterministic dispatch choice
within existing key/contract capacity. Before any acceptance, four eligible
consents use the seven-call bulk path; near cutoff, a partially consented plan
may use the already authorized single-entry path. Accepted members are never
removed; sealed set processing/refunds stay unchanged. Default behavior and
all deployed keys/contracts are unchanged. Focused selection/nonce/cutoff tests
pass. A new evidence case will test this via the production CLI, existing owned
QA AMM 2478 (no new deployment), ordinary claim and a 20-account conservation
interval including the historical second pool. This is not new composition
controller acceptance. No result is claimed before its final receipt/audit.

## Follow-up review: recovery route and checkpoint binding

The client recovery scaffold originally compared `intentId`, registry hash and
its own plan hash without reconstructing the actual steps. A caller could supply
a changed step vault and recompute a local plan digest. It could also prepare a
later stage against a source checkpoint older than the preceding confirmed
common checkpoint. Neither path currently sends funds, but both would be unsafe
foundations for a future financial adapter.

`planIntent` now retains its registry/snapshot provenance; workflow start and
every transition recompute all steps against the intent's committed registry.
Changed vault/market/quantity/receiver and changed registry roots fail, even with
a new local plan hash. Later stage sources must include prior common checkpoints.
Twenty-six composition tests pass, including these route-substitution and stale-
source regressions. Supplied reserve snapshots remain explicitly unauthenticated;
the dedicated controller/key and receipt verifier are still required.

The reservation-only controller is being compiled with the same frozen SDK.
Its application compiler must retain `GetUserPublicKeyHash` while prepending a
Felt height constant. No key check is removed to compile it. Until actual
bytecode tests and complete UPS/SD-key gates pass, it has no custody capability
and must not receive delegated funds. Original failed compile directories remain.

## Reservation prerequisite verified; financial gate stays closed

Application Felt rebasing now preserves opcode 50's Hash index and ignored zero
payload. The SDK proving primitive checks original/transformed key probes with
identical resolved state writes, rejecting each wrong key component. A compiled
reservation lifecycle passes both actual-bytecode tests, including an independent
Poseidon commitment with nonzero high U124 limb, nonce/epoch locks, wrong key,
cancellation and timeout. A test-only state adapter supplies unauthenticated slots;
this is **not a CFC, full UPS, SD-key, client-intent bridge or financial test**.
The frozen lightweight VM cannot materialize this context hash's four components;
the proving-path primitive is used without changing Node or deleting checks.

The new application compiler outputs are byte-identical to all four original
market artifacts. It was not substituted into the financial runtime or deployment
toolchain. The unfunded fixture compiled into a fresh v3 directory; v1/v2 compile
failures and subsequent test failures/passes remain. All 1,466 SDK source hashes
were checked again. A local debug digest is not an upstream reviewed SDK release
or a portable bit-reproducibility claim.

Archive: `composition-reservation-prerequisite-v1/`, **75 files / 6,378,789 gzip
bytes**, originals and compressed hashes verified. The broad JS run has 184
passes, zero failures and two fixture-gated skips; the two gates were then run
against the actual frozen four-market builds and both passed. The first gate
rerun used an incorrect directory and its ENOENT invocation log is retained too.
No test-count-based production conclusion is drawn.

## Exact UPS observation adapter

`composition/receipt.mjs` adds the read-only reconciliation path for an already
recorded broadcast. It hashes preserved request/proof bytes, pins the existing
offline verifier/RPC configuration/SDK profile, verifies the complete proof and
metadata, checks caller/key/nonce/start/end/source, then matches historical leaf,
indexed receipt, proof stats, actual fee and common checkpoint. Unknown results
retain the original pending identity; the module has no send/prove/replacement
operation. Invalid proof failure is retained before throwing.

Read-only smoke: actual ordinary QA request `51af086c…6d11a4`, user 860352,
nonce 63, included checkpoint 368302, content hash `2804f505…507cc4`, verified
fee **1.000007 test PSY** already spent by the original request. No new fee or
financial operation was incurred by this observation. Corrupting a proof byte
was rejected by the frozen verifier with **zero network reads**, preserving the
pending identity. Twenty-nine composition JS regressions pass.

The test workflow/route is synthetic and its controller is not deployed. This
does not verify business-call authorization or constitute a new composition
trade. Historical/index agreement is an RPC observation, not a cryptographic
inclusion/finality witness; runtime identity/domain/upgrade gates remain open.
Archive: `composition-exact-receipt-observer-v1/`, 32 files / 570,462 gzip bytes,
original-copy and compressed hashes verified. Original first-run evidence stays.

## Formal AMM fallback economic acceptance closed

The opt-in 4-hint/1-consent route has now completed through production CLI
admission, seal, commitment, settlement and ordinary wallet claim on AMM 2478.
One accepted member, one fill; 1 QA FT-A paid and 0.614011123258459198 QA FT-B
claimed. Twelve exact included UPSs; native cohort decrease equals **12.000078
test PSY** fees. Twenty-account finite-cohort FT totals and NFT identities match;
pUSDT was not used. No proof replacement, new business nonce retry or repeated
payment was performed. Capacity, market pricing and deterministic ordering stay.

Full source/SDK/binary closure, requests, complete proofs, receipts, identities,
state changes and phase measurements are archived in `formal-fallback-economic-v1/`
(288 files / 9,089,717 gzip bytes), original/compressed hashes verified. See the
performance report for cold/warm, confirmation, claim, memory and fee scopes.
The ordinary order-to-last-claim envelope is 42m 37.226s, including sponsorship,
cutoff and polling waits; it is not chain TPS or an old/new live speed comparison.

This closes the new **AMM** thin-dispatch case, not fresh thin cases for Curve,
Book or NFT. The three retain their prior maximum/recovery proofs and live
acceptance. Composition custody/controller/SD-key/full UPS and new-instance
financial acceptance remain incomplete; external runtime/domain/upgrade/random
source/atomic multiwriter gates remain open. No production certification follows.

## Other-market continuation audit

The deadline fallback selection regression now runs against all four archived
market ABI/policy fixtures. It checks the default wait, pre-freeze deadline
choice, deterministic first/next eligible consent, retention of accepted members
and cutoff seal. All 28 compact-adapter tests pass; these use provider/driver
doubles and perform no proof/broadcast. The preceding maximum, partial refund,
omitted-sender and NFT competition evidence is retained. A fresh thin-dispatch
live case for Book, Curve and NFT is still unverified, and is not inferred from
the AMM result or these selection tests. Shared-vault multi-host coordination,
financial composition controller/key/full UPS and external release/authorization
requirements remain the next substantive gates.

## Funded composition continuation (2026-10-23, evidence checkpoint)

Branch unchanged. Added independent `composition/contract/funds.mjs`, its
18-template dedicated SD-key and client `funding.mjs`. Ordinary owner funding
must execute request, native/FT transfers and funding binding together. All funds
return only to that owner; no intermediate Outbox is spendable before claim;
cancelled/expired in-flight orders remain locked until market recovery.
The key authenticates the complete empty first account state and nonce 1.

Evidence `executor/verification/2026-10-23-funded-composition-v1/` contains the
current compiler artifact, source closure, unchanged 1,466-file SDK check, eight
serialized controller UPS requests and independent end-cap verifications. Full
stack, session, burn, metadata, Merkle export and linked own-state endpoints pass.
Base-market transitions and ordinary owner steps are VM-only in that fixture.
This is not network composition acceptance, cross-vault atomicity or a production
conclusion. Five financial VM regressions, eighteen key templates/attacks and
36 client/recovery tests were also run; counts are supporting evidence only.

Three-market thin test case remains `/tmp/psy-market-three-thin-live-20261023-v1`.
Curve 2480 commit and settlement are included at checkpoints 369518 / 369536,
followed by Bob's ordinary claim. Book 2479 / corrected NFT 2481 continue. Old NFT
2469 remains retired. RPC failures and expired empty intake windows are preserved;
no accepted set is changed, no new financial order/redeposit is substituted.
Renewal v3 uses two explicit eligible hints within the existing four-member key
capacity and a 128-checkpoint intake window. Earlier four-hint fallback and the
64-checkpoint attempt remain recorded failures, not completed acceptance.
Assets are QA FT 2464/2466 and QA NFT 2467 plus test PSY fees; existing pUSDT unused.

Open gates: controller financial Executor adapter and reviewed live registry;
complete base-market/owner UPS workflow and new isolated composition deployment;
refund/recovery/competition matrix; authenticated runtime/upgrade authorization;
future randomness, pre-queue inclusion/service availability and multi-host
coordination. No Node or SDK source change and no old-contract update probe.

Additional sealed continuation: `2026-10-23-funded-composition-v2` retains the
current v7 two-UPS cancelled exit and independent proof verification, two
context-opcode regressions, exact unchanged identities for all four base keys,
and the final 36-test client run. The owner funding entry rejects any SDK or
network other than the selected frozen isolated profile. Its local review hash
is not represented as a chain signature or authenticated state source.

`2026-10-23-funded-composition-v3` closes the synthetic six-controller-UPS
accepted-cancellation refund case: principal stays locked until market terminal
refund, actual FT/native escrow are claimed, only original owner receives return,
and execution account has no residual. All six serialized proofs independently
verify. Two incorrect fixture branch attempts remain in evidence; base contracts
are unchanged. This is not a network or complete base-market UPS workflow result.

## Reboot recovery and formal telemetry continuation (supersedes transient paths)

Host reboot on 2026-10-23 cleared the original `/tmp` QA wallets, three-market
thin-case journals and unarchived requests. The owner confirmed no backup exists.
Earlier thin-case observations above are historical notes, not a completed or
replayable acceptance certificate. No original artifact is reconstructed or
replaced and no replacement payment is performed by this inventory.

Five public archives were restored with gzip/raw SHA checks into persistent
workspace storage, including the maximum recovery/NFT competition archive.
All 1,466 selected SDK source files match the unchanged frozen manifest. A fresh
offline/locked toolchain rebuild is separate from old binary identity; it does
not migrate the SDK and is not yet new financial acceptance.

New read-only inventory at common checkpoint 370200 matches the four archived
market/dependency/code/layout and public key registrations. AMM 2478 and Curve
2480 have terminal queue/batch phase 3. Book 2479 and NFT 2481 still have open
queue phase 1 with two accepted owners each; their prior batch phase is 3.
No receipt history, private wallet recovery or historical conservation claim
follows from this snapshot. Old NFT 2469 remains retired.

Formal compact Executor now observes initialization plus separate bounded public
RPC attempts, without changing proof guards, calls, pricing or capacity. CLI
financial modes reject temporary journals before any RPC; symlink paths are
covered. This is a persistence/cost-observability milestone, not a measured
settlement speedup or complete six-phase performance acceptance. See the
performance ledger and `2026-10-23-executor-recovery-v1` evidence.

Public identity reuse milestone: the formal compact factory now coalesces
identical deterministic key metadata per process, bounded to 32 entries and
binding reviewed driver, exact policy/RPC bytes, network/vault/key and complete
dependencies. It still checks current registrations, code/layout roots and
sealed binary bytes for every factory. No financial state/proof is cached here.
Identity-only four-lookup experiment ran four children before and one after;
it does not establish settlement speedup. Rebuilt frozen verifier independently
rechecked six preserved complete controller proofs. Evidence and limitations:
`2026-10-23-identity-reuse-v1`; 173 formal JS regressions passed, two skipped.

Resident shutdown now confirms the proof-only child has exited, escalating
graceful EOF to TERM/KILL with bounded waits. An unconfirmed exit halts instead
of starting a replacement alongside it. `2026-10-23-resident-exit-v1` retains
fault-injected exit/protocol regression evidence (174 pass, two skip overall).
It does not certify real SDK peak-memory reduction or multi-host coordination.

Fresh persistent QA bootstrap now includes two new ordinary public identities
and one complete native faucet claim by owner 1717440 at checkpoint 370267.
Exactly 1,000 test PSY credit, 1.000002 PSY included fee and 998.999998 balance
reconcile. First pre-session RPC failure is preserved; a single reviewed exact
input/window repair confirmed fresh nonce 0 and no prior request/broadcast.
Its complete saved proof independently verifies. Native claim client wall
161.433 s, indexed/common observation 23.213 s after acknowledgement, full
process peak RSS 5.723 GiB. No matched before/after, separate internal phase or
warm sample exists. This is not a market fill, pUSDT/FT/NFT claim or four-market
acceptance. See `2026-10-23-performance-native-bootstrap-v1` and the performance
status matrix for pending gates, source scripts and original failure evidence.

## Independent financial composition continuation

The candidate now connects `composition/adapter.mjs`, `execution.mjs`,
`selection.mjs`, `client.mjs` and `run.mjs` to the existing financial journal and a
separate `composition_wallet` driver. The old observation-only workflow is not
used to authorize money. First scope remains two separate AMMs, same ordered
U124 FT pair, A→B→A. Book / Curve / NFT composition policies remain unimplemented;
base pricing, priorities and unique-sale semantics are unchanged.

Actual fixes:
- Pin the sole user in generated controller bytecode, rejecting another funder
  publishing/occupying a one-shot account first. New generation requires owner
  and canonical metadata; adapter rejects old unsafe/unpinned source.
- Authenticate issuer decimals and renounced token administration in the
  controller before custody/trading; compile/ABI/code/layout/function closure
  checked separately. Every new action rechecks roots, keys, domain and inputs.
- Proof-only resident process supports non-authorizing exact fee preparation.
  Fresh full UPS must still match complete stack, signature/session, nonce,
  endpoints, modified slots and actual burn. No old witness is reused.
- Persist exact prepared task and checkpoint window on restart. Unknown broadcast
  blocks replacements; code/layout changes halt new work without erasing exact
  original receipt reconciliation, including after process restart.
- Ordinary owner funding is one UPS request/FT/native transfer/bind; terminal
  claims verify exact expected asset/cursors and distinguish an intermediate
  refund from reversing a completed trade.

Current closed evidence: 55 JS/transport tests; six bytecode regressions; one
actual bytecode first-funder rejection; 18 signature templates / 18 attacks;
eight new linked guarded controller UPSs, each independently reverified. Input
4,611,686,018,427,387,921 → intermediate 3,738,416,797,288,011,079 → output
3,141,711,878,267,176,122 atomic units; all controller balances zero. **Base-market
and ordinary owner steps in this harness are VM-only.** Fresh network asset
bootstrap is a separate in-progress case; no network composition acceptance or
production conclusion is recorded.

Offline process 489.61 s, maximum RSS 6,762,348,544 bytes, cold construction
125.229 s; eight controller proofs total 326.067 s (32.489–50.932 s each),
8.000069 test-PSY-equivalent controller burn plus two 1.0001 escrows. Some work
overlapped other offline builds/inspection. No matched performance comparison,
actual chain fill throughput, ordinary full-UPS claim or confirmation latency
is inferred. Full request/proof/state/fee evidence:
`executor/verification/2026-10-23-composition-financial-executor-v1/README.md`.

External production evidence still required (QA progress is not blocked on a
branch-name discussion): runtime owners provide coordinator/realm/edge binary
or image digests linked to commit/config, the upgrade RPC authentication and
replay/unauthorized rejection evidence, and a reproducible reviewed SDK release
matching the existing dependency snapshot. Existing public contract leaf /
contract-Merkle / checkpoint-Merkle RPCs must be tied to the reviewed anchor;
HTTPS observations do not attest running code or inclusion-time immutability.
No unsafe old-contract upgrade probes or Node changes are made here. A certified
future random beacon/seed with checkpoint proof and commit-before-reveal rule,
and cross-host lease/fencing evidence for avoiding duplicate prover work, remain
separate deliveries. Deterministic order and own-account nonce safety remain.

The guarded controller's accepted-cancel/refund path now has six additional full
UPSs and independent saved-request verification; funding-then-pretrade-cancel
adds two more (16 new controller UPSs total across three scenarios). Principal
and native escrow claims are proved in the controller, zero terminal balances
checked; base-market/ordinary actions remain VM-only. Archives:
`2026-10-23-composition-refund-ups-v1` and `2026-10-23-composition-cancel-ups-v1`.
Fresh QA FT 2483 has an indexed new deployment receipt. QA-B's first attempt
failed at a pre-broadcast state read after initial proof preparation; the pinned
driver explicitly records no broadcast attempt. The failed request/proof is
preserved; one separately reviewed same-artifact/deployer attempt is recorded
under a new directory. No unknown broadcast is automatically replaced.

## Source closure and interrupted-request recovery checkpoint

Formal composition startup now requires two canonical FT source builds and two
canonical AMM admission/bulk source builds, reviewed compiler/inspector/key tool
hashes, full integer IR/ABI comparison and all six derived registry fields. Base
SD-key policies and identities are reconstructed separately. ABI compatibility
or executor-supplied addresses/roots alone cannot authorize a route. Adapter
transport tests explicitly inject stub IO; that injection is not a CLI option.
The current regression invocation passes 60 tests. Actual artifact-derived
identities/counts also match included QA-A 2483; this is not yet an actual
four-component startup or economic composition acceptance.

The unfunded original live case is quarantined and retains its unknown request
601e19d3…93beda. A late receipt cannot enable that case's financial entrypoints.
The successor changes QA-B's canonical issuer/code and records its request
4ec1d50f…e7ac2 before one compact-wire broadcast. The process was interrupted
before a response was saved; read-only lookup at checkpoint 370621 remains 404.
No new request replaces that unknown deployment and no controller is funded.
Neither absence nor local quarantine is an on-chain cancellation.

An ordinary owner-to-owned-recipient 20 test PSY transfer was interrupted before
any completed proof/request/intent file. A reviewed recovery verified the exact
pinned binary's durable write-before-send order, stopped process, empty output,
unchanged account nonce/balance/cursors and original input/window, then completed
the original transfer once. Recipient's ordinary claim is included: balance
18.999998 test PSY, claim fee 1.000002. A faucet TLS failure is preserved separately;
no repeat faucet request or pUSDT funding was made. QA FT 2483 initial issuance
is a separate in-flight UPS; no market/composition completion is claimed here.

Only a read RPC was used for transport-size diagnostics: one 77-byte request
returned HTTP 200 in 1,141 ms, and one 10,818,090-byte request in 4,971 ms. These
single observations do not identify deployment verification/queue failure or
show proof/confirmation throughput. Request compaction is not claimed as a
measured end-to-end speedup. Original artifacts and withdrawn/replacement release
metadata remain intact. Evidence/source checkpoint:
`executor/verification/2026-10-23-composition-source-closure-v1/README.md`.

External deployment capability needed for safe automatic recovery: a caller-bound
idempotency identity with durable accepted/queued/included/rejected/expired
status and a guarantee that terminal rejection/expiry cannot later enqueue the
same initial request. Existing content hash identifies code/deployer, not a
unique queued occurrence. Current indexed 404 cannot supply that guarantee.
This is an interface requirement, not authorization to edit Node or probe old
contracts. Runtime/upgrade evidence and other previously listed boundaries stay
open; existing candidate code does not claim to solve them.

## Closed real constituent acceptance and final source checks

QA-A 2483 issuance is now included: 1,000 QA FT, 18 decimals, administration
renounced. Real cross-realm ordinary transfer and claim of
4.611686018427387921 QA FT (limbs 17/1) both included. Owner holds
995.388313981572612079; recipient 4.611686018427387921. Total remains 1,000;
sent/claimed cursors agree. Five actual ordinary UPS requests (native send and
claim, FT issuance, FT send and claim) were independently verified against the
fixed key/common data and endpoint/fee binding; a changed fee in the actual
claim fails. Total fee is 5.000015 **test PSY**. Combined native spendable
balance 998.999998 → 993.999983, exactly matching burn. Existing pUSDT unused.
No new pool or financial controller has received funds.

The four-component source/IR/code/layout/function/base-key gate has additionally
passed with real compilers/identity tools over synthetic route IDs, with no RPC
or UPS in that gate. The verification stage took 116.989 s; fixture preparation
is excluded. Final regression count is 61. Separate full-metadata read-only
acceptance rechecks all frozen code/layout/function/count fields. Recovery of
already-issued QA-A now retains QA-B claim and conserves the prior QA transfer
allocation instead of reminting or skipping a stage.

Process-through-ack wall: native claim 109.269 s; issuance 135.935 s; FT send
116.346 s; FT claim 126.594 s. Ack to local inclusion observation: 97.440 /
218.011 / 63.224 / 184.367 s, respectively. Resumed native-send timing was not
recorded. These include cold work, polling/indexer/common-snapshot effects and
concurrent offline work. Phase RSS, matched cold/warm comparison and market
confirmation throughput remain unmeasured. No acceleration or chain TPS claim.

The newer QA-B exact request remains unresolved at the last recorded checkpoint
370672. Its content hash and original wire/proof/intent remain durable; no
resend or new sequence of substitute deployments was issued. This blocks the
new two-pool/controller live composition workflow. The above wallet primitives
and offline full controller UPSs do not close that gap, the other market adapters,
refund/competition matrix or external runtime/upgrade/fairness dependencies.

Sources, full requests/receipts, endpoint roots, fees and original timing logs:
`executor/verification/2026-10-23-composition-constituent-live-v1/README.md`.
Final source/61 regressions and new all-field report:
`executor/verification/2026-10-23-composition-final-checks-v1/README.md`.
All 1,466 SDK source hashes were checked again. No SDK switch, Node changes,
old-contract update probe, UI expansion or original artifact overwrite occurred.

## Continuation: independent QA-B receipt and live route prerequisites

The unresolved QA-B content hashes above remain excluded and were not resent.
A single explicitly bounded alternative uses the already registered canonical
QA-B issuer as deployer (a different deployment identity): contract **2484**,
content hash `ea8eaafd385df8425dd8e03010c47e8ea66c915d4a3304ddd3e1230613b7ad6f`,
included checkpoint **370732**, with initial layout, deployer and all six
code/layout/function/count fields checked. This does not establish that either
older request was discarded. Fresh AMMs **2485 / vault 1012928** and
**2486 / vault 718016** are included and registered; existing markets unchanged.

QA-B issuance/renunciation and the issuer's Outbox send are included. Initial
ordinary claim attempts stopped before broadcast. Their identical suppressed
error SHA256 matches the exact frozen SDK error `Failed to parse JSON response:
EOF while parsing a value at line 1 column 0`. A read-only call proof passed;
the reviewed second attempt additionally reached full UPS proving, then failed
its post-proof public-state read. Original attempts and validity windows remain
intact. The application-only v4 build retries only recognized public-read
transport/empty-body errors, up to four attempts. Constraint/identity failures,
partial session proving and broadcasts are not retried. No SDK or Node change.
The subsequent claim and market liquidity/route operations are pending evidence,
not accepted merely because their runners now exist.

The financial adapter now requires a pinned controller compiler and actual
canonical controller source → complete integer IR/ABI → code/layout/function
root closure. Real frozen-tool offline derivation passed in 34.540 seconds on
the prior synthetic-ID controller fixture; this is a build check, not transaction
proof/confirmation performance. New live runners keep controller orchestration
separate from base market Executors. The success and partial-trade cancellation
cases use dedicated owner-pinned controllers and keys, formal factories/journals,
ordinary owner funding/claims and exact receipt recovery. They still require
actual completed network evidence before a live composition acceptance claim.

Regression at this checkpoint: 61 composition tests passed, including controller
source/IR/root boundary rejection and immutable application release selection.
Archive: `executor/verification/2026-10-23-composition-new-pair-v1/README.md`.

### QA pair claimed; live route still pending

The application v4 reviewed claim is now included and independently verified
against the frozen end-cap key/common data. QA-B issuance and claim full proofs
both pass the separate saved-request verifier. `ASSETS-READY-v1.json` at common
checkpoint **370847** checks 1,000 QA-A and QA-B each, 18 decimals, renounced
administration, exact claimed QA-B cursors and the earlier QA-A allocation.
The claim process-through-ack took **103.580 s**; it is not pure proving time.
No ambiguous request was resent. All older attempts are preserved.

Success controller **2487**, dedicated execution account **390336**, is newly
registered. Recovery controller **2488 / 1307840** was registered subsequently.
These registrations and the two AMMs are isolated new instances, not evidence
that a route has yet traded. Explicit LP/bootstrap, route success and partial-
trade cancellation/return remain underway. Native top-up is one separately
accounted 100-test-PSY internal transfer, with exact original identity reconciled
across a deliberately stopped orchestration parent; no replacement payment.

Acceptance now also recovers an already included composition operation before
planning the next action after restart; a duplicate included identity stops for
review. 62 composition regressions and two static Rust diagnostic/read-retry
boundary tests pass. Same-host competition is explicitly labelled; no claim of
cross-machine locking follows. The fixed admission window remains within the
existing 128-checkpoint protocol bound and is chosen before admitting orders;
no accepted/frozen collection is shortened or replaced.

Archive: `executor/verification/2026-10-23-composition-qa-pair-claimed-v1`.
Live trade/owner claims/recovery and whole-cohort fee audit still need evidence.

## 2026-10-24: actual initialization gap, safe v2 intent and empty-epoch recovery

Before controller funding, code review found that the fresh execution account
has no second FT tree. The current base Executor correctly refuses to treat an
absent contract tree as an authenticated nonzero-height empty tree. Earlier
controller-only synthetic proofs did not exercise that market-Executor check.
The check was retained; no Node or SDK migration was made.

Financial intent **v2** explicitly binds a one-atomic-unit initialization of the
other FT. One owner UPS sends the exact input/native budget and this one unit;
`bind_funding` checks the exact unit or rejects the whole owner UPS. First
controller UPS checks that authenticated owner Outbox, sender-bound cancels it
back to the owner, checks zero spendable other-asset balance and exact refund,
then charges the actual fee. The request commitment now binds version 2 and the
initialization identity. The unit never supplies trading liquidity; the owner
claims its separate refund with final payouts. This current SDK requirement is
explicit, rather than an assertion of A-only onboarding. A future authenticated
absence interface or reviewed FT account initialization method remains separate.
Legacy v1 advisory/report reading stays available; financial custody requires v2.

Earlier registered but unfunded controllers 2487/2488 and their keys were
checked at nonce zero with zero assets, then retired without updates. New source
and keys use fresh instances. A same-checkpoint deployment receipt-ID discrepancy
was caught before funding; original requests were not resent. See
`DEPLOY_RECEIPT_ID_COLLISION_20261024.md`. The selected exact-ID prerequisites
are success **2491 / 1445056**, recovery **2489 / 134336**.

Evidence so far: 64 composition regressions, 7 actual-bytecode VM tests, all 18
key templates and 18 stack/session/fee/initialization attacks pass. New success
path has 8 linked full controller UPSs; new accepted-cancellation/refund path has
6. The final two-UPS pretrade cancel test is still running at this checkpoint.
First complete initialization proof was independently checked against pinned
key/common data. Its exported delta changes the other FT root from absent to
nonzero, with spendable balance zero, owner seed claim cursor 1 and owner refund
Outbox 1. These remain synthetic checkpoint proofs, not live composition fills.

Success proof run: 497.85 s total test wall, 124.514 s cold circuit build,
334.938 s summed eight full controller UPS stages, fee 8.000070 test PSY;
base/ordinary actions are VM-only in that run. Concurrent network setup and
other proving work occurred. This is not a matched before/after benchmark,
confirmation throughput or speedup claim. Full refund test wall: 420.73 s.

Real bootstrap audit at its fixed snapshot conserves 1000 QA-A and QA-B each,
including pending Outboxes, and matches exactly 7.000038 test PSY of new fees.
Seven actual bootstrap UPSs independently verify; actual fee mutation rejects.
The first 40-checkpoint LP epoch expired before admission: queue count zero in
both pools, no accepted/frozen collection. Two exact empty-epoch abort UPSs are
included at checkpoint 370965. The same funded LP orders request fresh owner
consent in epoch 2 with a 64-checkpoint unopened window; no principal is resent.
New LP settlement, ordinary final wallet claims, the live route and its
cancelled second-hop sender recovery still require their own completed receipts.

The frozen SDK's 1466 sources and Cargo.lock match again, and the preexisting
Node diff SHA256 remains `002e35e0b13cb6c422fe3abf500ce6aa5241229264d85a3314f22b5e14b59a64`.
No runtime-image, upgrade-authorization, global fairness or production conclusion
follows from these passing tests. Current archive:
`executor/verification/2026-10-24-composition-initialization-v1`.

### Saved static layout verification and completed v2 proof gates

All 16 v2 controller UPSs now pass: 8 success, 6 accepted refund, 2 pretrade
cancel/exit. The last test wall is 166.19 s. Client regressions now total 67,
including exact saved initial proof endpoint/provenance rejection and live
controller-deployer rechecks. The actual selected 2491/2489 source/artifact/
code/layout/function/base-key closures pass offline over real included IDs,
in 143.735 / 141.465 s respectively; these are startup validation costs, not
transaction proving or network confirmation.

The previous adapter inspection generated another static initial-layout proof
on every start. A new optional path instead re-verifies the **exact saved initial
deployment request** with the existing frozen verifier (SHA256 910949e3…ae1).
The verifier checks canonical ABI layout, zero old fields/slots, real deployer,
whole reviewed compiled code/whitelist, proof validity and all public endpoints.
Source recompilation/IR/function-root closure remains mandatory; current live
code/layout/function/count/deployer/key/network checks and every fresh account
witness/nonce/signature context/fee/UPS/receipt check remain. No old user-state
proof is reused. Without this configuration, full prior inspection still runs.

One sequential same-host/artifact/SDK/2-thread static-validation pair measured
295.687 s re-generation vs 61.282 s saved-proof verification. Process peak RSS:
4,520,493,056 vs 2,604,236,800 bytes (`time -l`). Old inspection uses the dedicated
key hash as nominal deployer; new verification uses the actual included deployer.
Other test work ran concurrently. This is neither an identical financial request
comparison nor a controlled statistical before/after network benchmark. Wrong
deployer, altered layout count and corrupted actual proof all reject. No chain
TPS, transaction proof speedup or production conclusion is inferred.

Real LP orders are now both admitted in epoch 2 at checkpoint 371009 and sealed
at 371048, with commits included at 371061. The accepted collection is unchanged.
Settlement, ordinary initializer grant, real composition/claims/refund still
require the continuing live run. Native controller budgets are separately checked
against exact receipt burn, owner refund and net market service escrow; whole
cohort burn/FT supply accounting includes all internal pending Outboxes.

### Live prerequisites and read recovery continuation

Both isolated AMM LP batches settled at checkpoint 371072 and the ordinary LP
close actions completed; the fixed audit at 371079 shows 20 QA-A / 20 QA-B in
each reserve. The one-unit QA-B initialization grant to the recovery owner was
sent and ordinarily claimed at 371093. No composition execution account was
prefilled. The success owner's exact funding UPS has an included receipt; later
controller stages and final claims remain pending and are not inferred from it.

Public RPC reads now also retry the exact empty-JSON `SyntaxError` within the
existing three-attempt bound. Malformed nonempty JSON, authentication and logical
errors still fail closed. No broadcast or proof-generation retry was added.
86 focused read/receipt/composition regressions pass. Monetary final acceptance
reports are read losslessly; performance metadata includes actual code/layout
identities. The two prerequisite waiters were restarted only before route
financial work and their restart records preserve the old logs. Static comparison
archive integrity matches all 55 originals:
`executor/verification/2026-10-24-composition-static-validation-v1`.

### First real initialized controller funding

The owner's exact v2 funding UPS is included at checkpoint 371108; dedicated
controller 2491 / execution account 1445056 fund UPS is included at 371125.
Actual QA-B state is nonzero-root with spendable balance zero and exactly one
atomic unit refunded to the original owner. Parent acknowledgment was deliberately
lost after successful child broadcast; exact receipt reconciliation completed
without replacement/resend. A real second local OS process rejected VaultBusy
before proof or send. These are explicitly injected parent-fault and same-host
shared-journal tests, not physical outage or multi-host coordination.

A newly created adapter reconciled the original funding, retained exactly the
same broadcast identities and found no unresolved operation. Source/layout/key
and current public dependency checks remained enabled on restart. First-hop
opening is now proceeding; no final route or owner claim conclusion yet.
`executor/verification/2026-10-24-composition-live-funding-v1` preserves this
closed milestone plus actual LP/empty-epoch recovery and ordinary initialization
records (1,711 files; 15,471,638 compressed bytes, original hashes checked).

A read-only closed-case performance reporter now requires both final ordinary
claims, zero controller residual balances, the exact cohort audit and complete
independent actual-proof verification before producing a report. Receipt hash,
fee and payer must agree. Missing timing stays null; reversed timestamps reject.
It distinguishes startup, resident quote/full proof, overlapping adapter phases,
ordinary wallet process wall, receipt/common observation and optional sampled
memory. No matched live control or server-finality latency is invented. Focused
regressions total 88. This reporter does not submit or authorize transactions.

### Accepted first-hop collection and final-claim audit gates

Success controller opening is included at 371154, market epoch start at 371178,
owner consent at 371195 and exact first-hop admission at 371215 (cutoff 371227).
The common 371241 snapshot still has exactly the intended sole member 1445056 /
nonce 1 in epoch 3, phase 1. The queue root remains zero before sealing; this
snapshot is not presented as a sealed-root or global-market completeness proof.
The original admitted collection continues through sealing and settlement.

`composition/acceptance/ownerClaimAudit.mjs` adds a read-only final gate: actual
historical ordinary-owner balances and cumulative sender/claim cursors must
match the full independently verified request's start/end leaves, identity,
input bytes and exact fee. QA FTs use U124 and 18 decimals; native test PSY uses
9. The declared one-unit initialization refund is included separately from
route principal. These are explicitly public historical state observations,
not a separate Merkle proof for every RPC slot or runtime attestation.

The closed-case performance reporter requires both this claim audit and the
whole-cohort/independent-proof gates. It records all base stage proof timings
and submit/observation walls plus ordinary owner and sponsor process walls;
missing data stays unknown. Four observation-unit checks pass, including large
limbs, wrong balances/cursors/fees and wrong receipt/payer attribution. Actual
final live claims and the second-hop recovery are still pending. Unit/snapshot
archive: `executor/verification/2026-10-24-composition-claim-observation-v1`.

### First real hop settled and intermediate FT claimed

The first sealed collection is confirmed at 371253 (nonzero sealed root and same
sole member/cutoff observed at 371258), committed at 371276 and actually settled
at 371303. The dedicated controller then claims the intermediate QA-B at 371335.
Actual spendable balance and cumulative claim cursor agree at a later common
snapshot. Input **4.611686018427387921 QA-A** produces
**3.738416797288011079 QA-B**; actual reserves are
24.611686018427387921 QA-A / 16.261583202711988921 QA-B. These exactly match the
canonical pricing and reserve deltas. No existing pUSDT is used.

The next order uses this actual spendable intermediate asset; its second-vault
UPSs, final return, ordinary final claim and cancellation/refund scenario remain
pending. No cross-vault atomicity, global fairness, chain TPS or production
conclusion follows. Closed first-hop/source/receipt/state artifacts are in
`executor/verification/2026-10-24-composition-first-hop-live-v1` (2,330 files,
24,879,711 compressed bytes; originals compared). Later independent actual-proof
verification and whole-cohort audits are still required. The final ordinary
claim audit additionally binds the pinned ordinary actor's public-key hash,
nonce and end user-state root; it does not accept only a matching numeric ID.

### Both actual pool settlements and next resource coverage

Second-pool settlement is included at checkpoint 371489. Actual intermediate
consumption, final Outbox and reserve deltas match **3.141711878267176122 QA-A**,
above the signed minimum **3.110294759484504360 QA-A**. Final controller claim,
return and ordinary owner's receipt still require their own confirmations.

Success already exercises explicit first-fund restart/reconciliation. The future
recovery child will instead retain its resident from its actual first fund into
its first open, covering that fresh-root warm transition without repeating a
completed cold restart. Adapter/resource IDs and parent PID are observations;
old prepared witnesses, nonce, signature session, fee/current-state checks and
full UPS proofs are unchanged. A restart produces a different ID and cannot be
reported as warm continuity. The running success child keeps its prior loaded
source. Exact planned future source hashes and 43 focused resource/journal/
measurement regressions are archived in
`executor/verification/2026-10-24-composition-warm-preflight-v1`. Live warm reuse,
final owner claims and compensation remain pending; no speedup conclusion yet.
The SDK/genesis/lock check and unchanged preexisting Node diff are re-recorded.

### Actual worker restart gate prepared

The QA recovery entry now supervises a separate financial worker. After real
fund and open-1 confirmations with the same warm resource, the worker verifies
zero unknown broadcasts, saves an included checkpoint, confirms resident closure
and exits with reserved code 73. One new worker is permitted only for that exact
PID/config/included-journal checkpoint. It re-reconciles the exact receipts before
any next ordinary sponsorship and records a different PID/resource with unchanged
broadcast identities. Other errors stop; no unknown business operation is retried.
The running success retains its original loaded source and adapter restart test.

45 targeted checks pass; the exact new plan/worker/harness source hashes and
regression log are in `2026-10-24-composition-process-restart-preflight-v1`.
The earlier warm-only plan remains unmodified and is explicitly superseded for
these lifecycle hashes. Actual warm first-fund transition, physical worker exit/
resume and cancelled second-hop final claim still await real execution. The final
performance report requires those planned live markers and does not equate this
controlled exit with a power cut, multi-host takeover or production qualification.

### Completed real success path and ordinary owner receipt

The second output is claimed by the controller at 371504 and returned at 371519.
The ordinary signature CLI wallet actually claims at **371528**. Its historical
QA-A balance increases from 950.776627963145224158 to
953.918339841412400280: exactly **3.141711878267176122 QA-A**, above the signed
minimum. QA-B increases by the separate one-unit initialization refund. Controller
phase is 99 and A/B/native spendable balances are all zero at 371532.

Actual native controller accounting (test PSY, 9 decimals):
20.002000000 budget = 8.000070000 controller receipt burn + 10.001730000 owner
refund + 2.000200000 net market escrows. The final ordinary claim fee is
1.000006000; actual owner native changes 842.997532000 → 851.999256000,
exactly refund minus that fee. This differs from external sponsor and ordinary
funding costs. Native fee limits are not assertions of profitable Bot economics.

The actual ordinary full UPS independently verifies against pinned key/common
data, and actual fee mutation rejects. Historical ordinary owner request hash,
public key/nonce, start/end leaf roots, FT spendable increases, claim cursors and
native fee agree. The audit helper supports explicitly selected known scenarios
for milestones; the final combined report still requires both scenarios and all
cohort proofs. Three claim-audit checks include rejecting invalid/duplicate/empty
partial scenario selection before filesystem/RPC access.

At the fixed success snapshot, both QA supplies remain 1,000 and the eight-account
cohort including pending internal Outboxes matches **61.000505000 test PSY** of
new deduplicated receipt burn since the earlier constituent baseline. This amount
includes LP/bootstrap/market/sponsorship work, not solely the composition fee cap.
Closed success evidence is in
`executor/verification/2026-10-24-composition-success-complete-v1` (5,203 files,
35,350,371 compressed bytes; all originals compared). Full cohort independent
proof re-verification remains a later gate. This is actual two-pool/ordinary-wallet
success acceptance, not browser UX, global fairness, cross-vault atomicity or
production qualification. The separately funded recovery instance is now running.

### Real warm transition and physical worker continuation verified

Recovery controller 2489 / account 134336 confirms fund at **371580** and open-1
at **371593** with the same adapter/resident resource
455540b4-1175-45af-9019-e051467d44a5 in worker PID 1358. Complete new witnesses,
nonce/session/call/fee/full-proof checks remain enabled. The first warmed
fresh-account transition is therefore exercised against the actual network.

At that exact included checkpoint with no unresolved broadcast, the resident
was confirmed closed and worker 1358 actually exited with reserved code 73.
Supervisor then started worker **8098**, which created resource
a5fc61cf-296e-4e03-b1f4-f910bb0f8354, revalidated source/key/dependencies and
re-reconciled both original receipts before the next sponsorship. Original
broadcast IDs are unchanged; neither financial operation/proof/payment repeats.
The full cancelled-second-hop route and ordinary claim still remain pending;
this is a planned known-included worker boundary, not power-cut, unknown-broadcast
failover or multi-host coordination. Source/proof/checkpoint records are in
`executor/verification/2026-10-24-composition-worker-resumed-live-v1` (108 files,
9,791,448 compressed bytes; all originals compared).

The performance reporter now summarizes observed JavaScript public RPC physical
attempts, failures, fractional queue/RPC durations and missing timings by method
and endpoint. It does not interpret missing values as zero or concurrent sums as
elapsed wall, and explicitly excludes unobserved/Rust SDK witness IO. Six targeted
measurement/claim checks pass, including invalid partial scope, receipt/payer/fee,
large limbs, nonfinite timing and missing/failed observations. No matched full
live speedup or chain throughput conclusion is made.

### Observed intake expiry and explicit, non-retrying recovery (2026-10-24)

After the physical worker restart, controller 2489 / account 134336 confirmed
consent at checkpoint 371654. The first market's epoch 4 closed at 371671;
`admit_entry` then failed its actual proof bounds before any request or broadcast
intent existed. Original failure reports `broadcastMayHaveBeenAttempted: false`.
The Executor stopped rather than resending, backdating the witness, extending
that epoch or loosening the cutoff check. Empty abort confirms at **371738**.
The exact pending sponsor authorization is consumed; no duplicate grant is sent.
Explicit owner cancellation and sender-bound principal/native recovery are now
running through the original controller and market identities.

The controller permits one consent per hop. An expired consent cannot be renewed
under this one-shot intent; its exit is cancellation/refund and a new isolated
intent. This is a real liveness boundary, not an automatically renewed queue.
A separate `partial-recovery` instance is being registered for the outstanding
first-trade/second-hop-unaccepted compensation test. Its intake window is chosen
**before opening**, 96 checkpoints within the unchanged on-chain maximum 128;
member count, call lengths, fees, keys and all source/session checks stay bounded
by their existing verified policy. Its owner is the same QA recipient, publisher
is the other owned QA actor, and its controller/account/key are new. The old
funded timeout instance and its evidence are preserved.

Acceptance and performance reports now distinguish zero-fill principal recovery
from one-fill middle-asset compensation and two-fill success. A resumed worker
followed by domain expiry is recorded as such, never a successful original
supervisor run. All three ordinary owner claims and final exact cohort/full-UPS
verification remain mandatory before the combined completion report is emitted.

### Real zero-fill timeout recovery completed

The original recovery instance now has a complete, ordinarily claimed exit:

- Empty epoch abort: 371738; owner cancellation controller transition: 371787.
- Recovery authorization: 371829; base sender-bound return: 371843.
- Controller claims original QA-A/native escrow: 371871; return to owner: 371887.
- Ordinary owner claim: **371903**, exact indexed content hash
  `ff0f5c8ed8a941731e1f5636e5d9914b1fc57168f851778c91019043314541d2`.

The user received **1 QA-A**, the separate **one-atom QA-B** initialization refund,
and **13.001943000 test PSY**. The controller's original 20.002000000 budget equals
7.000057000 actual controller receipt burn plus that refund, with zero net market
escrow after cancellation. Ordinary claim burn is separately 1.000006000; other
ordinary and base/sponsor costs are in the cohort audit. Controller phase is 99
and all its spendable QA/native balances are zero. No market fill is counted.

At fixed checkpoint **371905**, the nine-account cohort, including every directed
internal pending Outbox, has exactly 1,000 QA-A and 1,000 QA-B. Native balance change
matches **76.000612000 test PSY** across 76 new deduplicated receipts since the
constituent baseline. That cohort amount includes bootstrap/LP/sponsorship and
is not the composition intent fee cap. All-receipt independent cryptographic
reverification and the one-fill middle-asset recovery remain open.

New controller 2492 / account 1756352 now has frozen plan
`b8b8c1003b8f7df640bcc7eb79dfaba462e643b45a1e68f522d73a466e24d19a`.
Its real financial Executor has started after the original ordinary claim and
cohort audit. Original funded timeout evidence is retained unchanged.

The refund helper's continuation now recognizes persisted base refund tasks and
uses the original final-Outbox report after the owner's claim. It no longer
requires an already completed refund to reappear as a new scanner action, and
never replaces the original completion marker. An actual second helper process
was run after terminal ordinary claim: all original financial request, intent,
receipt, journal financial-identity files and the completion report have identical
before/after hashes; no new financial request appears. The report is
`TIMEOUT-TERMINAL-REENTRY-v1.json`. This closes terminal duplicate-entry coverage,
not interruption at an unknown broadcast. Post-claim source-verification adapter
startups are reported separately from the route's operational resource lifetime.

Closed zero-fill recovery/ordinary claim/reentry evidence is archived at
`executor/verification/2026-10-24-composition-timeout-claimed-v1` (2,218 files,
23,605,491 compressed bytes; every original hash compared). Integrity comparison
is not the separately pending independent full-cohort UPS verification.

### Actual cross-realm funding and warmed distinct-nonce UPSs

The partial-recovery owner **406720 (realm 0)** funds execution account
**1756352 (realm 1)** at checkpoint **371948**. Controller 2492 confirms `fund`
at **371972** (nonce 1) and `open-1` at **371993** (nonce 2), each with **7 actual
calls including burn**. End leaves, exact original receipts, stats, full-proof
and stack/session preflights agree. The same resource
223bdbf4-9a19-4340-96a3-650c4ae94d14 / PID 31322 serves both operations; separate
fresh transaction witnesses/nonces remain mandatory. The performance join rejects
another intent, unresolved result, wrong operation, missing or changed process /
resource identity. Four focused performance/audit regressions pass.

Measured preflight totals are **136.872 / 139.571 seconds**, including witness/
state IO within the Rust phase walls; call proving is 70.620 / 69.800, recursive
finalize 22.094 / 22.048, end-cap 4.755 / 4.706 and full-proof verification
3.312 / 3.376 seconds. Key/session construction is observed separately in the
first resident quote. These are distinct operations, not matched before/after
throughput samples, HTTP latency or chain confirmation rates. No speedup follows.

Evidence is `executor/verification/2026-10-24-composition-cross-realm-warm-v1`
(86 files / 1,811,275 compressed bytes; all originals compared). First market
intake plan is chosen before opening: **epoch 5, cutoff 372100**, one member
1756352 / nonce 1, deterministic mode. Admission, sealing, actual trade, second-hop
cancellation, ordinary final claim and independent final audit are still pending.

### Partial-recovery first trade is real and included

The same fixed epoch 5 / cutoff 372100 / one-member set proceeds through actual
consent **372041**, admission **372059**, seal **372107**, commit **372135** and
settlement **372150**. The original pre-broadcast expiry is not retried or hidden.
This new accepted member proves before the new, preselected cutoff with all
original bounds. Deterministic mode and existing capacity remain unchanged.

The first swap consumes nonce 1 exactly once and trades **1 QA-A** for
**0.633097631070860774 QA-B**. A fixed public snapshot matches the original quote,
reserve A plus exact input and reserve B minus exact output. At that snapshot the
QA-B is still the first vault's Outbox. The execution account must confirm its
own claim before spending it on the second market. No cross-vault atomicity is
claimed. The later one-fill compensation and ordinary final claim remain open.

`executor/verification/2026-10-24-composition-partial-first-fill-v1` contains 188
files / 4,886,239 compressed bytes, all originals compared. Five base-stage and
controller-consent original requests/receipts/preflights and funding evidence
are present; final independent whole-cohort proof verification is a separate gate.

Cost reporting now checks each ordinary input's exact preflight SHA and records
native transfers, sponsor authorizations and claim senders separately from actual
receipt burn. Paired authorization + transfer is one funding payment. Nineteen
then-included ordinary inputs pass; large exact amounts and unknown native-call
rejection have focused regressions. Post-claim verification reads/phases are
separated from the operational window. No network TPS or matched speedup claim.
