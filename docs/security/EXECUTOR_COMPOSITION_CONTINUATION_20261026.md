# Executor and composition continuation plan (2026-10-26)

Baseline `61bf987e`, branch `markets-batch-capacity-recovery-20261020`, fixed SDK
manifest `0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`.
Do not change Node/dependencies, update old contracts or overwrite evidence.
Retain deterministic ordering, shared vaults, market pricing/matching and full
authorization checks.

Initial inspection found no active financial/proving process. Existing Node
processes belonged to the Codex UI/tool runtime and were left running. The previous
two measurement children and sampler exited normally; the 34-UPS audit closed,
with no unknown broadcast to resume. New finance requires a separate declared
plan and unique run directory. Historical unknown deployments remain quarantined
and are not resubmitted.

| Order | Existing capability/evidence | Gap and next action |
| --- | --- | --- |
| 1. Measurement | Book: matched-condition 34 UPS, two fills, four ordinary claims, cold/warm and full memory; historical actual fills in the other markets | Index closed samples by compilation, first resource construction and resident follow-up. Cargo's 58.08 seconds is application build reporting with unknown cache state and missing outer timing, not clean SDK compilation. Other-market new pairs and a whole two-pool pair remain open. |
| 2. Resources/reads | Resident prover, fixed verifier library, HTTP client, in-flight coalescing, snapshot leaf reuse and exact-proof recovery | Do not rebuild existing caches. Inspect independent sequential reads in composition scans; measure real readonly pairs and regressions without reducing pre-submit freshness, nonce or endpoint checks. Memory reclamation stays optional. |
| 3. Two-pool critical path | Dedicated controller/SD-key, two actual AMM fills, ordinary claims and intermediate recovery | Need whole-route comparison with the same schedule and lifecycle memory. Identify confirmation, Outbox, cutoff, fee and shared-account dependencies. Parallelize only preparation independent of preceding output; do not spend unclaimed assets. |
| 4. Local sustained operation | Local journal races, one actual restart, separate zero/one/two-hop terminal acceptance | Need declared continuous actual batches and the full fault matrix. Freeze rounds, duration, budget and stop conditions first. Local locks are not cross-machine coordination. |
| 5. Book→AMM | `composition/book.mjs` is readonly AMM→Book planning, not financial execution; Book matches whole orders | Do not add partial matching to fit the route. Proposed minimum: unmatched whole Book order exits, unlocks and claims its full remainder before AMM. Filled funds cannot be spent again. Require independent controller/policy/state machine, bytecode and full UPS before a new isolated instance. Do not start this financial path before the first four stages close. |

Commit, push and append review/evidence per stage. Separate application/SDK
compilation from business startup. Retain protocol waits, failures, retries and
claims. The previous fixed-verifier work saved 40.239 seconds of construction but
slowed the whole round and increased cold-build/full sampled RSS. It does not
support overall acceleration, memory reduction or production readiness.

Existing evidence: [complete cold/warm pair](../../executor/verification/2026-10-26-complete-cold-warm-pair-v1/README.md),
[composition service](COMPOSITION_SERVICE_REVIEW_20261024.md),
[two-pool preparation](SETTLEMENT_PREPARATION_REVIEW_20261024.md),
[capabilities](../../composition/CAPABILITIES.md). Running image identities,
upgrade authorization, upstream SDK release, authenticated randomness and
cross-machine acceptance remain open.

## Stage 1: evidence index

The [readonly classification index](../../executor/verification/2026-10-26-baseline-inventory-v1/README.md)
checks closed markers, full memory coverage, the same financial source closure,
three ordinary first jobs and eight resident follow-ups. Cargo's 58.08-second
application report is separate. Clean SDK compilation and outer build time were
left null rather than invented or measured by an unnecessary rebuild. Two
classification regressions pass; no financial operation was added. The index is
not a substitute for new other-market or whole-route pairs.

## Stage 2: scheduling candidate withdrawn; safety fix retained

Same two historical checkpoints, model/dependencies, global four-RPC limit and
fresh snapshot cache: eight ABBA samples, then eight predeclared BAAB samples.
All 16 samples, read failures and retries are retained. Baseline/candidate medians
at 373744 are 21.142/10.355 seconds; at 374013 they are 16.707/30.743 seconds.
The second hop did not establish a benefit. Broad concurrent scanning was
withdrawn rather than reporting a favorable subset.

The retained U124 two-limb fix drains in-flight sibling reads before propagating
a failed limb. No read leaks into the next task; amounts/authorization are
unchanged. Existing in-flight merging, resident prover, fixed resources and HTTP
client remain. No completed-balance/nonce cache was added. Exact-proof reuse and
all submission checks remain.

Guarded `adapter.warm()` and explicit `service.prewarmResources` (default false)
construct only fixed resources, rechecking network/identity/code/layout/config
before and after. They do not quote, prove or send. Under the journal lock,
unresolved originals skip warmup; reconcile mode also skips it. The first
regression found an uninitialized new journal; initialization/checking now occurs
under the lock, and the failure log is retained. Final related regressions: 46
pass. New memory reclamation/parallel scheduling is not enabled by default.
Actual route/memory benefit from warmup is not accepted yet.

The first historical readonly run also exposed old acceptance configs resolving
paths from the original working directory. The measurement tool explicitly uses
that existing convention; production loading and old configs are unchanged.
New acceptance configs must use absolute paths.

## Stage 1 supplement: source cold/warm compilation

[Originals and methodology](../../executor/verification/2026-10-26-compile-cost-v1/README.md):
same machine, fixed SDK/72 application sources, two threads, fresh target. Cold
build: 661.127 seconds; same-command warm build: 0.943 seconds, all 775 artifacts
fresh. The initial 237.182-second failure remains: no explicit config path and a
missing SDK build-script default. The second run explicitly supplied the existing
manifest-bound config (same SHA 256) and compile network. No SDK, Node or network
substitution occurred.

Compiler-reported SDK/application/other unit times overlap and cannot be summed.
These are not proof/confirmation times. Cold-build sampled RSS maximum:
2,512,453,632 bytes. The sub-second warm build has one sample and a null peak.
Cold/warm artifact hashes match each other but differ from the selected release;
they are observations only, not selected for finance or evidence of byte-reproducible
release. Historical 58.08 seconds remains cache-unknown, not relabelled cold.

## Stage 3: actual two-pool comparison entry implemented, not executed

[Preparation, safety regressions and original failures](../../executor/verification/2026-10-26-route-resource-preflight-v1/README.md).
The new entry reuses formal adapter/journal/native driver. Both sides retain the
fixed SDK and same accepted ordinary-wallet binary. Ordinary owner, Sponsor and
two market-key resources remain resident through the round. Each transaction
regenerates actual state, nonce, witness and signing context. An unconsumed
Sponsor grant must reconcile exactly; another transfer cannot conceal it.

The candidate explicitly overlaps ordinary funding with guarded controller
warmup only. Both must succeed before controller fund UPS. Drain both on failure;
confirmed payment is not rolled back and is not automatically re-signed. Warmup
is opt-in. The [dependency graph](../../composition/EXECUTION_DEPENDENCIES.md)
retains preceding confirmation, Outbox claim, original cutoff, fee authorization
and shared account/vault state. Intermediate assets are not spent early.

Declared baseline/candidate: 28 UPS, two actual fills and one final ordinary claim
per round; six hours per round, 12 hours per pair. Network fee cap 35.0035 test PSY
per round. The separately listed 40 test PSY setup transfer has not run and is
not a network fee. Fixed one-member thin batches, both cutoff leads 128; accepted
sets remain intact. Sequential samples share pools/input amounts but differ in
reserves, quotes, nonces and network state, so identical economic output is not
claimed.

The entry binds SDK/network/native release, independent new controller/key/vault,
source/layout, registration and preparation plan. A ready file alone cannot
permit execution. Full process-tree sampling precedes the financial child. Only
after the first 28 exact UPS pass independent proof, fee/receipt/state-chain,
conservation and claim audits may round two run. Failure stops the pair; unknown
broadcasts never generate substitutes. Reports distinguish compilation, first
resources, resident tasks and final receipt; overlapping stages are not summed.

Four new readonly preflights exhausted bounded common-checkpoint retries with
HTTP 503, latest 03:50:22–03:50:40 UTC. No bypass, endpoint/SDK switch, controller
deployment/registration, setup transfer or new fill occurred. The public plan is
preserved. `baselineCommit=ef57e457` is clarified as a reference baseline; the root
runner must freeze the actual source closure before execution. Review snapshots
are not executed runs.

Related regressions: 58 pass; Executor/composition integration: 342 pass, none
skipped. Counts overlap and are not cumulative security evidence. Syntax checks
pass for 17 changed files. All 420 archived originals compare with the local
source; with compilation evidence, 448 public records passed actual QA-key-value
scanning. No new full UPS, confirmation throughput or end-to-end acceleration.

## Open work

1. A fresh readonly gate must succeed before new controller/key registration,
   original-identity setup funding/claim and this actual pair. Unknown results
   require exact reconciliation. Unavailable RPC is not a reason to weaken checks.
2. Sustained operation still needs this round's declared continuous actual batches,
   fault matrix and memory trend. Historical zero/one/two-hop/local-race evidence
   does not establish local or cross-machine sustained acceptance.
3. Book→AMM waits for stages 1–4. Book is whole-order only. An unmatched order must
   terminate/exit, unlock and claim its actual full remainder before AMM. Filled
   funds cannot be consumed twice. No new independent controller/SD-key/state
   machine, bytecode/UPS or isolated-instance acceptance is claimed.
4. Upstream SDK release, running image identity, upgrade authorization,
   authenticated future randomness, cross-machine coordination and global order
   inclusion remain open. Keep deterministic mode; test counts/receipts do not
   establish production readiness.

## RPC follow-up: 2026-10-26 06:22–06:29 UTC

Full preflight v5 again exhausted bounded common-checkpoint reads with HTTP 503.
Three predeclared readonly rounds queried the same two realms and coordinator:
of nine reads, seven returned empty HTTP 503 with Caddy headers; two failed at
transport level with unknown HTTP status, not falsely classified as timeout or
chain rejection. No complete financial starting state was obtained. This does
not diagnose a Node crash or establish the backend root cause.

[Requests/responses, versions and results](../../executor/verification/2026-10-26-rpc-recovery-followup-v1/README.md).
Diagnostics allow only specified public reads and grant no financial authority.
HTTP recovery still requires the original complete preflight. Later role/ID
validation prevents output-path traversal. Original probe v1 and hardened v2
sources are separately retained; four local regressions pass. Archives contain
151 and 11 exact originals. SDK sources, frozen config, native release pin and
original Node diff checks remain unchanged.

Financial operations, deployment/registration, fills and claims: zero. This is
not two-pool performance acceptance and does not close sustained/Book→AMM work.
The 15-minute heartbeat stays quiet on unchanged faults, resumes the original
budget/plan only after safe recovery, and never duplicates active processes or
replaces unknown requests. Stop it on cancellation or full completion.

## Separately authorized UI: official brand, English and shared theme

[UI, checks and screenshots](../../executor/verification/2026-10-26-market-ui-v2/README.md).
The existing dApp now has single/two-pool AMM, orders and claim/refund demos.
Writes remain closed; wallet connection cannot permit them. Existing U124/two-Felt
BigInt functions are reused. Intermediate Outbox must be claimed; exit after hop
one shows actual intermediate assets.

Following the brand correction, the generic symbol was removed and official
psy-dapp PsyLogo.svg, PsyIconSq.svg and local Geist reused unchanged. The shared
website/Bridge/Explorer/IDE `psy-editorial` theme is white/black/cobalt with square
controls. Active copy, metadata, states, errors and recovery text use English.
Hashes/token provenance: `dapp/design/2026-10-26/BRAND-PROVENANCE-v2.json`.
The initial generated image, Chinese copy and purple design were rejected and
remain historical v1 artifacts, not current acceptance.

Production build and 17 frontend tests pass, none skipped/failed. IAB desktop
1505×1045/mobile 390×844: ten checks pass, no console warnings/errors. Original
keyboard/toolchain audit failures remain. Current audit: zero known vulnerabilities;
frozen dependencies install offline. Existing UI Node.js 24.19.0 is not a chain
Node change. All 1,466 fixed SDK source hashes match. Seven new public originals
compare exactly; four new screenshots have separate hashes. QA-key-value scanning
finds no matches, and no wallet recovery files are uploaded.

This is frontend/local-demo acceptance, not chain identity, fee, fill, proof,
claim or performance acceptance. No formal financial route is connected; actual
two-pool, sustained and Book→AMM work remains open. RPC remained 503 during UI
work; no finance, old-contract, Node, native-release or SDK change occurred.
Closing the UI ACTIVE lease lets the existing heartbeat resume the original plan
only after recovery and full fresh preflight.

## UI supplement: Psy testnet and add liquidity

The network label is `Psy testnet`; the asset ticker is PSY. Liquidity/Add liquidity
previews two existing QA pools, deposits, owner, minimum shares and test PSY fee
budget. It reuses `addShares`, requires exact ratios without invented excess
refunds, and checks U124, reserve/share overflow and rounding. LP is raw internal
units, not an assumed 18-decimal FT; real ownership must bind the authenticated
caller. No LP records are fabricated in swap storage.

[Code and acceptance](../../executor/verification/2026-10-26-market-ui-liquidity-v1/README.md).
Build/22 frontend tests pass; nine desktop/mobile browser checks pass without
console warnings/errors. Initial and improved screenshots remain. A separate UI
lease prevents finance/proof measurement overlap; prior evidence is unchanged.

**No real UI swap, deposit, claim or LP management is enabled.** Pool state, fee,
balance, position and owner are unverified; live controls remain closed. No Node,
SDK, contract, actual deposit, share issuance or removal changed. RPC recovery
still needs formal integration, fresh preflight and actual acceptance.

## Public integration stage one: readonly gateway and exact-wallet boundary

[Sources, runbook and gaps](../../executor/verification/2026-10-26-market-gateway-v1/README.md).
The same-origin local gateway reuses formal Executor common-checkpoint reads and
original end-user-leaf/history/service-receipt reconciliation. QA pools 2485/2486,
assets 2483/2484, vault/key and code/layout/function identities are pinned. Both
ends use one planner; the browser recomputes calls/digest. RPC observations are
not cryptographic state proofs, and demo data remains separate.

Unsigned swap/add/admit/cancel-request/close/claim plans check old orders, consent,
funding/fee cursors and queue capacity before deposits. Exact LP ratio, U124,
owner, checkpoint expiry and separate fee cap remain. The real AMM planner rejects
an alternate recipient because outputs belong to the owner; later transfer needs
separate authorization. No signing, broadcasting, arbitrary proxy or Executor
control route exists. Redirects, bodies above 1 MiB and wrong RPC IDs are rejected.
Application publicState adds only optional fetch injection; the default and Node
are unchanged.

The future exact-wallet seam reuses ExecutionJournal/executeCycle but is not
wired to financial HTTP/browser transport. Regression found/fixed call-object
aliasing: transport copies independently and recomputes the durable plan. The
full stack, automatic burn, actual fee, caller, key/SDK, nonce, session/sig_hash
and state endpoints need independent verification. Unknown broadcasts reconcile
first; shared payer work uses local locks. Mock transports are not real full UPS
or cross-machine acceptance.

Shared/formal Executor regressions: 247 pass (including 27 gateway/client), plus
22 frontend tests, none failed/skipped; counts overlap. Nine actual IAB checks
pass. Local gateway is HTTP 200, while pool and one plan read remain unavailable;
no real snapshot/plan, proof, trade, LP or claim was accepted. Context changes
discard stale responses without demo fallback/re-signing. Twenty-six public
originals retain initial failures and final checks; 83 source/static-closure
inputs and build outputs are bound. All 1,466 SDK sources match; wallet source
was inspected readonly, without SDK switching.

**Real trading remains unconnected.** Wallet source exposes direct sending and
simulation but no accepted exact proof/request, independent verification,
one-shot broadcast and original-request recovery interface. BuildId/debug strings
are not SDK/key attestation. Required fields/acceptance are in
`market-client/README.md`; no nonexistent method or direct-send fallback is used.
Actual full UPS, browser asset chain, unaccepted-order recovery/funding seeds,
Executor projection, running identity and upgrade authorization remain open.
RPC recovery cannot enable UI writes. Actual two-pool/sustained/Book→AMM remain
in the original plan; additional demos do not replace financial integration.

## Three-market UI and LP withdrawal previews

The user separately requested unfinished UI work, bringing forward clearly
labelled offline interactions for the other markets. This changes the page
schedule, not financial integration order or safety gates.
[Code, screenshots and public checks](../../executor/verification/2026-10-26-three-market-ui-v1/README.md).
English copy, official logo, existing Geist/white/black/cobalt theme and native
mobile navigation are retained. Added whole-order quotes, Curve integer lots/
bounds/graduation, NFT search/sort/exact purchase/listing previews, a shared
durable draft center and raw LP proportional-withdrawal preview.

Existing U124/curveQuote/withdraw arithmetic and market semantics remain.
Orderbook exchanges full offers, without partial fills or maker-price refunds.
NFT binds collection/token/metadata/seller/listing nonce/price; saving does not
publish. New drafts recompute strictly in separate storage with only
`draft`/`cancelled` states. Local cancellation is not chain cancellation/refund/
claim. Original AMM demo records remain intact.

Build and 36 frontend tests pass. Desktop/mobile IAB has no document horizontal
overflow; modal keyboard, errors, persistence, Back/deep links and console checks
pass. Two initial text assertions mismatched actual DOM wording/formatting;
originals remain and explicit DOM checks supersede them. Initial closure: 77
source/build inputs; final documentation closure: v2 with 78 inputs. SDK source
count remains 1,466; screenshot hashes are retained. No SDK, Node or old contract
change occurred.

The three markets are still `local-fixture` with no live identities, read gateways
or wallet funding transport. Real LP removal is unconnected. Exact wallet proof/
verify/one-shot broadcast/original recovery, authenticated state, Executor
projection and actual ordinary claims remain open. No new financial request,
UPS, fill, fee or performance result exists. Actual two-pool/sustained/Book→AMM
and production readiness are not closed. The UI lease closes after archival/push;
the original heartbeat and financial plan remain.

## Repository-wide English documentation review

The user requested an international-project language review after finding Chinese
prose in published diffs. Maintained module/readiness/design/security/performance
material has been revised to English, with an explicit
[full inventory and validation](../language/README.md). Original raw archives and
99 individually hashed historical text files remain byte-identical; the
[English evidence guide](../language/HISTORICAL_EVIDENCE_GUIDE.md) provides context.
The UTF-8 test keeps identical runtime bytes via source escapes. A dedicated
language check and CI job reject new Han prose and changed frozen originals.
No Node/SDK/contract/key/financial-state change or new financial acceptance is
part of this editorial milestone. Existing blockers and the original plan remain.


## AMM observed-account and unsigned recovery/withdrawal integration

[Source, public evidence and explicit acceptance boundaries](../../executor/verification/2026-10-26-amm-account-ui-v1/README.md).
Schema-2 common-checkpoint observations now include native output cursors, owned
raw LP and vault recovery/batch lifecycle. The separate account panel never
conflates demo claims, pending outputs, unused funding or consumed-order status
with spendable funds or successful fills. Unsigned planning adds LP removal,
native claim, lawful release and sender-bound recovery enrollment. It never
moves funds, opens a direct-sign fallback or replaces unknown broadcasts.
The new pinned registry extends existing frozen ABI descriptors; old inputs and
all 1,466 SDK source hashes remain unchanged.

TypeScript/Vite build, 38 client/gateway tests, 36 frontend tests and 10 IAB
desktop/mobile checks pass. The initial three registry-method failures remain.
Actual snapshot and withdrawal-plan reads returned HTTP 503 and failed closed;
healthy account rendering and on-chain actions remain unaccepted. No financial
operation, complete UPS, actual fee, fill, claim or performance result was added.
The exact-wallet transport, formal Executor projection and original financial
acceptance plan remain open. UI lease closes only after archival and push;
existing work is not terminated by the heartbeat.


## UI focus: RPC heartbeat stopped and local activity completed

At the user's explicit request, automation `rpc` was deleted through the app
management tool. There is no scheduled RPC/financial continuation. This does not
cancel, replace or reconcile any financial request; the original financial plan
remains pending until separately resumed with its complete safety gates.

[UI source and acceptance](../../executor/verification/2026-10-26-market-activity-ui-v1/README.md).
Orders now offers shared local search, separate market/draft and AMM status
filters, counts, reset and empty-state recovery. Pending intermediate/final/refund
outputs no longer appear in-progress/completed; unresolved receipts remain a
separate category. The asset summary includes actual demo intermediate asset
amounts and removes only their pending entry after the simulated claim.
Draft details show current cancellation/expiry and exact terms; opening the
market does not reactivate the draft. Local expiry refreshes without modifying
original records. Route titles/main focus/scroll and browser Back are coordinated.
The readonly RPC disclosure is collapsed on Orders to prioritize local activity.

41 frontend tests and production build pass. Twenty-one desktop/mobile browser
checks pass, including four-market navigation, combined search, local QA draft
save/cancellation/reload, exact quantities, intermediate-output demo handling,
Back, modal focus and console/layout checks. No RPC read, chain financial action,
proof or performance measurement occurred. No Node, SDK or old-contract change.
Real signing, settlement/claim and healthy RPC acceptance remain open.


## 2026-10-27 usability phase 1: unsubmitted editing persistence

[Review and evidence](../../executor/verification/2026-10-27-market-usability-ui-v1/README.md).
Versioned per-form preferences preserve unfinished exact amounts and selections,
not quotes, identities or executable plans. Restore never submits; corrupt records
are preserved with autosave paused. Cross-tab changes pause editing writes and
do not claim financial coordination. 44 frontend tests, production build and eight
browser restore checks pass. No Node/SDK/old-contract or financial action changed;
the RPC heartbeat remains deleted. Liquidity/field/position phases follow.


Usability phase 2 adds explicit example deposit linking and raw-share percentage
shortcuts, preserving manual mode across reload. Live maximum balance and verified
LP position controls remain disabled. 46 frontend tests, build and five browser
checks pass; this adds no financial authorization, RPC read or chain acceptance.


Usability phase 3 adds field-specific local preview errors, linked descriptions,
summary navigation and document-order focus. Correction/reset retain recoverable
inputs. Original domain and RPC checks remain. 49 frontend tests, production build
and 11 desktop/mobile browser checks pass; no AT-wide conformance or financial
acceptance is claimed. Source/evidence remain in the usability review above.


Usability phase 4 adds market-specific position-source cards, unknown holdings,
local-only draft counts and links to markets/filtered draft history. The AMM
reader shortcut only opens and focuses its public input. Reviewed Book/Curve/NFT
on-chain position feeds remain missing; no verified holdings are invented.
Final acceptance: 50 frontend tests, build, 38 client/gateway regressions and 31
browser checks across all four phases pass. Mobile layouts, field focus, reload,
cross-tab editing conflicts and existing brand/source pins are covered. No Node,
SDK, old-contract, financial operation, RPC read or performance claim was added.
The RPC heartbeat remains deleted; financial acceptance stays pending.


## 2026-10-27 three-market observation integration and wallet audit

[Review and evidence](../../executor/verification/2026-10-27-market-readers-live-v1/README.md).
The formal loopback gateway and shared browser client now expose pinned QA
Orderbook/Curve/NFT account observations. Historical build and later registration
evidence freeze registry identity; original BOUND flags are preserved. Each read
rechecks network, metadata, code/layout/function roots and vault mapping at one
checkpoint. Browser validation preserves exact U124 values, bounded NFT scope and
pending-output arithmetic. Schema-2 workflow fresh checks explicitly bind lifecycle
fields as well as existing roots. UI form fixtures and actual observations remain
separate; no write route, contract update or SDK change was added.

44 client/gateway regressions, 50 frontend tests and the production build pass.
Eight browser checks cover local validation, all three real RPC outage paths,
Assets shortcuts and mobile layout; no mock network or storage injection was used.
Real reads returned HTTP 503; no healthy-chain observation, UPS, fill, fee, wallet
claim/refund or performance acceptance is claimed. The RPC heartbeat stays deleted.

Wallet main and existing security candidate sources were inspected without edits.
Internal end-cap prepare/submit APIs exist, while trace-step can auto-submit. The
dApp-facing approved exact staged provider, source/key/circuit attestation,
independent verifier integration and durable original-request recovery are still
implementation work. Do not characterize this as an inherent SDK impossibility
or use direct signing as a fallback. New-market financial planners and all live
write acceptance remain open alongside RPC/runtime/upgrade evidence dependencies.
The original financial plan was neither restarted nor cancelled by these UI reads.


## 2026-10-27 three-market action plans and ordinary Executor workflow

[Review and evidence](../../executor/verification/2026-10-27-market-actions-v1/README.md).
The formal gateway now offers a durable, unsigned three-market planning route and
shared browser reconstruction. Book whole-order limits, Curve progressive limit
orders, exact NFT listing/buying, consent/cancel/close/release/recovery and ordinary
claim plans use pinned real ABIs and common-checkpoint state. NFT buying verifies
the actual seller NFT packet/FIFO sequence and fee escrow. U124/cursor and native
fee limits fail closed. No base market, SDK or Node change was required.

A separate three-market Executor adapter reuses the financial journal/worker with
full stack, native-verifier, session/sig_hash, identity, state and fee gates.
Synthetic lost-ACK/restart/repeated-task and same-machine competition checks pass;
the public HTTP service does not instantiate the financial adapter. Browser
planners remain unsigned and show no invented result when RPC fails.

Final checks: 56 client/gateway tests, 50 frontend tests, production build and ten
browser checks pass. An intermediate seller-escrow variable-shadowing regression
failed and was fixed; its original log is retained. Actual Book/Curve planning
requests returned HTTP 503; all three independent endpoint diagnostics did too.
No proof, financial broadcast, fill, fee, wallet claim/refund or performance result
was produced. Browser secure staged provider implementation, selected SDK/key
attestation, real bytecode/full UPS and isolated write acceptance remain open.
The heartbeat stays deleted; the original financial plan was not resumed.

## 2026-10-27 ordinary wallet prepare-only and native UPS coverage

[Review and public evidence](../../executor/verification/2026-10-27-safe-wallet-native-v1/README.md).
Added explicit proof-only job execution, pinned SDK-shaped trace validation,
public capsule projection and a durable account/network/chain reservation with
one-shot/original-identity recovery rules. The existing wallet candidate core
uses the same wallet FIFO and durable store for internal preparation. It gates
legacy writes/previews and refuses unresolved legacy queue history. No new web
write permission, financial gateway or SDK attestation is enabled.

Four-market ordinary funding/order and claim fixtures exercise real bytecode,
standard signatures, complete UPSs, fees/endpoints, two nonzero FT limbs and NFT
FIFO identity at synthetic authenticated checkpoints. Setup/Outboxes are VM-only;
this does not close live settlement, refunds or browser wallet acceptance. Saved
requests also undergo the pinned independent full endcap/core verifier. Actual
browser call/session attestation is a separate missing native adapter.

The unchanged wallet baseline reproduces the same 10 existing private-FT SDK
TypeScript errors and two SDK package-path-blocked queue suites. Nine focused
wallet checks and 68 application checks pass; neither makes the wallet release
build accepted. Dependency migration remains separate. Configured RPC probes
still return 503, with zero financial broadcasts. The heartbeat stays deleted.

## 2026-10-27 RPC recovered; prior deployment identity unavailable

[Readonly recovery evidence and execution order](../../executor/verification/2026-10-27-rpc-recovery-v1/README.md).
All three configured endpoints now return 200, checkpoint 2746 at first probe.
However, `next_contract_id=6`; the previous QA FT/AMM/Book/Curve/NFT market IDs
return explicit not-found errors at checkpoint 2752. Native contract 0 code and
function roots also differ from the reviewed registry. Treat this as a different
observed deployment state, consistent with reset/replacement, until chain and
protocol compatibility are established. No old request was replayed and no
financial operation, deployment or proof job was started.

Proceed with fresh chain-scoped preflight and a new isolated deployment manifest;
then rebind real UI reads and close the native wallet-write/approval/SDK release
gates before enabling finance. Offline contract optimization can proceed alongside
UI implementation, but accepted UI instances and performance samples remain
isolated from candidate deployment/build/proof work. No Node or SDK change; current
branches retained. Deterministic ordering and existing market semantics remain.

## 2026-10-27 fresh-chain protocol rejection and real readonly UI

[Preflight, UI and public evidence](../../executor/verification/2026-10-27-new-chain-preflight-ui-v1/README.md).
The unchanged selected SDK was rechecked against 1,466 pinned source files.
Captured new-chain native bytecode decodes and recomputes to the observed code
root, but its numeric deployer fails the SDK's exact hash-owner schema. The new
native transfer/claim/burn ABI also lacks the SDK's automatic fee-burn method
`2923993647`. The offline native CLI records and rejects these concrete protocol
differences; it does not coerce owners or bypass fees. Endcap/key, fresh full UPS
and upgrade authorization remain unverified. Isolation deployment stopped before
identity creation: zero registrations, deployments, faucets, financial UPSs,
fees or asset movements. The symbolic chain-scoped draft is not a live registry.

The existing gateway/UI now display actual readonly network checkpoints and
native/chain identity, with explicit incompatibility, expiry and outage states.
Matching roots alone cannot accept an unpinned checkpoint-one chain. Simultaneous
diagnostic reads can coalesce; completed observations are discarded. Old market
IDs are not probed through this route after native incompatibility. Trading,
wallet write and financial adapter gates remain closed. Existing demo records
and unsigned planners remain separate. One real refresh encountered an outage;
RPC availability is intermittent, not continuously healthy.

74 application checks, 50 frontend tests, production build and three native CLI
unit tests pass. Actual browser refresh, expiry and Liquidity keyboard navigation
were observed with no captured application errors in that window. Screenshots
timed out and runtime viewport behavior was unstable; complete desktop/mobile
visual acceptance is not claimed. Browser tooling was not upgraded. SDK release
and wallet call/session attestation/build blockers remain open. The required
external protocol/configuration/authorization deliveries are itemized in the
review. No Node/SDK change, old-contract probe or restarted heartbeat.

## 2026-10-27 optional immutable deployment resource experiment

[Implementation, comparison and complete canonical-proof evidence](../../executor/verification/2026-10-27-initial-layout-cache-v1/README.md).
An opt-in artifact-template cache avoids rebuilding identical code/whitelist
resources for each new deployer while rebinding the actual owner and preserving
all canonical layout/code/owner endpoint checks. It caches no transaction state,
witness, nonce, signature or UPS. Default owner-v1 is retained; unknown profiles
are rejected. Base market bytecode, pricing and matching semantics are unchanged.

On one real U124 artifact, two sequential owners, the same fixed SDK/machine and
two threads, second-owner preparation measured 22.565 seconds baseline versus
0.013 seconds candidate. First-owner preparation measured 118.987 versus 116.207
seconds. Whole child duration was 168.201 versus 142.559 seconds, but maximum RSS
rose from 2,721,693,696 to 3,430,858,752 bytes and peak physical footprint also
rose slightly. One sample, uncontrolled host load/order and offline deployment
preparation do not establish overall settlement acceleration or memory reduction.
The candidate stays opt-in, and no full UPS/network TPS claim is made.

Two complete initial-layout requests per measured variant verify and reject
owner/code/count/root/proof mutations. A later final-source test independently
reverifies two preserved requests under both profiles, rejecting wrong owners
and unknown profiles. Earlier attempts, original outputs, complete requests,
build/run logs, exact source snapshots and binary hashes are retained. No live
financial request was generated or submitted by this experiment.

## 2026-10-27 selected mainnet-beta SDK: native compatibility confirmed

[Selected source, actual checks and migration boundary](../../executor/verification/2026-10-27-sdk-mainnet-beta-v1/README.md).
The user clarified that the SDK branch is `psy-sdk/mainnet-beta`, not the Node
deployment branch `release/testnet-stable`. Pin SDK `c92880c8` and its consumed
client `b280d714`, retaining the existing upstream backend patch and each exact
Genesis gitlink. A fresh reconstruction verifies 2,756 upstream files with zero
source patches. Do not misapply the previous old-snapshot incompatibility result
to this SDK: compiled testnet native checks now pass, including numeric deployer,
new transfer/claim/burn IDs and exact bytecode/code-root equality. Four mutated
captures are rejected; three native unit tests and three materializer tests pass.

Actual circuit metadata is observed through the SDK's JSON-string envelope; the
decoded Endcap verifier config equals its selected source blob. This does not
attest runtime keys or prove full UPS acceptance. No metadata promotion occurred.

The isolated existing market-library check reaches 12 application API/type
errors after an old Go-path issue is resolved with the installed Go 1.26.0.
Custom SD-key/session/witness interfaces, compact logical versus active actual
slots, wallet insert methods and numeric owner binding require a real port and
complete proofs. No unsafe alias, hash-to-user-ID conversion or deleted check
was used to force compilation. Old evidence, root market inputs, registry and
UI financial gates remain unchanged while this candidate integration is open.
This is the selected SDK compatibility milestone, not completed deployment,
browser wallet adoption, market settlement, performance or production acceptance.
Zero financial operations; no Node/SDK source edits or resumed heartbeat.


## Selected SDK migration — October 27

The selected SDK is mainnet-beta at c92880c8b6e2c8d392f19368bc8801a2584fd427,
not the Node deployment branch. Application-owned stateless SD-key circuits
retain complete stack/session binding through unchanged SDK proof APIs.
Eight market and eight ordinary-wallet full UPSs passed offline, together
with executable bytecode and adversarial authorization checks. The unchanged
browser SDK distribution and wallet extension built.
[Migration report](MAINNET_BETA_MARKET_MIGRATION_20261027.md) owns source pins,
retained failures, unsupported APIs and remaining live gates. No Node source
or old contract was modified. These migration/security results do not close
performance, real UI or production acceptance items by implication.


## 2026-10-27 new-chain reader and quarantine follow-up

See [selected-SDK migration and live boundary](MAINNET_BETA_MARKET_MIGRATION_20261027.md#new-chain-deployments-and-read-only-ui-follow-up). New QA assets 6/7/8, AMM 9, Book 10 and NFT Market 12 have original deployment/key/checkpoint evidence. Curve 11 is quarantined before funding because of an unverified graduation recipient inherited from an offline fixture. A corrected, undeployed candidate has an offline initial-layout proof; no old contract update was performed. Current UI reader pins use the new chain and wallet planning rejects quarantine. This does not enable UI financial writes.

Focused regressions and selected-SDK wallet build passed; the browser journey verified blocked inactive-account and quarantined-Curve states, with the earlier capacity failure retained. At checkpoint 4902 issuer test PSY remains zero, its user leaf is empty, and the original faucet request remains unknown. There are no new real fills, ordinary claims, cold/warm comparisons or throughput results. Previous-chain evidence is retained as historical, not reused as current-chain acceptance. Full candidate/live UPSs, exact wallet transport, actual funding/settlement/recovery and service/upgrade trust evidence remain open.

### 2026-10-27 corrected Curve proof closure

Exact recipient-corrected Curve bytecode passed two full trading UPSs and a
full graduation UPS. The public requests, code/layout and original failed runs
are archived in
[the proof manifest](../../executor/verification/2026-10-27-mainnet-beta-curve-ups-v1/manifest.json).
This is synthetic authenticated-state evidence (market 1000/vault 100), not
live key or browser acceptance. Curve 11 remains quarantined. Replacement
initial deployment, new key registration, funding and real settlement remain
separate gates. No Node, SDK source or old contract was changed.
