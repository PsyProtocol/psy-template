# Settlement preparation review — 2026-10-24

## Scope and frozen baseline

- Branch: `markets-batch-capacity-recovery-20261020`.
- Before: `efe3c9fad1605f23a8177ec3d0ea71826badb9cd`.
- SDK manifest SHA256: `0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425` (same selected local session-bound SDK; no upstream migration).
- Node, existing contract code/layout, pricing, matching and ordering unchanged.
- Original public run artifacts remain immutable. A fresh durable case is used.

## Implemented

1. Composition fee preparation now performs one advisory VM trace. The final exact fee burn, modified slots, complete stack/session, endpoints and request remain mandatory gates of the full UPS and sealed broadcast driver. A fee mismatch halts before broadcast; this does not authorize automatic repricing/payment.
2. Exact advisory preparation has append-only task/trace/hash/driver/SDK/intent bindings. A safe proof-session restart can retain it only after fresh eligibility, identity, network, metadata and expiry checks. Transaction state witnesses and nonce are freshly constructed. Unknown broadcasts still block planning and reconcile by original identity.
3. Independent composition registry/key/token metadata checks and controller-field reads use bounded parallel scheduling, draining in-flight errors. No live state crosses snapshots. Immediate duplicate composition identity/state fetch after successful submit eligibility was removed; the eligibility check and sealed driver's fresh pre-send checks remain.
4. All four compact market adapters parallelize key registration with dependency reads, and cached proof validation reads exact leaf/nonce and leaf hash together. Every invocation still refreshes these facts.
5. Fee preparation, retained-fee validation and snapshots are separate optional phase observations. Telemetry cannot authorize financial operations or cause resubmission.

## Regression evidence

`executor/verification/2026-10-24-settlement-preparation-regressions-v1/regressions-v1.log`: 79 passing tests, including all four markets, stale nonce/anchors, expiry, code/layout/network/key changes, complete proof fee rejection, retained advisory record tampering, safe restart, unknown receipt, concurrent local execution, bounded reads and telemetry failures. These are application tests with explicit mock IO where indicated; they do not attest chain inclusion or cryptography.

## Live experiment (in progress)

Fresh case: `psy-market-recovery-20261023/composition-preparation-live-v1`. Independent zero-asset publisher, fresh funded controller/key, new orders/epochs in owned QA AMMs 2485 and 2486. QA FT 2483/2484 have 18 decimals; native fees use test PSY. Existing pUSDT is not used.

Compare frozen baseline and candidate on identical exact tasks, own starting leaf/nonce, calls, fees and final account state. Use one exactly pinned resident with fresh sessions, alternating ABBA order, preserve both full proofs, submit only the candidate once. Cold source/circuit startup, warm advisory preparation/full UPS, actual submission/confirmation and ordinary wallet claim are separate observations. Deliberate baseline work remains in the actual test envelope.

**Boundary:** this is a matched preparation/proof comparison attached to real fills. Only the candidate is broadcast, so there is no paired baseline network-confirmation measurement and no claim of overall confirmation speedup, chain TPS or production readiness. Child SDK reads remain inside resident timing, not individually instrumented. RSS sampling is not a true per-phase memory peak.

Completion, actual fees, accounting and performance figures will be added after the run closes. No acceleration numbers are claimed yet.

## Calibration rejection and recovery correction

The first open comparison correctly stopped before broadcast: its two fresh proofs used different source checkpoints, and AMM `order_checkpoint` is written from `ctx.checkpoint_id`. Different ending roots must not be normalized or ignored. The only included controller operation was funding; the independently read current nonce was 1, with zero open broadcasts/unresolved intents. Original logs/proofs stay in comparison generation v1.

Comparison generation v2 uses the **existing frozen standalone historical-source calibration** on the first open, selecting the candidate's authenticated source checkpoint. Its full ending leaf/state, nonce, calls and fees must match exactly. The frozen broadcast driver rejects historical calibration bundles. It is cold standalone calibration, so its wall is not presented as a matched warm proof speed comparison. Subsequent operations freshly validate the **same exact already verified transaction proof** with the baseline's identity/nonce/expiry gates, avoiding unnecessary duplicate proofs; these validations are not independent proving timers.

Fee preparation alone remains a paired warm before/after comparison. Explicitly selected v2 files preserve v1, and original funding is adopted by exact included receipt without resending. Advisory fees may renew only an unsigned transport window when every business field/call matches a fresh scan. New state proofs/nonces are constructed; old signed guards and proofs remain immutable. Cancellation, changed amounts/key/dependencies, and unknown broadcasts still stop reuse.

## Current measured milestones (not final throughput)

- New controller `2495`, execution account `1092800`; first funded UPS included at `373583`, corrected first open at `373697`, first admission consent at `373744`.
- First warm admission-consent preparation: baseline **109.21 s / 2 traces**, candidate **52.69 s / 1 trace**. Both made **66** application public read attempts, all successful. Its two disjoint validation read spans were about **33.39 s** total before and **18.93 s** after; this is observed JS queue-to-last-RPC-finish time, not SDK-internal read or proof time.
- Restart retained the advisory trace and rebound only the unsigned send window in **5.90 s**, with no VM fee trace. Fresh production proof and authenticated same-source calibration matched the complete public core at source checkpoint `373680`.
- Candidate first open and first consent were each submitted once. Baseline calibration transport is disabled. Subsequent exact-proof validation has no independent proving timer.
- Accepted first epoch is `6`, cutoff `373839`, one accepted member. Its 128-checkpoint intake window is fixed; it is **not shortened after acceptance** to improve the apparent envelope. Waiting for this window is a separately identified end-to-end cost.
- No new market fill or final owner claim is claimed at this milestone. First market commitment/settlement and the second hop remain in progress.
