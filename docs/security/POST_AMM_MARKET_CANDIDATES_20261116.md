# Isolated post-AMM market candidates — 16 November 2026

These changes were prepared in parallel while the root-owned AMM network journey ran. They do not authorize additional instances, budgets, proofs or financial operations. Current stag confirmation is blocked; the issuer's unknown nonce4 request must reconcile before reusing that signer.

## Orderbook

[Pure journey plan](../../executor/acceptance/coreBookJourneyPlan.mjs) and [host regressions](../../executor/acceptance/coreBookJourneyPlan.test.mjs) reuse the existing selected-order client, bound dependency policy and formal reader/journal. The plan requires two trading parties and a distinct sponsor account AND key, 18-decimal QA assets, one-unit whole-order matching, both output claims, unmatched carry, cancellation and full refund claims.

It declares **22 UPSs:15 ordinary +7 formal** as requirements, not spending authorization. Capacity remains four members/two matched pairs; the proposed workload is two members/one match. Every stage depends on preceding confirmation. Selected-set price/time priority is not whole-market completeness or censorship resistance. A new sponsor identity, market/key/vault and separately reviewed budget are required. Host6/6 pass and source peer review found no blocking semantic issue. No actual Book bytecode/complete UPS/network acceptance ran in this round.

## Finite Bonding Curve fixtures

[Checked helper](../../amm/u124/vm-tests/tests/support/finite_curve_fixture.rs) and [Rust test entry](../../amm/u124/vm-tests/tests/finite_curve_fixture.rs) add finite configuration/identity and budget validation without changing runtime pricing or existing fixtures. Example cap10 +liquidity10 with unit1e18 needs **20 inventory units +one activation atom** and **10.0045 quote units** for full cumulative purchases; these fit a100-unit per-asset envelope.

Checked U124/u128 arithmetic covers reverse sells, limit change and fixed-target graduation. Five Rust tests were added but **not compiled or executed**. An independent arithmetic calculation and source peer review are not VM/bytecode/UPS evidence. Existing generic proof fixtures still hardcode oversized inventory and need explicit finite-configuration wiring before any fresh Curve deployment. No old Curve11 or other contract is updated.

## NFT identity-buy candidate

[Opt-in source candidate](../../nft-marketplace/u124/identity-buy-candidate.mjs) and [candidate boundaries](../../nft-marketplace/u124/IDENTITY_BUY_CANDIDATE.md) replace unbound open_buy with a versioned identity-bound call. The intended same-UPS constraints cover collection, signing-buyer recipient, seller/listing nonce, price, deadline, full token Hash4 and metadata Hash4 before writes. Other methods/layout/priority/sale/refund source is preserved.

Seventeen calldata words fit the frozen SDK's source-level128-word limit. That is not successful compilation or proof acceptance. Full canonical Goldilocks Hash words require a dedicated reviewed encoder; the existing generic call()62-bit cap must not be reused unchanged. Peer review found a sparse-array validation defect. The helper now captures own data-descriptor words once and builds calldata from clean snapshots, rejecting holes/inherited slots/accessors and ignoring malicious iterators. Root reran nine NFT host tests, including scalar/Hash snapshots and Proxy/accessor rejection without invoking traps; no bytecode or proof claim follows. The current helper is Node-only; browser integration needs its own reviewed trusted-data boundary.

Existing factory/client rejects the new ABI, so NFT purchase writes remain closed. Required follow-up: actual compiler/selector/foreign-read audit, new versioned factory/client/key/resources, adversarial full-field bytecode tests, complete UPS suite and separately budgeted real sale/refund/claim acceptance.

No UI expansion, dependency switch, Node edit, production market mechanism change, old-contract update or financial execution is included in these candidates. Source/host results are reported separately from actual network acceptance.

## Qwen source-only continuation — 17 November 2026

An external `qwen4-max` task via the existing Qwen API and Aider completed in419.289seconds against an isolated public-source copy of9a38a40. Its allowlist contained only `executor/acceptance/coreBookJourneyPlan.mjs` and its test. There were no unexpected edits or financial operations. The harness ran the original candidate's nine host tests successfully.

Root review accepted two candidate corrections: detach selected/retained owner arrays across stages, and use BigInt cancel directions consistently with amount/call fields. Qwen's third finding was inaccurate: the existing `user()`/`integer()` path already rejects non-BigInt market IDs. The reviewed copy removes that redundant guard while retaining rejection coverage. Against the original source, the two new defect regressions fail and the existing type-rejection regression passes; the reviewed copy passes all nine host tests.

Status: **reviewed isolated candidate only; not merged, committed, pushed, deployed or network-accepted**. Main source remains unchanged. Full bytecode, SD-key, complete UPS, network trade, refunds and ordinary-wallet claims remain unverified for this candidate. The issuer's unknown nonce4 broadcast remains held; no replay, replacement, signing, faucet, proving or financial execution occurred. Aider emitted a shutdown summarizer warning after applying edits; its main task and the independent host test command exited0. This warning is retained in the raw external-task log, not treated as proof of continued autonomous operation.

[Compact reviewed evidence](evidence/QWEN_BOOK_SOURCE_REVIEW_20261117_v1.json) records the accepted/rejected findings, test results and reviewed file hashes. Raw Qwen chat/logs and reviewed source remain outside Git in the uniquely named `psy-qwen-market-continuation-20261117-v1` task directory. This was one completed bounded task, not an ongoing four-market execution loop.

## Root-reviewed Book integration — 17 November 2026

Following the isolated-candidate review recorded above, root manually integrated the two accepted changes into the current source branch. The inaccurate market-ID finding was excluded; existing rejection remains covered. No Qwen artifact was overwritten. The focused journey, client and builder host suites pass21/21 (0failed), including both new regressions that fail on the original source. Owner-array independence prevents one stage's review metadata from mutating another stage; BigInt side metadata now matches ordinary call amounts and direction comparisons. This does not make returned plan objects globally immutable or replace submission-time reconstruction.

[Integration evidence](evidence/QWEN_BOOK_SOURCE_INTEGRATION_20261117_v1.json) records the exact test command, counts and source digests. These are source/host corrections only: no Book bytecode, SD-key, full UPS, deployment, network trade, refund or ordinary-wallet claim is accepted here. Financial execution remains held; no broadcast, replay, replacement or funding action occurred. The earlier “isolated candidate only” paragraph records the preceding review state and is retained as history.

## Finite Curve consumer and budget correction — 17 November 2026

The explicit opt-in `World::new_finite_curve` now consumes reviewed finite terms before synthetic funding, instead of using the generic oversized allocation path. It derives sale/liquidity inventory, full-cap quote backing and separate activation atoms; the quote-side activation atom was missing from the previous host budget check and is now required with checked U124 addition. Existing constructors retain their original defaults; no production pricing or live funding changed.

Root independently compiled and ran six arithmetic/validation tests offline with a separate cached `anyhow`/`serde_json`-only harness:6/6pass. The new `support/finite_curve_world.rs` is a real constructor consumer with an explicitly ignored VM test for initialization, purchase, unclaimed seed non-reuse, fixed-target graduation and ordinary claims. Both wiring files passed parser checks only; they are **not type-checked, VM-executed or complete-UPS-verified**. Existing full-UPS fixtures remain unchanged. No SDK/Node edit, native proof, RPC, deployment or financial execution occurred. [Compact source/host evidence](evidence/CODEX_FINITE_CURVE_SOURCE_20261117_v1.json) records file digests and limits; the small raw host log remains outside Git.

## AMM saved-plan recovery gates — 17 November 2026

Both historical ordinary-stage runners now compare saved unsigned calls, actors, parameters, observations and safety flags with the canonical stage plan after checking resource digests, before ordinary wallet use. Existing attempts or public inputs require their original saved plan; missing plans are not reconstructed. Compatible attempts are reconciled, never automatically replaced; changed dynamic deadlines or observations stop for review. No saved plan/request is overwritten.

Behavioral host regressions execute both production stage closures with fake boundaries and test rejection before wallet use, compatible original-attempt reconciliation and missing-plan refusal. Coherent fee-ceiling/unknown-receipt tests retain the original hold. The AMM suites pass18/18; root's combined AMM/NFT host run passes45/45. Eager formal warm was removed only after checking that formal prove() lazily acquires its resident and retains binding, pin, input and driver checks. Its performance impact is unmeasured.

These runners retain historical market51/issuer971904/trader668800 identities. This is not current-chain acceptance, fee-exhaustion liveness, a complete UPS test or a release of current issuer1975680 nonce4. No financial operation ran. [Compact evidence](evidence/CODEX_AMM_SAVED_PLAN_GATES_20261117_v1.json).

## NFT identity client preparation boundary — 17 November 2026

New opt-in `nft-marketplace/u124/identityClientV1.mjs` prepares an immutable unsigned four-call stack: collection prepare, identity-bound buy, Native fee funding and FT payment. It pins supplied policy/component/full-ABI data, generated source, frozen release, dependencies, buyer and approved17-word identity fields. Full Goldilocks hash words use the dedicated path; the generic62-bit call encoder is unchanged. Pins prove equality only, not review provenance, dependency authentication or authority.

The Node-only input snapshot rejects executable objects, mutations and malformed arrays. Root review identified excessive allocation/recursion risk; explicit limits now reject arrays over4,096, own-key sets over8,192, depth over64 and aggregate traversal over100,000 before dependent copying. Getter/Proxy no-execution regressions remain. Candidate+client tests pass27/27; root's combined AMM/NFT run passes45/45. [Compact evidence](evidence/CODEX_NFT_IDENTITY_CLIENT_20261117_v1.json).

Purchase writes remain unconditionally closed. No production import was added. Actual selector/bytecode/foreign reads, new SD-key, authenticated resources, wallet/session/fee bindings, complete UPSs, browser boundary and separately authorized network acceptance remain pending; synthetic fixtures do not satisfy those gates. No Node/SDK change, RPC, proving, deployment or financial action occurred.

## Qwen candidates and independent review gate — 18 November 2026

Root assembled a frozen combined candidate against code base `aac8a4a` and independently reran107 host tests:107passed,0failed (AMM42,Curve21,NFT44). These are candidate results; **candidate source is not integrated or committed**. The branch receives this status record only.

AMM fixes cover the actual lossless save/read report contract, exact receipt/output/snapshot consistency, missing original-plan refusal, canonical evidence paths and original resource-pin rechecks across async work. Behavioral VM fixtures were corrected to model persistence and successful confirmation without weakening assertions. Curve fixes cover required method metadata/unique canonical IDs and the approved exact three-call funding stack, retaining valid account/contract numeric overlap and the ordinary wallet's Native name resolution. NFT inspection now accepts real SDK ABI structure and large logical storage declarations while keeping bounded AST work, context-specific width caches and the frozen128-word method-input cap; its selector test doubles remain synthetic and all purchase-write/proof flags remain false.

**Grok review remains pending:** the configured Cursor Agent entry reports authentication required; the user is restoring local login. No Grok model was selected or claimed to have reviewed these files. Frozen source, diffs and raw root/Qwen logs are prepared outside Git in `psy-qwen-grok-review-20261118-v1`; [compact status and candidate digests](evidence/QWEN_GROK_REVIEW_GATE_20261118_v1.json) preserve the review boundary. Passing local tests do not replace independent review, bytecode/SD-key/full UPS or real-network acceptance. Only independently reviewed passing source patches may be integrated next.

No Node or SDK changes, proof generation, signing, replay, replacement, deployment, funding or financial execution occurred. Issuer1975680 nonce4 remains held. Previous failed attempts and original raw evidence remain unchanged; no secrets or raw proof/chat archives are committed.


## Qwen continuation corrections and combined host validation — 18 November 2026

Qwen completed the selected-order reader, planner regressions and opt-in NFT
identity-policy adapter in isolated copies. Root returned concrete failures for
bounded repairs: artifact-dependent AMM tests were separated from self-contained
checkpoint tests without removing their fresh-artifact guard; NFT planner rank
expectations were corrected to the existing unused sentinel; NFT policy fixtures
were corrected for three-word U124 transfer inputs, explicit state-tree height
and detached component-only substitutions. Earlier failure logs remain intact.

The reader candidate binds the approval window to the scan's captured checkpoint,
requires the witness mode to agree with the task kind, rejects noncanonical or
out-of-domain windows and validates lossless uint32 expiry before conversion and
clamping. The planner production module is unchanged: price/time and unique-sale
semantics remain intact. NFT preparation retains explicit false trust, proof and
write flags; comparison pins establish equality only. Re-pinning two consistently
changed inputs is not authentication and is now explicitly tested as such.

Root assembled all twelve pending source/test files with the preceding AMM,
Curve and ABI candidates and independently ran fifteen host test files together:
**183 passed, zero failed/cancelled/skipped**. The tested sources remained unchanged
during the run, and the frozen SDK manifest digest is unchanged. This is source,
client and mocked-I/O coverage, not bytecode, SD-key, complete UPS, deployment,
real trade, ordinary-wallet claim, browser-payment or performance acceptance.
`executor/coreAmm.test.mjs` still requires actual fresh compiled artifacts through
`CORE_AMM_BUILD`; that test remains unverified, not silently skipped or reported
as passing.

**No candidate source is integrated.** Both the user-local Cursor Agent and the
Cursor bundled worker entry still report authentication required. No Grok model
was selected and no independent Grok review is claimed. The combined frozen
candidate, hashes, exact host command, full diff and read-only review task are
prepared outside Git in `psy-qwen-grok-review-20261118-v2`. Only this compact status
and [public evidence](evidence/QWEN_MARKET_CONTINUATION_REVIEW_20261118_v2.json) enter
the current branch. Actual independent review and any requested Qwen corrections
must complete before source integration.

No Node or SDK change, proof generation, signing, RPC/faucet, broadcast, replacement,
deployment or financial operation occurred. Issuer1975680 nonce4 remains held;
original evidence, other processes and wallet histories remain untouched. Raw
model chats, detailed logs and source snapshots remain outside Git.


## Root-reviewed Qwen NFT source integration — 18 November 2026

The user explicitly replaced the unavailable Grok gate with Qwen corrections
and root review. This supersedes the earlier pending-Grok requirement for these
source candidates; it does not establish independent Grok or production approval.
Wide Qwen reviews first timed out (AMM/Curve) or returned no final text (NFT).
Those failures were retained, not counted as reviews. A bounded, focused Qwen
static review then identified concrete issues; root triaged its claims before
requesting repairs.

The opt-in [ABI gate](../../nft-marketplace/u124/identityAbiGateV1.mjs) now checks
each known-width struct field even after an opaque map makes the overall width
unknown. Safe positive declared field widths are required. Physical map layout
remains deliberately opaque; the inaccurate claim that null was cached as an
arbitrary numeric width was rejected. The [policy adapter](../../nft-marketplace/u124/identityPolicyV1.mjs)
reuses the unsigned client's exact frozen pending-gate list, including the browser
boundary. Digest equality is not authentication. No production import or purchase
write authority is added.

Qwen implemented the bounded corrections. A new focused Qwen static review
(thinking disabled, exact `qwen4-max`, no tools) reports PASS for the supplied
source corrections; root also inspected source and relevant dependencies.
In the actual work branch, the four focused host files pass58/58, zero failures
or skips. The two new targeted regressions both fail against the previous
production modules, confirming they detect the reported defects. All older
failure logs, reviewed snapshots and model outputs remain outside Git.

Only the four reviewed NFT source/test files are integrated at this milestone.
AMM, Curve and planner corrections remain isolated while their checks run.
[Compact integration evidence](evidence/QWEN_NFT_SOURCE_INTEGRATION_20261118_v3.json)
records source/report/log hashes and the exact host command. No actual compiler,
VM, SD-key, full UPS, browser payment, deployment, network trade/refund or ordinary
claim is accepted. Every trust/proof/write flag remains false; no Node/SDK edit,
RPC, signing, proof generation or financial operation occurred. The unknown
issuer1975680 nonce4 hold remains intact. This is source/host integration only.


## Root-reviewed Curve and selected planner integration — 18 November 2026

Qwen's bounded corrections now make the [Curve build acceptance](../../bondingcurve/u124/core-build.mjs)
and [ordinary client](../../bondingcurve/u124/coreClient.mjs) apply the same unique,
canonical nonzero uint32 method-selector rule to market and token ABIs. The public
exact-stack checker rechecks approved scalar/amount bounds on direct invocation;
its comments retain the separate policy-authentication boundary. The exact three
calls, full U124 limbs, fixed recipients, Native name-only lookup and legitimate
cross-namespace numeric overlap remain intact.

The [pure planner](../../batching/v2/planner.mjs) rejects unsupported markets and
duplicate active owners. Root review found that Number/BigInt aliases bypassed
a naive Set check; a further Qwen correction requires primitive BigInt positive
24-bit active identities before uniqueness/selection. Zero padding and inert
consumed rows retain their prior behaviour. Existing four-member capacity,
whole-order Book price/time, NFT unique-sale/buyer priority, deterministic AMM/
Curve progression and all refund ownership remain unchanged. This quote/selection
aid still does not replace contract/SD-key validation or promise arbitrary raw
frame validation, global completeness or new financial authority.

The initial local Curve review was INCONCLUSIVE only on missing import context.
Root supplied exact encoding/config/release/policy source for follow-up. Qwen
confirmed the Curve guards but incorrectly alleged a boxed-BigInt owner bypass.
Root executed the actual planner: boxed BigInt, Number and string owners all
reject before selection. `typeof Object(7n)` is `object` and strict comparison to
`7n` is false. Qwen explicitly retracted this finding and returned PASS for the
local source guard changes. No coercion or weakening was accepted. Both the
incorrect and corrected reports are retained outside Git.

After the six reviewed source/test files were copied into the actual work branch,
12 local host files pass155/155, no failures or skips, covering Curve, planner,
Book, NFT and AMM journey/recovery helpers. Against the preceding modules, eight
of nine targeted tests fail as expected; the sell-overflow guard already passed
and is not advertised as a new repair. [Compact source integration evidence](evidence/QWEN_CURVE_PLANNER_INTEGRATION_20261118_v3.json)
records exact commands, source/report/log hashes, review dispositions and limits.
No native proof, actual compiler, full UPS, live settlement, refund, ordinary
wallet claim or performance acceptance is asserted. SDK/Node and financial state
are unchanged; issuer1975680 nonce4 remains held. The separate AMM cached-completion
audit candidate is not integrated at this milestone.


## Root-reviewed AMM audit and reader integration — 18 November 2026

The remaining [fresh AMM journey runner](../../executor/acceptance/freshCoreAmmLive.mjs)
and [selected-core reader](../../executor/coreAmmReader.mjs) candidates are now
integrated. Before accepting a cached completion, the runner re-reads all four
saved cohort snapshots and their original binding digests, links post-batch
snapshots to their exact preceding formal result, and compares report initial/
final data with the saved observations. The same pure initial/LP/swap/final audit
runs on live observations and saved replay data: exact cohort and frozen outbox
asset columns, reserve/share/refund/supply/Native-fee conservation, chronological
checkpoints and recorded stage markers. Missing or changed audit data throws
before budget, adapter, signer, prover or financial work; nothing is reconstructed.

Root review prevented a newly introduced marker error from reaching the branch.
Actual generator/controller code keeps activation `batch_ready=1` and leaves
`batch_phase=3` after finish. The audit now requires initial ready0/phase0/id0,
then ready1/phase3/id1,2,3; tests no longer mirror an invented phase0 after finish.
Frozen asset IDs accept safe Numbers or primitive BigInts after the real lossless
round trip, normalize to one identity before distinctness/key checks, and reject
strings, objects, unsafe values and mixed representations of one asset. VM guard,
owned-path and serialization fixture failures were fixed without relaxing runtime
gates. Original failed runs remain outside Git.

The reader pins its approved window to the scan-captured checkpoint, checks
kind/witness-mode agreement, canonical bounded uint32 windows and lossless frozen
expiry before conversion/clamping. Root's direct before/after probe demonstrates
five malformed/out-of-domain windows previously accepted now refuse, while the
canonical window remains accepted. No global-account scan, qualified randomness,
new capacity, pricing/matching change or transaction authority was introduced.

Qwen's new focused static review reports PASS for this source/host scope, and root
inspected the source, relevant callers and actual generator/controller. After the
five source/test files were copied into the actual branch, the final15-file host
suite passes **200/200**, zero failures/cancellations/skips. This is the combined
AMM/Curve/Book/NFT/client/planner/reader source and mocked-I/O result, **not** a
complete UPS, actual compiler, browser payment, network trade, refund, ordinary
claim, throughput or production conclusion. [Compact final evidence](evidence/QWEN_AMM_SOURCE_INTEGRATION_20261118_v3.json)
records exact command, source/report/log hashes, failed attempts and explicit limits.

Cached observations and local digests are not independent slot-Merkle/finality
authentication. Unsaved terminal consumed/order-kind slots are not reverified by
the cache. `executor/coreAmm.test.mjs` still requires real fresh `CORE_AMM_BUILD`
artifacts; its guard was retained and it is not counted as passed. New actual
bytecode, dedicated keys, full UPS/session proofs and separately authorized live
acceptance remain required. NFT writes remain closed. No Node/SDK edit, proof,
RPC/faucet, signing, deployment, replay, replacement or financial operation ran;
issuer1975680 nonce4 remains held. Original raw evidence is preserved outside Git,
and no secret, chat archive or raw proof artifact is committed.

Current source integration milestones: NFT opt-in shape/policy gate `e21dada`;
Curve/build and selected planner guards `01cd9b9`; this section records the final
AMM/reader milestone. Earlier pending-Grok and non-integration statements are
retained as chronological history, superseded only by these explicit source-only
integration records under the user's revised review instruction.
