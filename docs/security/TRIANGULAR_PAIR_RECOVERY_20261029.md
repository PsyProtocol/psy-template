# Triangular paired scan and authenticated early refund candidate

## Baseline and ownership

Baseline: `d02d4d496d74e7d241dfe056f17ca091a1e43af4`, branch
`markets-batch-capacity-recovery-20261020`. SDK remains mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, with the frozen client/backend,
nightly-2025-09-20 toolchain and two Rayon threads. Root is the sole proving
and financial owner. No prior financial/proof process was running at preflight.
No Node, SDK source, old deployment or original proof is modified.

This is a distinct policy v9, `source-covered-pair-triangular-recovery-v1`.
It preserves shared vaults, deterministic ordering, whole-order pricing,
matching and per-listing NFT buyer priority. Live authorization stays false.

## Reduced scan, unchanged priority

The v8 Cartesian scan visited N² ordered pairs, including self pairs and both
orientations of the same pair. V9 visits exactly N(N-1)/2 unordered pairs.
Authentication precedes orientation: side/kind determines which record is the
ask/listing and which is the bid/buyer. The original compatibility and exact
U248 price/time comparator then choose the same global winner. No float, single
Felt amount reduction or U124 rounding is introduced.

The outer authenticated minimum traverses the remaining set. Its inner tree
contains only the strictly later suffix. A minimum proof authenticates the
initial head and each subsequent suffix reset. Empty-leaf substitution, an
earlier inner index, omitted head, wrong suffix, duplicate or omitted pair,
false best and counter substitution cannot complete the proof. Four comparisons
per SCAN UPS remain the capacity; no configuration-only capacity increase occurs.
Completion requires the exact triangular count and empty frontier roots. A
singleton has zero comparisons but still proves its authenticated singleton head
and publishes a completed no-match certificate once.

For five members, the scan changes from 25 comparisons/seven UPSs to ten
comparisons/three UPSs. With three members remaining it changes from nine/three
to three/one. The original two-fill path therefore needs four scan UPSs instead
of ten. Complexity remains O(N²) per fill; this is a constant-factor reduction,
not an indexed orderbook, scalable-service guarantee or same-pool parallelism.

## Safe progress after a winner invalidates

The constrained v9 rejection bit selects a one-member early refund. The key
requires a completed stored best certificate and binds the refunded source
member to one of its two actual winner records, with exact terms and nonce.
It permits a non-minimum removal only under this certificate. The current
`begin_stream_settlement` CFC captures cancellation, deadline, funding and
consumed cursors from the authenticated signed checkpoint. `bind_stream_member`
still authenticates the immutable original source terms.

The new actual readonly `bind_pair_rejection` CFC checks that exact stored
frontier, the unique bound member, and either cancellation/expiry or invalid
current funding. The original refund CFC then returns actual FT/native deltas
and NFT FIFO output to the sender, updates consumed/cursor state, and removes
exactly that original source member. The key binds the full ordered stack,
caller/arguments, session/sig_hash, identities, nonce, fee and final endpoints.
An Endcap or a host flag alone does not authorize a skip.

After removal, the frontier restarts over the exact remaining root. Other
still-valid orders keep their original source priority. A valid best cannot be
arbitrarily refunded; an unrelated invalid order cannot be substituted for a
certified winner. Normal post-expiry refund pages retain the authenticated
minimum and full-page/terminal-tail rules. Canonical timeout recovery remains
available even if scanning never completes. No accepted member is silently
removed, no snapshot root is exchanged, and a completed fill is not reversed.

Allowed-key executors can advance these offline protocol stages without a new
private operator authority. The existing vault sponsor budget pays each UPS fee;
refunds return sender principal and refundable escrow rather than spending it as
a recovery bounty. Sender cancellation/enrollment and ordinary signed claims
remain sender actions. Exhausted gas requires an explicit authorized sponsor
grant; no automatic top-up, silent budget extension or replacement payment is
introduced. Real-wallet fee and liveness acceptance remain unverified.

Current funding recovery is verified within the existing numeric domains. Native
fee/Outbox counters retain their prior 62-bit accepted range; this version does
not prove automatic recovery after a domain, dependency or state-integrity
failure. Those conditions stop authorization and need a reviewed recovery path.

Source identity replacement is not treated as a cancellation. Existing order
opening requires an idle local order; it cannot legitimately replace a funded,
unconsumed outstanding nonce. A dependency identity or state-integrity failure
stops authorization rather than inventing a replacement asset/refund. NFT refund
uses the original one-FIFO-output operation; extra unsolicited components retain
the explicit sender-enrolled recovery boundary of the existing profile.

These are signed-checkpoint checks. They do not prove precedence against a
foreign cancellation that happens after signing but before inclusion. Client
preflight is useful but cannot replace protocol enforcement for a permissionless
SD-key. The [existing admission requirements](../../batching/checkpoint-stream/admission-requirements.json)
remain unclosed; no safety check is deleted to enable live spending.

## Declared validation and evidence boundaries

The offline budget is two synthetic candidate worlds, at most 24 complete UPSs
per market, 40 standalone component attempts, synthetic native grants at most
80 billion base units per market and zero live deployment/broadcast/fees.
Each run stops on invalid proof/conservation, pin mismatch, its deadline or
sampled family RSS above 8 GiB. Output directories are fresh and failures remain.

The initial actual-bytecode run passed for both markets, including two normal
fills, a cancelled-winner refund followed by the next globally selected trade,
remaining-set expiry refunds, changed-fee funding rejection, within-window
order-deadline rejection, no-match carry, enrolled recovery and source timeout.
Recipient claims in these runs are VM-only, not ordinary-wallet signed UPSs.

The first full-UPS run accepted eleven exact transactions, then correctly
rejected a test-planner error in the cancellation fork's final refund. The
planner rebuilt a remaining tree using raw snapshot scope version 1 instead of
the authenticated source-page scope version 3. VM execution cannot authenticate
such planner membership paths; the spending key detected the wrong root. The
planner now uses the exact source-page domain and checks the rebuilt root against
current state before proof preparation. No circuit/verifier/contract constraint
was removed. Original accepted proofs and failed partial CFC artifacts are kept;
continuation must reverify and reuse the eleven accepted identities, not regenerate
them. This demonstrates why a passing VM run is not full-UPS acceptance.

Conditional component proofs passed for one, two and five members per market,
including near-U124-maximum operands and independent Cartesian reference winners.
Ten positive proofs and twelve invalid witness rejections passed. The component
proves ordering conditional on the authenticated remaining root; complete source
coverage, actual CFCs and full financial authorization require the separate UPSs.
Actual compiled bytecode passed the independent FT31/NFT30/native32 foreign-read
audit. Full-UPS generation and exact replay results must be recorded separately.

## Current network observations and live gate

Bounded readonly requests returned HTTP 200 from realm0-stg, realm1-stg and
coordinator-stg at approximately checkpoint 11,400. The captured native code
reconstructs under the frozen SDK: root
`5df4b10ccf59e25f3c44b4164edb9597455da33b925c3981881c280f2636ebd1`,
32-bit state tree, transfer/claim and fee-burn method 3998182541. This is necessary
compatibility evidence, not runtime attestation or financial readiness. Captured
checkpoint-1 roots are observations, not a qualified finality/randomness proof.

A coverage UPS proves at most four source accounts, including unrelated accounts,
not just four market members. The actual complete account inventory must be
measured; the RPC allocation cursor is not an exact occupied-account count. A
live plan must cover this cost within its finite checkpoint/fee budget. The
existing C+32 source window is unchanged and is not shown to fit live proving
and confirmation. Any longer window needs an explicit new profile, complete
revalidation and a declared budget, never an edit of an already sealed epoch.

The selected-method native fixture has deliberately synthetic code/function
roots and zero layout metadata. Its identities differ from the full RPC native
leaf; `OBSERVED-NATIVE-ROOTS-v1.json` records all differences. Offline keys and
fixture IDs cannot be transplanted to the network. New instance-specific resources
must bind the complete observed native code/layout/function roots before any
real request is approved; selected-method compatibility does not close that gate.

Before real isolated deployment/settlement, the remaining gate requires reviewed
snapshot validity/cancellation/version enforcement, an authenticated current
instance and fresh Endcap/resources/identity checks, new asset/contract/key/vault
bindings, bounded real test funding, and wallet-owned approval/exact-send/recovery.
No old account ID, proof or unknown request is reused on a changed chain. Old
contract updates are not used as a compatibility probe. The public source review
and required rejection evidence are listed in the admission requirements, with
responsibility split between Realm/protocol, SDK/resource and wallet/Executor
maintainers. Do not represent HTTP recovery or offline success as live acceptance.

## Measurement rules

Compile, first-process resource build, per-call CFC, key, Endcap-plus-audit,
complete UPS and whole process intervals are retained separately. Nested phase
times are not added. One-second process-family RSS includes shared pages and is
not a physical peak. Synthetic native fees are distinct from real test PSY.
Failures, retries and protocol waits are retained.

The archived v8 run used deadline 200; this recovery fixture uses deadline 112
to exercise pre-source-expiry refunds. It is not a matched before/after overall
performance experiment. Reduced comparison/page counts are exact; universal
speedup, live confirmation time, wallet latency, p95 and TPS are unmeasured.
No production, global admission fairness, finality, randomness, atomic epoch,
cross-vault atomicity or cross-machine conclusion follows.


## Final offline results

All 44 distinct complete UPSs passed native SDK and pinned fixed Endcap/common
verification, 22 per market. Each market executes two normal whole fills and
one additional fill on the cancellation-recovery fork. These branches are
separate synthetic histories, not six trades on one real network. Cancellation,
current fee-funding changes, within-source-window order expiry, remaining-set
refunds, no-match carry, sender-enrolled recovery and source timeout are proved.
Actual FT/native/NFT claim bytecode checks outputs and original NFT payloads;
ordinary-wallet signed claims and live receipts are not present.

Eleven accepted originals came from the retained failed `full-ups-v1` process;
`full-ups-v2` reverified/reused them and generated the remaining 33. The key is
unchanged by the planner correction. All 91 original-run files and 343 final-set
files retain their recorded pre-continuation/replay SHA256. Final application-v5
adds the host domain guard and verifies every exact saved full UPS with positive
proving fallback disabled; it does not reuse a proof against different state.
Public requests, plans, snapshots, sessions and key-proof bytes remain exact.

| Quantity | Orderbook | NFT Market |
| --- | --- | --- |
| Final complete UPSs | 22 | 22 |
| Normal source accounts / members | 9 / 5 | 9 / 5 |
| Normal scan comparisons | 10 then 3 | 10 then 3 |
| Normal scan UPSs | 3 then 1 | 3 then 1 |
| Cancellation rescan | 6 comparisons / 2 UPSs | 6 comparisons / 2 UPSs |
| Normal path total UPSs | 12 | 12 |
| Sum of original normal UPS intervals | 643.609 s | 699.210 s |
| Original normal scan intervals, four UPSs | 110.312 s | 120.349 s |
| First / second normal whole-trade interval | 111.895 / 110.657 s | 139.289 / 128.179 s |
| Per-market initial resource construction | 102.144 s | 109.570 s |
| Normal synthetic native fee, base units | 12,000,172,000 | 12,000,222,000 |

The original failed process took 674.508 s (one-second sampled family RSS peak
2,183,696 KiB). The continuation took 2,354.669 s (peak 2,926,320 KiB), including
resource construction, exact revalidation of eleven originals, all remaining
proofs, VM claims and forked cases. These are two processes, not an uninterrupted
cold/warm run. Application-v5 full-set exact replay took 241.668 s, with a separately
sampled family RSS peak 3,407,824 KiB. Revalidation is not proof generation and
must not be presented as a proving speedup. Shared pages are included; these
RSS samples are not physical-memory peaks. Compile and host-domain regression
costs are recorded separately.

The prior v8 normal path had 18 UPSs and original proof intervals of 789.877 s
and 785.236 s, with synthetic fees 18,000,200,000 and 18,000,250,000 base units.
These are **historical observations, not a matched acceleration result**. In
addition to different deadlines and binary provenance, v9 recovery branches
warm CFC resources before normal trading. Some individual trade intervals are
higher. Only the six fewer scan UPSs and exact comparison counts are established
structural reductions; new profiles remain opt-in with live authorization false.
Signature, recursive/Endcap and full-source coverage costs remain bottlenecks.
No confirmation, ordinary-wallet latency, sustained throughput or p95 is measured.

The ten conditional component proofs and twelve invalid witnesses passed.
Six coherent v9 signature attacks were rejected (non-winning buyer substitution,
rejection nonce change and disabled rejection bit, for both markets), with a
recomputed stack and signature context. Four legacy saved keys also passed
exact replay and twelve coherent alternative-stack rejection checks. The 42 complete saved v8 paired proofs also passed exact revalidation under
the final source, without new positive proof generation (230.461 s, sampled
family RSS peak 2,781,360 KiB). The host
raw-domain guard and 19 JS generation/reference/foreign-height regressions passed.
The independent BigInt audit reproduces all normal and post-cancellation winners
and checks state/nonce chains, exact fees, call counts and refund recipients.
It is a structural/reference audit, not a cryptographic verifier or a separate
human security audit.

The complete UPS attempt budget remains satisfied: Orderbook used 23 attempts
(22 accepted plus the retained domain-mismatch rejection); NFT used 22 accepted
attempts. The eleven copied accepted proofs were revalidated without regeneration.
The standalone budget is ten positive component proofs, twelve invalid component
witnesses, six v9 key attacks and twelve legacy key attacks: 40 attempts. Saved
positive-key verification and exact full-proof revalidation do not create new
positive proofs. Real registrations, deployments, faucet calls, financial
broadcasts and real PSY/pUSDT/NFT fees remain zero.

## Reproduction and remaining live work

Use fresh output directories and the immutable snapshots/binary digests from
[the public evidence](../../executor/verification/2026-10-29-pair-triangular-recovery-v1/README.md).
The original complete generation uses application-v3/v4; application-v5 is the
host-guard and exact-revalidation build. The frozen dependency export is verified
before each application snapshot. Existing v7 and AMM/Curve positive CFC/UPS
proofs are not regenerated.

```sh
BATCH_BUILD=/absolute/fixtures-v2 PAIR_TRIANGLE_OUT=/absolute/fresh-original \
  /absolute/batch_lifecycle pair_triangular_recovery_ups \
  --ignored --nocapture --test-threads=1

BATCH_BUILD=/absolute/fixtures-v2 \
PAIR_STREAM_REUSE_ROOT=/absolute/full-ups-v2 PAIR_STREAM_REQUIRE_REUSE=1 \
PAIR_TRIANGLE_OUT=/absolute/fresh-exact-revalidation \
  /absolute/batch_lifecycle pair_triangular_recovery_ups \
  --ignored --nocapture --test-threads=1

BATCH_BUILD=/absolute/fixtures-v2 STREAM_KEY_EVIDENCE=/absolute/full-ups-v2 \
STREAM_KEY_REPLAY_LABEL=cancel-winner-refund \
STREAM_KEY_REPLAY_MARKETS=orderbook,nftmarket \
STREAM_KEY_REPLAY_OUT=/absolute/fresh-key-evidence \
  /absolute/batch_lifecycle stream_key_exact_replay_and_coherent_priority_attacks \
  --ignored --nocapture --test-threads=1
```

No safety gate has been relaxed to turn offline evidence into live acceptance.
The next real stage requires instance-specific full dependency resources, a
bounded complete-source inventory/lifetime/fee plan, reviewed admission and
cancellation/version rules, new QA assets/contracts/keys/vaults and the ordinary
wallet approval/exact-broadcast/receipt/claim workflow. Observed native protocol
compatibility and RPC reachability are necessary checks only. Snapshot validity
and inclusion-tip precedence remain unverified upstream requirements; this work
neither modifies Node nor tests old contracts through updates. The supported
current-invalid exit is closed at the signed checkpoint, not for arbitrary
post-signing changes or out-of-domain/corrupted state.
