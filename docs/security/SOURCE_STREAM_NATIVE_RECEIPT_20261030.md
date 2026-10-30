# Owned native source-plan byte receipts — 30 October 2026

## Result and scope

This application-side continuation binds durable Executor plans to the exact
bytes produced by the reviewed native planner. It closes a local integrity gap:
the previous route parsed/validated output files and then reopened them to
record hashes, and accepted a completed planning process without an output
digest receipt. A substituted but structurally coherent result could therefore
be mistaken for the original native-checked proposal. Production settlement was
already disabled; this is not evidence of a financial authorization bypass.

Branch and SDK remain unchanged: `markets-batch-capacity-recovery-20261020`,
SDK `c92880c8b6e2c8d392f19368bc8801a2584fd427`. No Node, contract bytecode,
SD-key, market pricing/matching, capacity, wallet, old request or original
artifact was changed. Qualified entropy, finality, seal-before-public-release
authentication, live registration, settlement and ordinary-wallet claims remain
blocked as documented in the
[checkpoint/random-source investigation](CHECKPOINT_RANDOM_SOURCE_CAUSE_REVIEW_20261030.md).
The running verification resources requested there have not been supplied.
This case deliberately makes zero additional RPC calls or key guesses.

## Implementation

- [Native receipt helper](../../amm/u124/vm-tests/src/source_plan_receipt.rs)
  serializes an artifact once, writes/fsyncs those bytes with create-new
  semantics, and returns their SHA256. After all four artifacts are complete,
  the planner emits one `PSY_SOURCE_STREAM_RECEIPT` frame through its owned
  stdout channel. Profile, history root and every original input/output digest
  are bound. The receipt cannot enable signing, broadcasting, finality or
  qualified randomness.
- [Minimum planner](../../amm/u124/vm-tests/src/bin/minimum_stream_plan.rs)
  covers v11 and v13, including v13's accepted-seal input. The
  [v10 planner](../../amm/u124/vm-tests/src/bin/random_stream_plan.rs) emits the
  same receipt protocol for its different page artifact. The artifact JSON
  format, original seed and market/ordering semantics are unchanged.
- [Executor receipt validation](../../executor/sourcePlanReceipt.mjs) accepts
  exactly one owned-process frame, exact input/output name sets and matching
  digests. Missing/duplicate frames, foreign bindings, extra fields and authority
  promotion reject. Files are bounded before allocation, regular, opened with
  no-follow/nonblocking flags, and checked for identity changes. Each output is
  parsed from the same bytes that were hashed, eliminating the second read
  between validation and digest pinning.
- [Formal preparation route](../../executor/randomSourceStream.mjs) stores the
  exact frame and its digest before the prepared journal event. Restart checks
  the immutable binding, artifacts, receipt, all output hashes and structural
  continuity. The reviewed driver is checked both before and after execution.
  It retains the same finite set, seed, original source, profile and epoch.

Receipt fields are exactly:

```text
schema, kind, profile, historyRoot, inputs, outputs,
financialOperations, proofsGenerated, canSign, canBroadcast,
finalityVerified, seedSecrecyAuthenticated, qualifiedRandomness
```

`kind` is `source-stream-plan-receipt-v1`. `inputs` contains `review`,
`snapshot`, `draw`, `policy`, and only for v13 `acceptedSeal`. `outputs`
contains `plan`, `source-pages`, `queue`, and the profile's `ordering-pages`
or `minimum-pages`. Digests are lowercase SHA256. The four plan artifacts are
unchanged; the local receipt is stored separately as `native-receipt.json`.

Output reader limits are 1 MiB for the plan, 64 MiB for source/ordering/minimum
pages, and 16 MiB for the queue. The receipt frame is at most 16 KiB. These are
resource bounds, not an increase in verified market batch capacity.

## Recovery and trust boundary

An interrupted **offline planning** attempt may replay the same bound inputs
in a fresh directory. Existing partial artifacts are retained and must match
the exact replay; conflicting or truncated files fail closed for inspection.
No original file is overwritten. A lost planning response is not an unknown
financial broadcast, and this replay does not authorize re-signing a transaction
or repeating payment. Existing financial send locks and receipt reconciliation
are untouched.

An old prepared journal without a native byte receipt rejects. It is not
silently upgraded, cleared or treated as verified. An operator may separately
review a new offline planner and replay the original public inputs in a fresh
planning namespace, preserving the original journal and comparing the results.
Changing source, seed, history, key, binary or other same-epoch bindings still
conflicts in the original namespace.

The receipt is **not a ZK proof or network attestation**. It binds the reviewed
operator-owned process and local artifact bytes. It does not defend against an
administrator controlling both the approved executable and journal, authenticate
the supplied history as canonical, certify entropy/release timing, or prove
live execution. Test hooks remain operator/test seams, never webpage-provided
verifiers or success reports. `authorizeSettlement()` continues to reject.
The separate qualified-randomness gate is unchanged.

## Verification and original evidence

The new case used archived **public synthetic** v13 fixtures, not current-chain
IDs or balances. Actual reviewed native binaries and the formal Executor route
were used for AMM and Curve:

- Eight source accounts and five members, including the original four-plus-one
  build/extraction continuations. Source, accepted seal and draw remain
  101 / 102 / 133. Every byte of all four new artifacts equals its corresponding
  original archived artifact, not just the parsed values or final root.
- Exact restart and fresh actual Node-process restart reuse the prepared result.
  Two same-host preparation processes either reuse it or encounter the existing
  owner lock. They create no second native plan. This is not cross-machine
  coordination or financial Executor competition acceptance.
- A delivery-copy attack changes the seed and every related page seed while
  passing the old structural validation. The new route rejects the mismatch
  with the actual native stdout receipt. The genuine native output directory
  remains unchanged and is retained separately.
- A lost **planning** response prevents a prepared event. Replay uses the same
  inputs in a fresh directory and checks original partial outputs. The original
  artifacts are retained. No proof or transaction is regenerated.
- A copied old-format journal without its receipt field rejects without native
  replay or cleanup. Temporary coordination tests also cover changed receipt
  bytes, wrong inputs/profile/history, extra/missing fields, duplicate frames,
  symlinks, oversize files and attempts to promote authority.

One additional actual v10 native preparation verifies the other planner's new
receipt path. V11 is covered by receipt-unit and coordination tests; no new
actual v11 native run was performed. Six actual native planning invocations
exhaust the declared maximum. None generated a proof or used financial assets.

The final focused Executor suite passes nine tests; the native receipt helper
test covers all three profiles. The first development run had four failures
because exact digest maps from the lossless parser have a null prototype.
The fix preserves exact field sets and compares primitive digests individually;
it does not omit any binding. That failure is retained as an observed-output
summary; its raw log was not saved. Subsequent attempts have durable logs.

No new complete UPS is claimed. The previous v13 synthetic full-UPS evidence
remains its original version and scope. Ordinary wallet claim bytecode checks,
signed wallet claims, real network confirmations and browser acceptance remain
distinct. QA assets, test PSY and pUSDT were not transferred or consumed.

## Measurements and outstanding dependencies

Two locked/offline release builds on the existing shared Cargo target took
53.054 s and 53.006 s. The five-run native v13 integration, including process
restart, local competition, copy attacks and recovery, took 11.447 s; final reuse
and the v10 run took 4.193 s. These are offline planning measurements, not full
proof, confirmation, claim or cold/warm market-performance comparisons. Sampling
uses one-second process-family RSS, includes shared pages and can miss short
peaks; it is not physical peak memory. No overall speedup or TPS is claimed.

Public evidence:
[summary](../../executor/verification/2026-10-30-source-stream-native-receipt-v1/SUMMARY.json),
[file/digest index](../../executor/verification/2026-10-30-source-stream-native-receipt-v1/index.json).
Reviewed binary digests and source snapshots are included. Compiled input
artifacts are referenced by their original hashes rather than republished in
every runtime copy; a deduplicated public blob set and path/digest mapping are
included for reconstruction. No private keys, mnemonics or secret signing witnesses are
included.

Actual runtime proof/resource correspondence, canonical history/finality,
pre-seed-release authentication and original funding reconciliation remain the
external prerequisites. Local byte receipts do not close those dependencies,
install a different checkpoint key or unlock financial execution.
