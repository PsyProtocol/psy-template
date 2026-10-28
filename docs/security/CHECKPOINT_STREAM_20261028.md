# Whole-checkpoint inclusion and continuous processing: component milestone

> 29 October update: the user approved final current-order state at a source
> checkpoint. Conditional authenticated state coverage is now implemented for
> AMM/Curve; see [the new milestone](FINAL_STATE_COVERAGE_20261029.md). The text
> below records the original 28 October component boundary. Financial stream
> settlement remains disabled.

## Current status

This milestone removes the four-member limit from **conditional ordering
preparation**, not from live market settlement. A nine-member finite set now has
one manifest/seed and three cryptographically linked ordering pages (4 + 4 + 1).
All pages must verify before the ordered-root result is accepted. Native and
Executor resume reuse exact saved proofs instead of selecting new members or
new seeds.

**Whole-block admission, stream-aware market/SD-key execution and complete
financial UPS acceptance are not complete. Both financial gates remain closed.**
The existing v4 AMM/Curve contracts and keys still accept only their own bounded
batches. Running those batches independently cannot establish global ordering.

Base: `78a51cd32d3c6736ae1889822997f41e7a4d90e0`, branch
`markets-batch-capacity-recovery-20261020`. SDK remains mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`; client/Node remains
`b280d714a8f0930c61962c885374ea63ea63d274`; backend remains
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. No dependency changes, RPC, finance,
deployments, wallet/UI changes or old-artifact replacement occurred. Root owns
native execution. The declared proof budget allowed three component proofs,
then an explicit zero-finance supplement allowed one missing-page integration
proof. Existing proofs were reverified, not regenerated for the final checks.

In scope: finite-set commitments, global permutation proof pages, original-scope
and endpoint continuity, bounded strict native decoding, persistent proof
ownership, restart reuse, negative tests and a precise block-coverage boundary.
Out of scope for the delivered component: authenticated block classification,
market pricing/cursor atomicity, market keys, Endcap/UPS execution, ordinary-wallet
claims, refunds and network confirmation. No standalone ordering proof supplies
any of those capabilities.

## Inclusion requires a defined scope

The frozen SDK checkpoint structures expose global state roots and
statistics, including `total_transactions` and `random_seed`. A transaction
count is not a complete transaction commitment or a market classification proof.
Neither `GetCheckpointLeafStats` nor `GetGlobalStateRoots` alone proves that a
Bot did not omit an order. The inspected command matrix does not provide a
complete authenticated per-market block transaction list.

Code references at the frozen client/Node revision:

- `client_prover/psy_core/psy_data/src/qdata/checkpoint.rs`,
  `PsyCheckpointLeafStats` and `PsyCheckpointGlobalStateRoots`.
- `client_prover/psy_vm/src/dpn/ops/state_cmd/data.rs`,
  `DPNStateCmd::get_checkpoint_leaf_stats`, `get_global_state_roots`, and the
  read-command matrix. This is source inspection, not a live RPC capability test.

There are two different product scopes:

| Scope | Consequence |
|---|---|
| Final order state at the source checkpoint | Existing market storage has one current order per owner. A complete authenticated account/state traversal and a reviewed final-order predicate could supply coverage without changing Node. That traversal/classifier is application-owned work not implemented here. |
| Every order/change/cancel transaction in the block | Final state may overwrite intermediate orders. An RPC list or final-state scan cannot recover and prove every intermediate event. A complete authenticated transaction/event transcript and classification proof is required; this frozen bundle has no installed verifier for it. |

The user was asked to choose the intended scope. This is a business-definition
question, not a request for keys or permission to spend. The implementation does
not silently reinterpret the latter scope as the former. It also does not assert
that Node must change: an upstream proof/transcript delivery or a separately
implemented authenticated state traversal may be possible, depending on scope.

The existing producer-influenced seed model remains explicit. The new component
only binds supplied seed/scope values; it does not authenticate a checkpoint,
finality, entropy or pre-release sealing by itself.

## Implemented ordering protocol

```text
source coverage [NOT INSTALLED]
          |
one canonical manifest: identity + source + terms hashes + total count
          |
one original root and seed
          |
page 0 -> page 1 -> ... -> final page
  source membership + unused source index
  strict global key order, including the previous page's last key
  next ordered-tree position + exact cursor/root continuation
          |
complete verified ordering bundle
          |
stream-aware market/key/UPS [NOT INSTALLED]
          |
market settlement -> receipts -> claims/refunds [NOT EXERCISED]
```

[`checkpoint_stream.rs`](../../amm/u124/vm-tests/src/checkpoint_stream.rs)
owns the Poseidon commitments and proof circuit. Scope fields bind version,
frozen network magic, market type/ID, vault, epoch, source/expiry, total count,
chain-instance/source commitments, manifest root, producer seed and
code/layout/key/function identities. These are constrained public inputs,
**not externally authenticated identity certificates**.

Members are canonical unique ascending owners with a nonce and complete terms
commitment. This follows the existing one-current-order-per-owner storage model;
it is not an arbitrary transaction-history representation. The manifest leaf
excludes the manifest root and seed to avoid a circular root definition. The
global sorting key commits the entire final scope, seed, original index and
member. Full key ties use owner, nonce and original index.

Each page has at most four active rows. Only the terminal page may be short.
Every active row proves membership at an index below the committed count. A
sparse seen-index tree requires the old index value to be zero before marking it
used, preventing reuse across pages. A separate ordered tree appends at the exact
next cursor. First-page roots and the preceding key are constrained to their
initial values. Linked proof endpoints carry both trees, cursor and last key.

`verify_chain` requires the complete canonical page sequence and terminal count.
Only checking one valid page is insufficient. The result is a verified proof
bundle, not a recursively aggregated market proof or a settlement receipt.
The 24-level tree is a representation bound, not acceptance at millions of orders.
Host preparation was checked through 65 members; actual proof acceptance here
uses nine. No large-capacity throughput claim is made.

## Native and Executor ownership/recovery

[`checkpoint_stream` CLI](../../amm/u124/vm-tests/src/bin/checkpoint_stream.rs)
has only `prepare`, `prove` and `verify`. It has no wallet, signing or RPC action.
Reads are bounded before decoding. Proof decoding is fixed-integer, size-limited
and rejects trailing bytes. Exact validated preparation bytes are retained and
copied, with a final saved-byte check before success; changing an input during
verification cannot silently produce mismatched saved preparation and proofs.

Native proving creates an exclusive durable owner file before any proof work.
Existing page proofs are checked against the exact page and fixed code-derived
verifier; missing pages alone are generated. An interrupted owner is not
automatically replaced. Its file and process must be inspected before recovery.
There is no financial/account unlock operation. A successful run removes its
own owner file only after complete verification and persistence.

[`checkpointStream.mjs`](../../executor/checkpointStream.mjs) captures the source
input, seals the configured native binary by reviewed SHA256 and reuses the
existing journal lock in a separate **offline component** namespace. It pins
manifest/page digests and reports preparation progress separately from the
settlement cursor, which remains zero. Its public API has no payment callback.
The two gates in [`coverage.mjs`](../../batching/checkpoint-stream/coverage.mjs)
reject whole-block authorization and stream settlement, including claimed
`verified` flags. UI and ordinary market routes are unchanged.

The local lock/ownership tests do not establish cross-machine coordination.
Exact component-proof reuse does not establish reuse of an old market state
proof, balance, nonce or signed financial request.

## Acceptance and measurements

- Three original page proofs cover nine members, including a one-member tail.
  Actual bad membership and wrong-order witnesses were rejected by the prover.
- Scope substitution, omitted/duplicated pages and early completion were rejected.
  A separate test demonstrates the boundary: removing an order and rebuilding
  an untrusted manifest gives a different valid manifest, not a block-coverage
  certificate. The missing source gate is therefore essential.
- The actual native Executor path reused two pages and generated the missing
  tail once. Restart reused all three. Final integration reused every proof;
  two same-machine contenders had one winner, an existing native owner blocked
  another run, and an appended proof byte was rejected by strict decoding.
- Three final host tests and three new JavaScript/native integration tests passed;
  47 existing market-route/configuration JavaScript regressions passed unchanged.

The standalone circuit built in 0.167 seconds and each original page's prove plus
verify path took 0.370, 0.347 and 0.411 seconds. The bounded observer recorded
2.077 seconds for that process and sampled family RSS peak 141,008 KiB. The actual
initial native integration process took 3.103 seconds, final reuse/competition
integration 3.097 seconds. These are tiny nonfinancial ordering components,
**not market CFC, signature, Endcap, confirmation, claim or throughput timings**.
They cannot be compared to the earlier complete market UPS timings as a speedup.
Sampling at one-second intervals can miss short peaks; the host-only test's
32 KiB sample is not a useful memory measurement. RSS also includes shared pages
and is not a physical-memory peak. No p95 or steady-state claim is made.

Evidence, exact source/binary digests and reproduction instructions are in
[`2026-10-28-checkpoint-stream-v1`](../../executor/verification/2026-10-28-checkpoint-stream-v1/README.md).
One test launch used the wrong executable filename and failed before starting
the binary. Its failure is retained; it is neither a pass nor a security rejection.

## Remaining delivery and acceptance requirements

| Work | Owner / required delivery | Executable acceptance |
|---|---|---|
| Final-state coverage | Application-owned authenticated full account/tree traversal; historical roots, exact source snapshot and reviewed order/funding/cancellation classification. | Omission, skipped subtree, wrong old/new root, forged term and incomplete traversal rejection; exact complete manifest bound to native checkpoint evidence. |
| Full event-history coverage, if selected | Source team supplies committed operation/event root, canonical count/indexing, complete witness format and fixed verifier/common data; application team integrates classification. | Verify every classified/excluded event against the same source commitment; reject omitted events, duplicate indexes, rewritten roots, wrong instance/checkpoint and reordered history. |
| Market/SD-key integration | Application-owned new contract/key, with global ordered root and cursor bound to actual market calls, fixed source and fees. Do not reuse independent v4 batch seeds. | Cursor advances in the same UPS as the corresponding settlements/refunds; wrong page/order/identity and tail failures leave state unchanged; correct handling of the one-member tail. |
| Recovery and financial conservation | Application-owned per-page exact requests, nonce/state dependencies, original-identity reconciliation, expiry and actual-asset refunds. | Complete multi-page UPS chain, restart/lost receipt, competition, cancellation, insufficient gas and partial completion; no duplicate payment or skipped refund. |
| Live acceptance | Fresh authorized instances and complete preflight after the above gates. | Real market settlement, receipts, ordinary-wallet claims/refunds and fees; preserve original failures and all measurements. |

No market mechanism, shared-vault model, pricing, deterministic default,
Orderbook matching rule or NFT uniqueness rule was changed by this component.
