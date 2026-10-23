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
