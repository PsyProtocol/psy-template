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
Curve 2498 / vault 302272; NFT Market 2499 / vault 1072320. New fee sponsor
519360 is registered. Initial NFT mint, asset distribution and both ordinary
claims are included. Market activation is running; no new fill is claimed yet. Existing owned QA FT 2483/2484 (18 decimals) and test PSY (9 decimals) are
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
- For the necessary Curve inventory initialization, after releasing its setup
  adapter: warm resident proof versus a separate cold process at the
  **same authenticated source checkpoint**, with complete public core, calls,
  nonce, fees and end-state equality. Historical calibration proofs are never
  broadcast. Such a comparison measures resource/cold-process costs, not an
  independent warm algorithmic speedup or two matched confirmations.
- For each market's seal: ABBA `verify-prepared` over the **same exact proof**
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

77 core application tests pass, including public factory scope forwarding, failure
before lease acquisition, exact resource identity, altered files, failed-child
isolation, unconfirmed exit, compact four-market security/nonce/expiry paths,
bounded reads and durable journals. One Rust scheduler test covers serial/four
concurrency, all checks on success, failed-chunk draining and no next chunk.
Three further seed-recovery tests reject possible broadcasts, extra original
request files, altered calls and diagnostics that signed/broadcast or did not
fail the exact NFT call. Mocked IO tests do not substitute for full proof or
live acceptance.

[Regression and frozen dependency archive](../../executor/verification/2026-10-24-proof-stage-regressions-v1/manifest.json).

## Gates still open

Actual Book/Curve/NFT fills and ordinary
claims, independently verified saved UPSs, exact receipt-fee/cohort conservation,
closed per-stage performance/RSS evidence and archive comparison remain open.
No speedup, four-market throughput or production readiness is asserted here.
Random ordering remains off; authenticated finite queues are not global
inclusion/anti-censorship proofs. Runtime/upgrade-auth/upstream SDK release and
cross-machine coordination evidence remain separate boundaries.

## Preserved startup and seed recovery

Registration indexing initially lagged its acknowledgement. The same saved
request was reconciled read-only. A later HTTP 503 during NFT registration
reconciliation was preserved; no registration or deployment was repeated.

The first seed preparation failed at `prove-ordinary-calls`, with explicit
`broadcastMayHaveBeenAttempted=false` and only `failure.json` in its output.
A separate proof-only diagnostic reproduced failure of the last, redundant
owner-to-uninitialized-NFT-vault `acknowledge` call. It created no signed endcap
or broadcast request. The owner already holds the minted NFT; required vault
activation/holder/acknowledgement checks remain in the market and SD-key.

An explicit `seed-without-ack-v1` continuation verifies original failure/input
hashes, the exact diagnostic, unchanged owner nonce, zero seed outboxes and
positive owner NFT balance. It removes only the diagnosed preparation call and
uses `activation-seeds-reviewed-v1`, with a fresh proof and distinct artifacts.
That seed transfer is now included. Three prior confirmed initialization UPSs
are adopted by their original receipts. Original and resumed worker sources
are preserved separately by the original manifest hashes; post-launch copies
are not falsely described as pre-execution snapshots.

## NFT activation acknowledgement loss

Book 2497 / vault 662720 and Curve 2498 / vault 302272 activation were
confirmed at checkpoints 374716 / 374717. NFT Market 2499 / vault 1072320
activation's first transport timed out after a durable broadcast intent.
The saved request hash is
`82240a91caa412741defb1f20fab9ea64293feaa182142a926ca50b7b4cc0786`.
Missing indexed receipts and unchanged nonce do **not** establish rejection or
queue absence. The selected SDK's `get_tx_status` locally compares nonce and
also does not establish queue absence; the remote RPC returned Method not found.

An explicit acceptance-only recovery preserves the original journal as the
authority and rechecks its manifest, signed request bytes, source and endpoints.
It invokes the existing native `broadcast-prepared` for **one identical request**
in a new evidence directory. The native verifier repeats full UPS, stack/session,
fee, dependency, registration, current anchor/nonce and expiry checks; it neither
signs nor builds a new proof or business operation. Original and retransmitted
requests, if both reach the network, describe the same state transition. This
is not a general automatic retry or proof of remote queue idempotency. If the
original is included during checking, native anchor validation rejects another
send and the original receipt remains authoritative. The original journal subsequently reconciled the exact end leaf at checkpoint
374754. Activation is confirmed; it is not a market fill.

The earlier diagnostic metadata recorded the current reference source digest
rather than the frozen binary's compiled source. A separate additive correction
binds the actual frozen source and build manifest; the original metadata remains
untouched. The only reference-source difference adds diagnostic report tags.

[Exact-proof recovery and additive provenance correction archive](../../executor/verification/2026-10-24-exact-proof-recovery-v1/manifest.json) preserves the accepted retransmission, original request identity and five recovery / two transport-reporting regression results. The latter tests explicitly keep a timed-out send plus exact retransmission as one signed transaction, and refuse to count HTTP 200 with RPC error as acknowledgement.

## Completed initialization calibration and unsigned-send recovery

Curve inventory initialization now has an actual included UPS at checkpoint
374808. Its warm/cold complete public cores match. Warm preflight was 98,504 ms;
cold was 180,060 ms, including 41,244 ms session construction, 1,090 ms key
construction and 7,353 ms additional authenticated historical-source setup.
This is one sequential same-host resource comparison, not an isolated proving
algorithm improvement, matched chain confirmation comparison or confidence
interval. The source checkpoint, nonce, fee and all public endpoints match.

After calibration, a coordinator connection error stopped native live checking
**before** creation of a wire request or native broadcast intent. Explicit
`resumePreparedInventory.mjs` binds the saved comparison and original proof,
forbids its `prove` callback, and lets the formal journal redo the normal fresh
current-state and native submission checks. The journal contains one `proved`
record, two local submission intents and one final inclusion for this task.
A separate failed parse attempt (decimal observations read with integer-only
JSON) remains preserved; it performed no transaction. Reporting now keeps all
submission attempts and includes restart/recovery delay in the original
attempt-to-final-observation interval.

`completedCalibration.mjs` adds exact-manifest adoption checks for completed
cold comparisons and ABBA guard measurements; its three regressions pass.
It is not wired into the currently running, source-frozen financial worker;
that integration will be committed after this worker closes. Native financial
full-proof and fresh identity/anchor/expiry checks remain mandatory.

[Initialization exact-proof recovery archive](../../executor/verification/2026-10-24-exact-initialize-recovery-v1/manifest.json) contains both calibration requests, the unsigned coordinator rejection, the unchanged prepared proof, the successful formal recovery and its actual checkpoint receipt. All 41 files were byte-compared with originals. Archive integrity is not cryptographic proof verification; final independent UPS accounting remains open until the three-fill route closes.
