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
Curve and NFT Market registration still pending at this milestone. New fee
sponsor 519360 is registered. No new market fill or ordinary payout is claimed
yet. Existing owned QA FT 2483/2484 (18 decimals) and test PSY (9 decimals) are
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
- For commit/settle: warm resident proof versus a separate cold process at the
  **same authenticated source checkpoint**, with complete public core, calls,
  nonce, fees and end-state equality. Historical calibration proofs are never
  broadcast. Such a comparison measures resource/cold-process costs, not an
  independent warm algorithmic speedup or two matched confirmations.
- For each market's commit: ABBA `verify-prepared` over the **same exact proof**
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

77 application tests pass, including public factory scope forwarding, failure
before lease acquisition, exact resource identity, altered files, failed-child
isolation, unconfirmed exit, compact four-market security/nonce/expiry paths,
bounded reads and durable journals. One Rust scheduler test covers serial/four
concurrency, all checks on success, failed-chunk draining and no next chunk.
These mocked IO tests do not substitute for full proof or live acceptance.

[Regression and frozen dependency archive](../../executor/verification/2026-10-24-proof-stage-regressions-v1/manifest.json).

## Gates still open

Fresh Curve/NFT Market registration, actual Book/Curve/NFT fills and ordinary
claims, independently verified saved UPSs, exact receipt-fee/cohort conservation,
closed per-stage performance/RSS evidence and archive comparison remain open.
No speedup, four-market throughput or production readiness is asserted here.
Random ordering remains off; authenticated finite queues are not global
inclusion/anti-censorship proofs. Runtime/upgrade-auth/upstream SDK release and
cross-machine coordination evidence remain separate boundaries.
