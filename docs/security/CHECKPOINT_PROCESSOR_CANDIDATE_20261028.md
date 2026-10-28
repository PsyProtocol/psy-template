# Claims-first checkpoint processor candidate

## Status and immutable boundary

This implements the business pipeline in the supplied QED diagrams as a new,
**offline-only AMM/Curve candidate**. It does not enable qualified random trading.
The current deterministic contracts, sealed queues and deployed keys are unchanged.
Orderbook price/time priority and NFT winner selection are unchanged.

Application base: `03e75e2dfa33b104fef680569ca0f7fb4a121058`, branch
`markets-batch-capacity-recovery-20261020`. SDK stays at mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`; client/Node source stays at
`b280d714a8f0930c61962c885374ea63ea63d274`; backend stays at
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. No upstream source or dependency changes.
Root is the sole build/proof execution owner. All fixture identities, pool setup,
checkpoint roots and seeds in this milestone are synthetic. There are no RPC,
deployment, registration, faucet, financial or browser-wallet operations.

Native wallet execution rejects policy version 3 before key generation,
registration or transaction preparation. The new Executor planning entry is
prepare-only; authorization invokes the existing closed qualified-source gate.
A caller cannot activate the candidate using an ordinary generator config flag.
The previous scoped-seal component remains a separate conditional component;
its chain-instance/finality/release claims are not authenticated by this processor.

## Implemented flow

1. Ordinary users submit funded limit orders. An explicit sponsor funds commitment
   and maintenance fees. The candidate accepts two to four live, fully funded
   members, canonically stored by user ID; it retains the shared vault.
2. `commit_batch` stores the complete existing order/funding commitment, count,
   cutoff and expiry, and a single draw checkpoint. No previously sealed version
   or artifact is reinterpreted as this layout.
3. `begin_checkpoint_batch` reads that exact draw's checkpoint statistics using
   the existing SDK state command and binds all four seed limbs to the supplied
   arguments. The CFC authenticates the checkpoint path to the UPS checkpoint
   tree. The unlowered source contains a mandatory failing intrinsic assertion;
   only the owned compiler replaces it with the existing opcode and four checks.
4. All funded input assets are claimed in ascending user ID. Zero-funded assets
   are canonical noops: FT claim requires a positive unclaimed delta. Claim masks
   derive from the validated original settlement branch in client and SD-key.
5. Market guards and payouts follow the complete derived permutation. All claims
   must precede any settlement. Reserves or Curve state update sequentially, with
   original full U124 arithmetic, pricing, slippage and refund guards.
6. User fees are claimed last. Completion checks every member's terminal outcome
   and claimed fee cursor. Reward goes only to the key's fixed processor identity.
   `reward + exact burn = member count * user fee`; the complete SD-key binds the
   actual compact stack, session and signature context through the existing code.
7. Proof and state-delta generation use the frozen SDK. Network submission is
   blocked for this candidate. Proof aggregation is not same-pool parallelism.

The logical key has 40 slots and 80 witness Felts. Compact execution removes
canonical noops; it does not remove any accepted member or output. The tested
capacity is not permission to increase the limit by configuration.

## Ordering definition

Using the frozen SDK Poseidon implementation:

```text
domain = [0x50535950524f4331, networkMagic, marketId, batchId]
prefix = H(H(domain, storedBatchRoot), authenticatedCheckpointSeed)
key[row] = H(prefix, [frozenOwner[row], frozenNonce[row], drawCheckpoint, 0])
```

Active rows are sorted lexicographically by all four canonical unsigned 64-bit
hash limbs. Full ties use ascending canonical row/user ID. The circuit decomposes
each limb into u32 halves and excludes the noncanonical Goldilocks alias before
comparison. Active ranks are a complete permutation; inactive rank padding is
identity and inactive order rows are zero. Contract state fixes each member's
position. Reordered, repeated, omitted and extra members cannot finish the batch.

This ranking is deterministic conditional on a seed. Its authentication is not a
proof that the seed was unpredictable or difficult to bias.

## Cancellation, timeout and recovery

Commit and settlement are separate UPSs. Within the settlement UPS, an input
claim, intermediate guard, payout, completion, reward or burn failure rolls back
the entire transition. A successful market trade cannot be undone at its old
price by an unrelated recovery request.

Cancellation after commitment does not rewrite the cutoff snapshot. If the batch
expires before successful settlement, anyone operating the constrained vault key
may advance expiry. That transition atomically retires **every** frozen member's
exact nonce, including members whose refunds have not yet been serviced. The
same user authorization cannot be committed again for another draw. Only a new
user-authorized nonce is a new intent. Retirement is an aborted terminal order,
not a trade or a receipt of funds. Incoming assets remain unclaimed until refund.
Each user explicitly enrolls in recovery. Active canceled orders can recover only when
the vault is idle or expired (phase 0/3/4), never during committed/settling phases.
The existing maintenance stack verifies and returns every still-unclaimed actual
FT/native incoming delta to its sender and consumes the canceled nonce
monotonically. Partial recovery cannot leave the old order executable. Sponsor
authorizations pay the separate recovery UPS costs; lack of gas is an explicit
liveness dependency, not permission to take user refunds or silently expand fees.

Recovery does not pick another seed, change a frozen set, execute a replacement
trade or mark an uncertain broadcast as failed. No live broadcast occurs here;
the existing exact-request journal and unknown-result reconciliation remain
mandatory prerequisites for any future integration.

## What the existing protocol proves, and what it does not

| Property | Candidate evidence / limit |
| --- | --- |
| Read exact checkpoint seed | Existing `GetCheckpointLeafStats` CFC state reader authenticates the leaf and complete stats against the UPS checkpoint tree. |
| Correct complete permutation | Actual market CFC checks full keys, canonical comparisons, complete rank and stored membership. |
| Claims before settlement | Both contract guards and whole-stack SD-key constraints enforce it. |
| Shared-state execution | Sequential updates inside one vault UPS; no claim of same-pool parallel execution. |
| Unique future draw | Snapshot checkpoint + 1 is stored at commitment; settlement cannot substitute another height. |
| Actual sealing before release | **Not proven.** Snapshot + 1 is not actual inclusion + 1. A stale-snapshot commitment may be prepared after the seed is known. |
| Unpredictability / low bias | **Not proven.** The frozen coordinator circuit accepts `final_random_seed_contribution` as a virtual hash and copies it to checkpoint stats. |
| Current-chain instance and finality | **Not established by the synthetic UPSs.** The external checkpoint compatibility blockers remain. |
| Forced service / no withholding | **Not guaranteed.** Another funded executor can take over the same stored state; availability and payment remain prerequisites. |
| Global fairness / censorship resistance | **Not proven.** Only selected frozen members are covered, not every market order. |
| Live qualification | **Disabled**, independently in native wallet and Executor. |

The relevant frozen coordinator code is
`psy_plonky2_circuits/src/coordinator/gadgets/checkpoint_state_transition_proofs.rs`
at the pinned Node commit: `final_random_seed_contribution` is an unconstrained
virtual hash with respect to an entropy-generation protocol. A Merkle proof
authenticates its inclusion, not its unpredictability or bias resistance.

## Concrete external deliveries before enabling qualified randomness

1. **Randomness/protocol owner:** a reviewed, unique-output future-beacon
   definition and verifier inputs binding network, reset-instance, source/key
   epoch, round, seed and release event. Deliver source, fixed verifier resources,
   test vectors and a threat argument for grinding, withholding, multiple valid
   outputs, replay and key rotation. Signatures or timestamps alone are insufficient.
2. **Checkpoint/finality owner:** valid proofs and matching fixed resources for
   the actual running service, binding the same chain instance and finalized
   checkpoint roots. Close the preserved 6085/6086 verification failures with
   reproducible parameters and negative vectors, rather than accepting an RPC
   root or disabling checks.
3. **Seal/release protocol owner:** authenticated evidence that this exact stored
   commitment was actually included before the predetermined beacon release.
   Its specification must exclude stale-snapshot seals, alternate histories,
   late inclusion, producer-controlled clocks and post-release re-sealing. A
   first-inclusion proof plus a separately authenticated release/finality relation
   is one possible design, not an implemented assumption.

Application-owned adapters can verify delivered evidence without changing Node
if the frozen SDK/custom-key proof path can express the reviewed verifier. That
feasibility must be demonstrated against the actual delivered format. No such
adapter or approved source is installed by an opaque hash, a webpage boolean or
an Executor-selected URL. Until all three premises close, qualified mode stays
disabled and ordinary deterministic execution remains available.

## Verification record

### Reproduced Endcap fee defect and application correction

The first complete AMM commitment passed, but its settlement failed in Endcap.
An isolated key proof and a trace using the actual public session context both
passed. That distinction corrected the initial tentative SD-key attribution.
The public diagnosis reconstructs the exact reported conflict:

| Native burn | Hash limb 0 of reconstructed actual stack |
| --- | --- |
| 1,000,031,000 (31 pre-burn words) | 9815864968289840077 |
| 1,000,030,000 (30 final words) | 3240985790704004509 |

The generic frozen SDK fee helper estimates before burning. Here user fees equal
reward plus burn, so the native balance word returns to its starting value and
does not count as a final net change. Endcap correctly requires the burn computed
from final modified words. Its strict stack check rejected the 1,000-unit excess.

The application predicts the restored word, adds the reward outbox word if new,
then proves the exact native burn as an ordinary final call. Immediately afterward
it requires that amount to equal `GUTA_FEE + DA_FEE * actualFinalModifiedSlots`.
All call-stack, session, signature, endpoint, resource and fee checks remain.
Ordinary profiles retain the original SDK path. No SDK or Node code is patched.

The corrected prior candidate completed four synthetic commitment/settlement
UPSs across AMM and Curve, counting the preserved/re-verified original AMM
commitment rather than regenerating it. Those artifacts remain immutable.
The subsequent nonce-retirement fix changes an authenticated function/code root,
so they are historical evidence, not final-code acceptance; the final candidate
is verified separately with fresh complete UPSs.

### Reproduced expiry redraw defect

A real-bytecode regression demonstrated that phase-only expiry allowed the exact
same user nonces to enter a new batch/draw. The candidate-only expiry correction
retires every accepted nonce atomically. The same test then rejects recommit and
checks all accepted nonces are retired. Sender-only timeout recovery, replay and
fee tests continue to pass. Ordinary four-market generators remain byte-identical
to the base commit, including when supplied an attempted processor config flag.

### Final code acceptance and timing

[Evidence index](../../executor/verification/2026-10-28-checkpoint-processor-v1/index.json)
and [machine-readable summary](../../executor/verification/2026-10-28-checkpoint-processor-v1/SUMMARY.json)
identify the exact current artifacts, code roots, SD-key fingerprints, public
account hashes, requests and measurements. The retired-nonce version passed four
fresh complete UPSs: AMM commit/settle and Curve commit/settle, with four members
and four synthetic fills per market. Both CM verification and the pinned SDK
Endcap verifier/common data passed. All exported state deltas matched the VM and
linked the exact proven endpoints; altered nonce metadata rejected.

| Market | Resource construction (s) | Commit UPS (s) | Settle UPS (s) | Actual calls commit / settle | Final settle words | Settle burn (native units) |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| AMM | 93.400 | 40.047 | 171.536 | 3 / 24 | 30 | 1,000,030,000 |
| Curve | 84.227 | 36.859 | 189.288 | 3 / 28 | 29 | 1,000,029,000 |

One final process run took 620.508 seconds, including setup, resource construction,
proofs, verification, export checks and compiled recipient claims. Its sampled
process-family RSS peak was 1,834,768 KiB. Hardware: Apple M1 Max,
MacBookPro18,2, 32 GiB RAM, ten logical CPUs; Rayon and Cargo jobs were both two.
SDK/application compilation is outside this execution measurement and retained
separately in build logs. The SDK dependencies were already built.

AMM resource construction is first in the new process. Curve constructs new
market resources later in that same process, after global caches have warmed.
Commit and settlement reuse their manager/key resources but have different call
shapes; these are **not** a controlled same-task cold/warm comparison. Call-step
times combine CFC, UPS recursion and compression. Settlement Endcap proving and
verification took 83.961 seconds for AMM and 91.902 seconds for Curve; those times
are already inside settlement totals and must not be added again. No matched
deterministic-versus-checkpoint performance experiment or reliable p95 exists.
Confirmation, ordinary-wallet proof/receipt latency and chain TPS are unmeasured.

Eleven JavaScript checks and four current bytecode tests passed. The client/host
and bytecode checks jointly exercise two/three/four-member AMM/Curve settlement,
bad root/seed/rank/count or fee inputs, whole-transition rejection, replay,
actual recipient claims, explicit
expiry/cancellation/sponsorship/refund, wrong refund recipient, refund replay,
same-nonce redraw refusal and the final-word fee regression. The standalone seed
CFC probe passed on its preserved earlier artifact; current complete UPSs execute
the same intrinsic with the final authenticated code/function roots.

Recipient claims and timeout/refund transitions in this milestone are real
compiled bytecode execution, **not ordinary-wallet or recovery UPS proofs**.
There are zero real-network fills, registrations, deployments, submissions or
fees. The native live guard was source-reviewed; actual browser-extension
acceptance for this candidate was not attempted. The four ordinary market
generators remain byte-identical to the base commit. No throughput, general
acceleration, global fairness or production-readiness conclusion follows.

All failed
attempts, build/proof parameters, candidate artifacts, measured process-family RSS
and public proof/request outputs are retained. Sampled family RSS includes shared
pages and is not a physical-memory peak. Offline proof time is not confirmation,
wallet receipt, chain TPS or a deterministic-versus-random speed comparison.

Full-UPS, ordinary-wallet, network and browser claims remain separately identified.

## Source map

- [Candidate generator](../../batching/checkpoint-processor/generate.mjs)
  and [frozen-native policy](../../batching/checkpoint-processor/policy.mjs).
- [Owned source intrinsic/compiler](../../amm/u124/vm-tests/src/checkpoint_processor.rs)
  and [whole-stack key/final-fee helper](../../amm/u124/vm-tests/src/processor_policy.rs).
- [Prepare-only Executor entry](../../executor/checkpointProcessor.mjs).
- [Bytecode, fee, redraw and complete-UPS tests](../../amm/u124/vm-tests/tests/support/checkpoint_processor.rs).
- [Public fee-stack diagnosis](../../amm/u124/vm-tests/src/bin/diagnose_processor_fee.rs).
- [Reproduction and archive rules](../../executor/verification/2026-10-28-checkpoint-processor-v1/README.md).
