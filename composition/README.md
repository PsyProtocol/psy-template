# Two-hop AMM route

`route.mjs` plans one advisory A→B→C path across two existing AMM pools. That
planner does not deploy or submit. The independent financial controller and
acceptance entry points below are separate; none changes Node.

`planExactRoute` quotes each hop with `swapQuote`, the same 0.30% floor the
U124 AMM contract checks. The second hop's input is the first hop's output.
The plan is rejected when that final floor is below the caller's minimum, the
intermediate asset does not match, a market is reused, or a hop floors to zero.

The plan is not atomic. Each hop is an existing AMM order, settlement and
claim. The intermediate asset is claimed before the next order is opened.
Orderbook, curve and NFT are not components of this path, and `invoke_sync`
is not used.

`liveTwoHop.mjs` is now a **read-only historical report reader**. Its former
financial runner bypassed the exact deployment-occurrence gate and is retired.
The original 2026-10-22 run and code at `93ad36f` remain historical evidence,
not dedicated composition authorization or current candidate acceptance.

`planAmmThenBook` adds one resting orderbook cross after that AMM floor. The
intermediate is sold as one order. The fill is the whole crossing bid, because
the orderbook checks the deposited amount against the signed order. There is
no partial fill and no `invoke_sync`. Curve and NFT are still outside this
path. This book hop has not been submitted.

## Strict intent candidate

`intent.mjs` adds a canonical domain/SDK/registry-bound intent, exact U124 units
and a two-AMM planner. Registry commitments include each market, vault, key,
code/layout/function roots, complete dependency metadata and asset decimals.
The v1 receiver is the owner; unsupported NFT/delegation scopes fail closed.
All returned plans explicitly remain **quote-only**, with unauthenticated source
snapshots. A digest is not a signature. The separately proved funded controller/key below
does not automatically authorize these advisory plans; the per-instance financial adapter and new isolated acceptance remain required. See
[CAPABILITIES.md](CAPABILITIES.md) for exact atomicity and compensation limits.

`workflow.mjs` tracks the staged request identities, confirmations and recovery
asset class. `store.mjs` persists append-only, hash-linked snapshots with revision
checks and the Executor's same-host lock. Unknown broadcasts prevent another
prepared task; a confirmed Outbox must be claimed before the next stage. An
observed actual fee breach is retained as `review-required`, not hidden by a
failed local assertion. This is an observation/control scaffold: receipt facts
still need a full-proof/historical/index verifier, and is not used as the financial driver. Local revision tests do not prove multi-host exclusion or
on-chain authorization. The initial store is one intent per dedicated case;
Actual new-instance acceptance remains an uncompleted gate.

Recovery now recomputes the complete advisory plan from its embedded registry
and snapshots, checking that registry against the user's committed hash. Matching
intent IDs and a replacement local plan digest cannot substitute a vault, market,
amount or receiver. Each new stage's source checkpoint must also include all
previous confirmed common checkpoints. Old plans lacking this provenance fail
closed; no persisted original evidence is rewritten. These consistency checks
still do not authenticate supplied snapshots or authorize transfers.

`receipt.mjs` now observes an **already recorded exact broadcast**. It pins the
existing offline verifier, SDK and RPC configuration, verifies the preserved
full UPS, binds request/proof hashes, caller/key, nonce and endpoints, and matches
historical leaf/indexed occurrence and receipt stats/fees before recording common-
checkpoint progress. Unknown inclusion retains the original pending identity;
invalid proof stops before network reads. It never proves, sends or substitutes
a transaction. Historical/index inclusion remains an RPC observation, not an
authenticated finality proof or runtime attestation. It does not certify actual
calls against the business route: the separate funded controller/key must be
connected through the financial adapter before delegated execution. The live read-only smoke uses a synthetic workflow
around an existing QA ordinary request, **not composition economic acceptance**.

## Funded controller / dedicated key candidate

See `CAPABILITIES.md` → Funded candidate checkpoint for current scope.
`contract/funds.mjs` is distinct from the **never-fund** reservation profile.
`funding.mjs` creates an atomic owner request/funding/bind sequence, while
`contract/policy.mjs` binds 18 controller operation templates. Rust
`tests/composition_funds.rs` and `tests/composition_key.rs` prove the current key
and linked controller UPSs. The separate financial adapter/CLI is now implemented below; it is not yet network-accepted.
Evidence is in `executor/verification/2026-10-23-funded-composition-v1/`;
reproduction and remaining gates are in that directory's `README.md`.


## Independent financial route (candidate)

`adapter.mjs`, `execution.mjs`, `selection.mjs` and `run.mjs` connect the funded
controller to the normal Executor journal. They do not wrap the observation-only
workflow. `client.mjs` prepares ordinary-owner atomic funding and exact terminal
FT/native claims without signing or sending. Intents/plans use `codec.mjs` typed
BigInt documents; raw proof/request JSON still uses the protocol lossless codec.

The new controller must be generated with **intentOwner and assetMetadata**.
The adapter rejects legacy unpinned source, recompilation/artifact root mismatch,
mutable token administration, wrong decimals, SDK/network/key/root changes and
changed inputs. `domain.mjs` binds the exact configured network and endpoints;
this is not a running-image or independent genesis attestation.

Run `node composition/run.mjs CONFIG scan|once|watch|reconcile`. CONFIG supplies
absolute or config-relative intent, plan, runtime policy, controller source /
compiled artifact / raw ABI, two raw FT ABIs, native ABI, two market ABIs, RPC
config, the reviewed `composition_wallet` path/SHA256, persistent runtimeDirectory,
profile `composition-funded-v1`, network `sepolia`, frozen SDK hash, existing
staging profile, exact vault/fingerprint/publicKeyHash, controllerBudget,
ownerFeeReserve and the two canonical assetMetadata rows. Base market Executors
run separately. No component is authorized to write another vault account.

A resident proof-only process shares reviewed circuit/session resources between
non-authorizing fee traces and fresh full proofs. Prepared work keeps its exact
window across restart; unknown broadcast reconciles the original request before
planning. Old receipt reconciliation remains available after a dependency update,
while new financial work halts. Locks coordinate the same host only.

Evidence and exact performance boundaries:
`executor/verification/2026-10-23-composition-financial-executor-v1/README.md`.
Initial fresh QA asset bootstrap is `composition/acceptance/bootstrap.mjs`; it
requires an explicitly pinned FT compiler release. It deploys no old updates and
funds no composition controller. An unknown deployment requires reconciliation.

### Reviewed source and base key closure

Financial startup now also requires four `components` records, exactly two
`{role:'token', contractId, source, artifact}` and two
`{role:'market', contractId, source, artifact, config, policy,
admissionMode:'all-four-v1'}`. Supply reviewed `{file, sha256}` release pins for
`tokenCompiler`, `marketCompiler`, `componentInspector` and `baseKeyDriver`.
Paths are absolute or relative to the CLI configuration. The SDK pin is unchanged.

`components.mjs` regenerates canonical token/AMM source, rebuilds it with the
pinned compilers, compares complete integer IR and ABI, derives actual CFC code,
layout and function roots, and matches all six registry identity/count fields.
It separately reconstructs the base admission/bulk policy and derives the key
fingerprint/public identity. Source or ABI similarity alone is insufficient.
Identical builds are shared within startup; transaction witnesses/state are not
cached here. The sealed tools are an operator-reviewed host trust boundary.
Tests with stub compilers are boundary tests, not a claim of cryptography or
four-component network acceptance. Actual derived roots/counts have separately
been matched against the included QA-A asset.

### Interrupted and unknown isolated requests

The unfunded `composition-live-v1` case is quarantined. Entry points reject a
case carrying `public/QUARANTINED-v1.json`; this local operational guard does not
cancel a chain request or revoke an already running process. Read-only exact
receipt observation remains possible and cannot publish a financial prerequisite
for a quarantined case. No old artifact is replaced.

`freshCase.mjs` creates an independent successor with QA-B's canonical issuer
changed, making its code/request identity distinct. `prepare_initial_request`
creates and verifies an initial layout request entirely offline. `submitInitial`
independently verifies the saved request, records a deterministic lookup identity
and exact compact wire, then sends once. It never sends an update or retries an
unknown broadcast. A content hash is not a unique deployment occurrence: receipt
checkpoint/ID/deployer and all endpoint metadata are still required.

`resumeIssuerFunding.mjs` handles only the reviewed ordinary binary interrupted
with an empty output directory, stopped process, unchanged nonce/balance/cursors,
and the original calls/window. Any proof/request/intent artifact stops this
recovery path; unknown sends use exact reconciliation. Native funding and a
possible late faucet grant remain separate, explicitly accounted transfers.

Closed constituent network evidence is now in
`executor/verification/2026-10-23-composition-constituent-live-v1`: five included
ordinary UPSs, independent saved-proof verification, exact fees and a real QA
U124 FT transfer/claim across realms. This is **not** a live composition route.
`verifyComponentsOffline.mjs` also runs the source/IR/root/base-key pipeline
using actual pinned tools and explicitly synthetic route IDs. Final source,
61 regression results and the full-metadata read-only acceptance check are in
`2026-10-23-composition-final-checks-v1`. Unknown QA-B deployment is observed
with `observeInitial.mjs`; it can never send a replacement request.

### Independent live pair and controller source closure

New QA-B 2484 and AMMs 2485/2486 have included deployment/registration evidence
in `2026-10-23-composition-new-pair-v1`. Unknown predecessor deployments remain
excluded, never resent. This prerequisite archive alone is not route settlement.
`controllerBuild.mjs` adds mandatory `controllerCompiler: {file, sha256}` to the
financial configuration, recompiling the canonical owner/metadata-pinned source
and matching whole integer IR/ABI and actual roots before funding. The base four
components retain their independent source and key verification.

`acceptance/controllerSetup.mjs`, `setupLiquidity.mjs`, `routeSetup.mjs` and
`executeRoute.mjs` run only new instances through formal adapters/journals. They
preserve original attempts and stop on uncertain mutations. `financialHarness`
explicitly labels simulated parent ACK loss, rather than claiming a physical
network fault. Application v4 selection is case-local, immutable and SDK-bound;
only public-read transport/empty-body failures are retried, never broadcasts.

### Financial v2 account initialization and safe new-instance acceptance

Current financial intents require `version: 2` and
`execution.initialization: {asset: OTHER_FT_ID, amount: 1n,
mode: 'sender-bound-cancel-before-route'}`. Funding authorization schema is 2.
The owner explicitly deposits one atomic unit alongside input/native funding;
`bind_funding` checks it inside that same ordinary UPS. The first dedicated-key
UPS cancels that unit back to the original owner and proves zero spendable other
asset. Its nonzero tree can then be read by base market proofs. Final ordinary
claims include the separate initialization refund. No principal or shared-pool
liquidity is prefilled, and cross-UPS atomicity is not claimed. Legacy v1 plans
remain advisory/read-only; they do not authorize current financial execution.

`controllerDirectory.mjs` selects an immutable fresh generation; old artifacts
are retained. `completeInitializedAcceptance.mjs` waits for 16 new full synthetic
controller UPSs, current key negatives, real LP and explicit QA initialization
funding, then runs the formal success/recovery adapters and audits serially.
A failed child stops; no uncertain submit is retried. `recoverLiquidityEpoch.mjs`
only aborts a proven empty expired epoch, then reconsents the original LP order
in a later epoch. `verifyReceiptBundle.mjs` independently checks exact saved
network proofs/receipt endpoints and a mutated actual fee. The initializer's
current extra-asset requirement and the external deployment index discrepancy
remain explicit limitations, not evidence of general production readiness.

### Reuse an immutable deployment proof, without reusing transaction state

An optional `initialDeployment` configuration supplies the exact saved request
path/SHA256, actual deployer and reviewed `verify_initial_request` file/SHA256.
`initialDeployment.mjs` verifies that proof and the whole artifact/whitelist;
it does not generate or send anything. Canonical source/IR/function-root and all
current live dependency/key/deployer/network checks remain mandatory. Every
financial operation still gets fresh state/nonce/context and a full UPS.
Without this option the prior full inspection path remains. `routeSetup.mjs`
selects the exact already included request for the new isolated instances.

`compareInitialValidation.mjs` preserves one static validation timing/RSS pair
and three actual malformed-request rejections. Its scope excludes financial
proof/confirmation throughput. See the team review's exact measurements and
limitations; no broad speedup or production claim follows from this cache.

## Closed live acceptance reports

After both isolated route runners and the fixed-checkpoint cohort audit have
completed, run these read-only checks with **fresh output paths**:

```sh
node composition/acceptance/verifyReceiptBundle.mjs "$CASE" \
  "$CASE/public/COMPOSITION-RECOVERY-AUDIT-v1.json" "$PINNED_UPS_VERIFIER" "$FRESH_PROOF_OUTPUT"
node composition/acceptance/ownerClaimAudit.mjs "$CASE" \
  "$FRESH_PROOF_OUTPUT/SUMMARY.json" "$CASE/public/COMPOSITION-OWNER-CLAIMS-AUDIT-v1.json"
node composition/acceptance/livePerformance.mjs "$CASE" \
  "$FRESH_PROOF_OUTPUT/SUMMARY.json" "$FRESH_PERFORMANCE_OUTPUT" "$CLOSED_RESOURCE_SUMMARY"
```

The ordinary claim audit compares actual historical balances and cumulative
Outbox/claim cursors with the independently verified ordinary UPS start/end user
leaves, exact request identity and actual fee. QA FT amounts use both U124 limbs;
native test PSY has 9 decimals. It includes the one-unit initialization refund.
The performance report requires completed claims, zero controller residuals,
the exact cohort audit and all actual proof verifications. Missing timings stay
unknown; overlapping phase walls are not summed as elapsed time, and repeated
resident startup descriptors are counted only on the first job in a process.
These reports do not submit transactions or assert production readiness.
