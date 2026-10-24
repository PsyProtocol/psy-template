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
