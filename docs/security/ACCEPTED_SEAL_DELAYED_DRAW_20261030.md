# Accepted seal and fixed delayed draw

## Scope and current decision

Work continues on `markets-batch-capacity-recovery-20261020`, from application
`5cfd4881386fca81c2e235abfff970c4a9f0ff99`. The SDK stays at mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, consumed Node/client source
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. No dependency, Node, old contract,
wallet identity, active queue or original evidence is changed. Root owns the
single proof worker. No registration, funding, financial broadcast or live fee
is authorized by these offline results.

This is a distinct **v13** candidate for AMM and Curve. Existing v11/v12 fixtures,
keys, proofs and S+1 queues are retained as their original versions. Historical
proof counts do not establish new-key acceptance. Orderbook price/time priority
and NFT buyer/unique-sale rules are unchanged.

The application can enforce **S < C < D within the same signed checkpoint
history**, where S commits the original complete account-state source, C contains
the actual accepted stream seal, and D is fixed to S+32 by new bytecode/key.
That closes a conditional history-order gap. It does **not** authenticate that
the producer first learned the seed after C, select the canonical finalized
history, or convert the existing producer-selected seed into an unbiased beacon.
Random production authorization and qualified randomness remain false.

## Code and protocol

- [Generator](../../batching/checkpoint-stream/sealed-generate.mjs): a new state
  field `stream_seal_checkpoint`; ten-input `begin_order_page` instead of nine;
  one fixed D=S+32; C is stored on first seed installation and immutable for the
  epoch. Existing queues are never silently migrated.
- [Accepted-seal constraints](../../amm/u124/vm-tests/src/stream_seal.rs): same
  session history root as S and the CFC's D, genesis anchor, dependency
  code/layout/function roots, vault/key, authenticated market state words,
  original source account root, epoch, expiry, and unseeded/idle stream phase.
- [Spending key](../../amm/u124/vm-tests/src/stream_policy.rs): v13 profile,
  actual ordered stack, ten method arguments, caller, session/sig_hash, current
  dependencies, fee cap, native fee claim/burn and state endpoints remain bound.
  Every build/extraction page supplies the same accepted seal; settlement
  inherits the stored seed and complete queue, without resampling.
- [Public planner](../../amm/u124/vm-tests/src/bin/minimum_stream_plan.rs):
  v13 requires an explicit accepted-seal opening under the same pinned history;
  missing/foreign openings cannot be treated as successful native preparation.
- [Executor preparation](../../executor/randomSourceStream.mjs): seals the
  accepted-seal input digest with the original snapshot, draw, dependencies and
  driver. Recovery replays exact inputs into a fresh directory; a same-epoch
  replacement conflicts. This preparation API cannot sign or broadcast.
- [Plan/budget checks](../../executor/sealedMinimumSourcePlan.mjs): preserve
  exact complete source, canonical insertion and head extraction, seed,
  permutation and queue continuity; reserve the fixed draw delay explicitly.

Rank-v1 hashes intentionally retain `S+1` as their existing domain word. It is
**not the v13 draw checkpoint**. Actual D=S+32 is independently enforced by
bytecode, the new spending key and the CFC checkpoint read; their code/layout/key
identities are themselves bound. No ABI-compatible address substitution is used.

The set bound at C is the immutable full source-account root at S plus source
scope/market identities. Coverage subsequently reconstructs that root and derives
the exact trading/refund manifests. This is finite final-state completeness,
not a proof that every transaction or every market request was admitted.

## Recovery and fairness boundary

Before draw installation, expiry returns the original source members' actual
funds through the original refund path; it cannot trade in an arbitrary
alternative order. After installation, only the original seed, queue and cursors
can continue. Cancellation and slippage preserve existing rules; completed
market trades are not reversed at historical prices. Any executor may construct
a valid continuation using the same public data, but execution requires its
actual remaining owner-authorized fee budget and network admission. No protocol
can force an absent executor to provide service. Local journals/locks do not
establish cross-machine coordination.

## Required external delivery

| Owner / capability | Concrete delivery | Acceptance requirement |
| --- | --- | --- |
| Running prover / release owner | Current transition proof bytes and reproducible public resource manifest: source revisions, compiler/features, network magic, genesis/validator rotation/epoch inputs, final verifier and common-data hashes | The unchanged frozen verifier must actually accept the exact bytes; a decoder roundtrip or ABI match is insufficient. If this cohort is incompatible, report that boundary instead of changing SDK/config/keys to obtain acceptance. |
| Consensus / finality owner | Fixed verification resources and a canonical anchor plus finality/append-range witness binding chain instance, checkpoint index/hash, history root and accepted seal C | Reject forks, old instances, false indices, substituted start anchors and non-final results. Repeated RPC replies are not finality evidence. |
| Randomness protocol owner | A specified unique-output future source, fixed verification key/round, unpredictability and bias/withholding analysis, authenticated release protocol | Bind the batch/epoch and source round before release; reject alternative rounds/seeds, historical results, retries, grinding and post-release admission. A producer signature or Merkle inclusion alone does not qualify. |
| Cross-source integration owner | A verified seal-acceptance-before-release relation, with C's finality linked to the exact release certificate | A stalled chain must not accept a seal after an external beacon has already released its result. Checkpoint height and block time alone do not establish this relation. |
| Test funding operator | Original faucet request's receipt/transaction identity or definitive rejection/disposal, or separately authorized fresh funding tied to the current verified identity | Preserve the original request/send lock. No automatic resend, substitute financial request, or inference of disposal from a zero observed balance. |

An external randomness/finality adapter may be implemented in application/SD-key
recursion without a new Node opcode, **after** its protocol and fixed resources
are supplied and reviewed. The application cannot manufacture those guarantees
by hashing the present producer seed, local randomness, timestamps or signatures.

## Evidence status

The bounded run and audit results are recorded in the case bundle and updated
below after validation. Keep synthetic bytecode/UPS verification, live network
confirmation, ordinary wallet proof/claim and actual browser acceptance distinct.
The original root-metadata rejection failure is retained: a serialized `root`
field did not alter the gadget's recomputed root. The corrected oracle changes
the authenticated path to a coherent foreign history, while host checks also
reject inconsistent serialized roots. This is not evidence that the old circuit
accepted a foreign signed history.

Current network observations: seven read-only RPC calls succeeded around heads
18505/18506 and retained matching CP1/native identities. Two bounded attempts to
download current proof pairs did not complete; the second preserved 622592 bytes
and curl timeout 28 at 25 seconds. These partial bytes were not decoded or
verified. Splitting the same pair into two bounded reads completed: checkpoints
18504 and 18505 are each 130328 bytes, SHA256
`caf28f81044ec8a7ae1bb842f4225ca2e0c9fe2dc55cf9707f08940292712f9e` and
`19b69db6ffe0d2d09c1e60e14a692cbda90d8e8afa2a8080f4f85c4fe2ad5b0c`.
The first local invocation omitted the required profile environment and stopped
at its guard; that failure was retained. Offline replay of those exact saved
bytes with the original frozen environment independently ran the SDK borrowed
and application-owned verifiers. Both reject both proofs at
`vanishing_polys_zeta[i] == z_h_zeta * reduce_with_powers(chunk, zeta_pow_deg)`.
Strict and SDK decode/roundtrip agree exactly. No alternative verifier, key,
network configuration or SDK was installed. Live deployment remains closed.
Earlier 6085/6086 and 17737/17738 remain their separate historical captures;
failure attribution still needs the running prover's reproducible public cohort.

## Completed offline acceptance

[Public evidence index](../../executor/verification/2026-10-30-accepted-seal-delayed-draw-v1/index.json)
and [summary](../../executor/verification/2026-10-30-accepted-seal-delayed-draw-v1/SUMMARY.json).
Case directory: `minimum-sealed-draw-20261030-v1` under the existing durable
market-recovery directory. Original failed attempts and snapshots remain there
and in the allowlisted public archive. No private keys, secret signing witnesses
or wallet recovery material are included.

| New v13 evidence | AMM | Curve |
| --- | --- | --- |
| Source / accepted seal / fixed draw | 101 / 102 / 133 | 101 / 102 / 133 |
| Source accounts / trading members | 8 / 5 | 8 / 5 |
| Coverage, minimum build/extraction, settlement | 2, 4+1 / 4+1, 4+1 | 2, 4+1 / 4+1, 4+1 |
| Complete synthetic UPSs under actual new key and fixed Endcap verifier | 13, including three unseeded timeout/refund UPSs | 10 |
| Synthetic fills / normal refunds | 3 / 2 | 3 / 2 |
| Ordinary claim bytecode checks | 15 asset/owner rows, 6 nonzero | 15 asset/owner rows, 9 nonzero |
| Aggregate synthetic Native fees, including separate recovery branches | 13,000,230,000 base units | 10,000,129,000 base units |
| Real broadcasts / signed ordinary-wallet claims | 0 / 0 | 0 / 0 |

The key fingerprints are
`6aa163a6b40e8d990c1a7d2c7cda32bfe12d49e799d259782413ba69b58e7ac7`
(AMM) and
`a7d79c64d9d9736ebf81417cbe5d62deb5e5fc75f75755fafac0da57b613dc93`
(Curve). Neither is an approved live deployment identity.

The full test checks complete calls, signature/session binding, both state
endpoints, linked vault leaf chain, actual Native fees, U124 FT conservation,
refunds and terminal consumption of every member. A structural audit separately
checks public request/session/fee/continuation consistency; it is not another
cryptographic verifier. Native and Executor planning exercise both actual owned
CLI binaries, exact restart persistence and same-epoch seal replacement refusal.
The budget test deliberately returns **not feasible** for the fixture's short
99-checkpoint user deadline under its supplied 90-seconds-per-UPS / one-second
checkpoint assumption. It is not a live funding/admission approval.

Accepted-seal negative checks distinguish missing/inconsistent public metadata
(host rejection) from coherent wrong-history, wrong-chain, wrong-epoch and C=D
assignments rejected by the actual spending circuit. Actual bytecode replay also
rejects altered seed, altered D, C=D, cross-page C replacement and page replay,
with unchanged state on failure. Saved-key replay verifies the exact existing
proof, requires a successful reconstruction of the **saved explicit session
checkpoint**, and then rejects coherent reordered, omitted and duplicate member
stacks. These are raw-key controls, not additional CFC or complete UPS proofs.
Historical replay reports are retained and not relabeled under this stronger
positive-control harness.

### Measurement scope

The complete two-market run takes **2033.35 seconds**; sampled process-family RSS
peaks at **1,957,744 KiB**. Sampling is once per second, includes shared pages and
allocator-retained pages, and is not a measured physical-memory peak. Resource
cold builds are **133.12 s AMM / 112.13 s Curve**. Mixed-stage complete UPS elapsed
ranges are **39.08–240.52 s AMM / 38.58–215.71 s Curve**. Each original sample,
failed run and build is retained. Signature-only replay is measured separately.

These are synthetic offline checks, not network confirmation or final-receipt
measurements. Checkpoint jumps and timeout forks are synthetic; real protocol
waiting is not represented by elapsed proof time. Compilation, RPC diagnostics
and small independent checks overlap parts of the run, so this is not an
isolated performance comparison. There is no same-condition deterministic/v13
speedup result, p95, steady-state throughput or chain TPS claim. Phase durations
must not be added when they overlap.

## Reproduction and remaining work

1. Verify the frozen dependency manifest with
   `batching/dependencies/prepare_mainnet_beta_application.py`; preserve each
   application snapshot and locked Cargo resolution. New source generation uses
   the recorded SDK-derived minimum constants, not placeholder zero roots.
2. Generate **new** v13 artifacts with `generateSealedMinimumStream`, compile with
   the owned `compile_minimum_stream` intrinsic-aware compiler, and derive policy
   with `{random:true, minimum:true, bootstrap:true, sealed:true, window:8192}`.
   Do not reuse a v12 layout, ABI or key as v13.
3. Build `batch_lifecycle` with the recorded frozen profile, release mode,
   `nightly-2025-09-20`, offline/locked dependencies and two Rayon threads. Run
   `sealed_history_random_full_ups --ignored --nocapture` into a fresh directory.
   The unqualified short name must match one test; a zero-test filter is not
   acceptance. Public recipes, binaries' SHA256s and application manifests are
   archived; binaries themselves are not uploaded.
4. Use the saved calls for `sealed_draw_bytecode_replay_and_rejections`, and saved
   complete evidence for `stream_key_exact_replay_and_coherent_priority_attacks`
   with replay label `sealed-settle-0`. The latter must pass its exact positive
   witness before rejecting alternatives.
5. Native planning requires S, C and D under the same supplied history. The
   synthetic derivation helper reconstructs checkpoint leaves chronologically
   and refuses a different reconstructed root; it is not an RPC finality tool.
   Use a head after D for its historical D opening. Executor preparation preserves
   all input hashes and reserves 32 checkpoints plus one historical-opening step.

Still open: unpredictability/bias resistance, authenticated seal-before-release
causality, canonical finality/admission, compatible running proof resources,
original funding disposition, v13-specific fresh registration/initialization,
real settlement, ordinary signed wallet claims and UI acceptance. Prior v12
startup evidence does not cover the new v13 key/layout. Excess pre-activation
deposit recovery and live LP admission remain separate prerequisites as recorded
in the v12 report. No RPC-observed state, ACK, generated proof or VM claim is
presented as a confirmed live trade. Global admission fairness, forced service,
cross-machine failover and production readiness are not established.
