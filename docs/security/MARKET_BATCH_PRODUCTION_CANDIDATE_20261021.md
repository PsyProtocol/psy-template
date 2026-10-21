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
