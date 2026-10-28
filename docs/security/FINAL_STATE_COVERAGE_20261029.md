# Complete final-order coverage before continuous market settlement

## Decision and delivered boundary

The approved product scope is **every final eligible current order at source
checkpoint C**, including still-active orders created before C. Each owner has
one current order. Superseded order versions and earlier cancellation commands
remain historical audit events; they are not replayed as additional trades.
This is not a complete transaction-history transcript or a claim about every
submission that failed to enter authenticated chain state.

This milestone implements complete account/state discovery, final-order/funding
classification and source-bound continuous **ordering preparation** for AMM and
Bonding Curve. It does **not** enable continuous financial settlement. No old
contract, Node source, SDK dependency, wallet or UI was changed. The branch is
`markets-batch-capacity-recovery-20261020`, base `08c660235c375c55db9923261ff3e9df6ef599bc`.

The independent operator pins a history root and an approved release review.
Merkle checks authenticate all collected data relative to that root. This does
not establish that the root is canonical/final, that the producer seed is
unpredictable or unbiased, or that collection preceded its release. Those
stronger source/finality/randomness gates remain closed. The native source
collector is compiled against actual frozen SDK APIs but has not been exercised
against live RPC in this milestone.

## Implemented path

1. Authenticate checkpoint-1 and C to the same pinned checkpoint-history root.
   Match chain-instance commitment, exact checkpoint leaf, global state roots,
   producer seed and reviewed market/asset code, layout, function roots and counts.
2. Discover the entire nonempty 32-bit global account tree. A range can be skipped
   only if its authenticated hash equals the protocol empty-subtree hash.
   Every subtree reply is verified. The complete result reconstructs the root.
   Missing routes, timeouts and read/account/encoded-byte limits abort incomplete.
3. Match every typed account leaf to its discovered hash. Verify market state
   openings for every account, including explicit absence. Read final order
   fields and classify closed, other-vault, unsupported-owner, consumed, cancelled,
   expired, funding-ineligible and eligible records.
4. For current matching unconsumed orders, authenticate native fee and both U124
   funding outboxes at C. Subtract source settled cursors, require actual claim
   cursors to match the source baselines, and check all amount limbs. Curve sell
   funding uses checked full-width `lots * unit`. A cursor mismatch stops the
   capture rather than guessing available funds.
5. Derive the entire eligible manifest from verified state. Terms include order
   fields, source, owner, vault, consumed nonce, both complete funding amounts and
   fee. A supplied subset count/root cannot replace that derived set. The audit
   commitment covers every account's disposition. Feed the exact manifest into
   the existing one-scope/seed ordering pages.
6. The Executor seals native binaries, review SHA, artifacts and source snapshot,
   persists native result digests and resumes exact preparation/proofs. It has no
   signing/payment callback. `authorizeSettlement()` still rejects.

The native `capture` action uses actual frozen provider methods. Upper account
subtrees are requested directly from the coordinator: missing empty realm routes
must not be mistaken for empty state. Lower subtrees use stitched realm/coordinator
proofs. Latest-only contract metadata must match C's contract proof; upgrade drift
fails. Reads remain fixed to C. SDK-operation counts are **logical reads**, not
wire RPC counts; one operation can issue several RPCs. A wall-clock deadline,
per-read timeout, account limit, logical-read limit and 64 MiB cumulative encoded
reply budget constrain acquisition. Existing HTTP transport still allocates a
response before this application verifies it; the external process RSS limit is
an additional resource bound, not a network-level response-size guarantee.

## Trust, refunds and execution boundaries

The release review is operator-approved input, never webpage-supplied authority.
It pins market/native/FT compilation artifact digests, exact code/layout identities,
function roots, asset IDs and Curve unit. Hashing an arbitrary ABI does not approve
its semantics. Deployment configuration/constants must be reviewed against that
release context before any financial promotion.

The host coverage verifier is **not a coverage circuit or financial UPS**.
Existing ordering circuits prove a complete permutation of the source-bound
finite manifest; they do not recursively verify account traversal/classification.
A later market/key implementation must bind coverage and ordered roots in its
actual UPS, not accept this report's Boolean fields as authority.

Funded cancelled, expired and funding-ineligible current orders are returned as
recovery candidates. This is a list with authenticated source amounts, not proof
that refunds have occurred. Funding for closed, consumed, other-vault or absent
market records is not classified as available/refunded here; its audit amounts
are `null`, not zero. The existing enrolled-funding recovery path is unchanged.
Non-24-bit owners are explicitly unsupported by this market profile, never
silently counted as executable members.

The source vault must be initialized and idle. This does not lock it in the
network. At execution, current cancellation/version, funding/claim cursors,
shared state, nonce, fee and deadline must be constrained again. Source eligibility
cannot authorize spending against an old state. Orders that cannot execute must
receive a legitimate terminal/refund disposition without changing the original
set or seed.

## Validation and measurement

Frozen dependencies are unchanged: SDK mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`, nightly-2025-09-20, release,
`--offline --locked`, two build/Rayon threads, testnet magic
`1384803358401154921`. Root was the sole execution owner. No finance/proof
process was running when this work started. Budget: zero deployments, wire RPCs,
financial UPSs and fees; six new standalone ordering page proofs.

- Eight final native host tests passed. They cover both markets, full account
  omission, duplicates, forged words, context/dependency substitutions, U124 high
  limb, authenticated cursor drift, exact derived manifests, incremental traversal,
  untrusted collector replies and incomplete/budget-exhausted captures.
- Three actual-native Executor integration tests passed. Each synthetic source
  has 18 accounts, nine eligible members and three funded recovery candidates.
  Each market generates three source-bound page proofs (4 + 4 + 1), then verifies
  exact restart reuse. Review replacement, noncanonical history-root format,
  source omission/duplication, seed substitution, subset selection and captured
  input replacement reject before financial execution. No old conditional proof
  was substituted for a changed statement.
- Forty-one existing compact/legacy regressions passed in the first grouped run.
  The separate processor test initially lacked its fixture environment, then
  referenced a directory without policy files; the corrected policy-only run
  passed four cases. All failed launches remain archived. These tests use their
  existing mock financial transports, not network acceptance.
- English-language policy passed. Independent read-only source review found a
  history-root format mismatch between JavaScript and native; the adapter now
  uses the native canonical 64 lowercase hex characters, without `0x`. Actual CLI
  integration verifies that fix.

| Process | Wall seconds | Sampled family RSS peak KiB | Meaning |
|---|---:|---:|---|
| Final source build v5 | 48.677 | 1,024,032 | Incremental release application build, not a clean SDK build |
| Final native suite v5 | 8.303 | 1,362,576 | Eight host tests; synthetic source checkpoints |
| Fixture export v1 | 3.093 | 592,736 | Actual compiled artifacts, synthetic state/identities |
| Native Executor integration v1 | 17.682 | 1,030,336 | Both markets, six tiny proofs, restart and rejection tests |

All logs retain failures, waits and samples. Earlier failed builds were missing
`Hasher`, an extra type bracket, and a missing test-only `Context` import. The
first host run lacked its artifact-fixture environment. Original failures were
not overwritten. One-second family RSS samples can miss brief peaks, include
shared pages and are not physical-memory peaks. These timings are not financial
CFC/recursive/signature/Endcap performance, confirmation, ordinary-wallet claim
latency, a cold/warm comparison, chain TPS or evidence of a production speedup.

## Reproduction and next gate

Use the frozen materializer and `prepare_mainnet_beta_application.py` with fresh
output, then the indexed application-v5 inventory. The capture/verification tool
has these interfaces (fresh outputs only):

```text
final_state_coverage REVIEWED_CONFIG SOURCE_SNAPSHOT PINNED_HISTORY_ROOT FRESH_OUT
final_state_coverage capture REVIEWED_CONFIG CAPTURE_REQUEST RPC_CONFIG PINNED_HISTORY_ROOT FRESH_OUT
```

`CAPTURE_REQUEST` fixes schema 1, all 41 scope fields, public key parameter,
history checkpoint, account/read/time budgets. It cannot provide a verifier or
successful-coverage callback. The offline fixture tests need
`FINAL_STATE_FIXTURES` pointing to the archived previous-checkpoint compilation
artifacts. Export uses `FINAL_STATE_OUT` and the ignored
`export_authenticated_final_state_fixtures` test. Native Executor acceptance uses
`FINAL_STATE_CASE`, `FINAL_STATE_EXPORTED`, `FINAL_STATE_DRIVER` and
`CHECKPOINT_STREAM_DRIVER` with `node --test executor/finalStateStream.test.mjs`.

The next application milestone is **stream-aware market/SD-key/complete UPS**:
freeze this authenticated source scope, bind its exact coverage/ordered roots,
maintain one global settlement cursor and shared-state endpoints, allow the
single-member tail, preserve complete dispositions/refunds, and bind every actual
call/session/fee endpoint. A changed state or unknown broadcast must not start a
replacement set. Old v4 batches cannot be run independently as a substitute.
Then new isolated instances and ordinary-wallet claim/refund acceptance are
required. Orderbook/NFT classifiers and financial integration are not delivered
by this AMM/Curve milestone. Price/time priority and NFT winner semantics remain
unchanged.

Canonical/final history-root delivery, qualified future entropy and proof of
seal-before-release remain separate source dependencies. No Node change is
needed for the implemented conditional state traversal. Strong finality and
unbiased randomness cannot be obtained merely by reading another RPC field.

See [immutable evidence](../../executor/verification/2026-10-29-final-state-coverage-v1/README.md).
