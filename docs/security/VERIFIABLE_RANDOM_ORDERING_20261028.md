# Verifiable random ordering: source preflight — 28 October 2026

## Scope, owner and frozen release

Application starting commit `ee60c9235fe8d2c80c26ea0d70270a9ed56fcfae`, existing
`markets-batch-capacity-recovery-20261020` branch, clean working tree. Process
inspection found no active market financial, compiler or proof task. Root remains
the sole financial/proof owner; existing UI and read-only services are untouched.
SDK remains `c92880c8b6e2c8d392f19368bc8801a2584fd427`, node/client source
`b280d714a8f0930c61962c885374ea63ea63d274`, and the selected proof backend remains
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. No Node or SDK source/pin changes.

In scope: AMM/Curve ordering preflight, versioned candidate statement/permutation
constraints and rejection interfaces that can be independently checked without a
qualified beacon. At most four members; existing shared vaults, U124 arithmetic,
pricing and refund semantics remain unchanged. Orderbook and NFT semantics are
not randomized. Out of scope until dependencies close: enabling a random market,
new random vault/key deployment, full random-market UPS or live settlement.

This phase has zero financial operations, registrations, grants, deployments,
fees or assets budget. It may run bounded offline statement/permutation tests,
with no business UPS or browser task. The original unresolved faucet and its
single-send lock are unchanged. Old contracts and original evidence are intact.

## Code-based capability table

Links refer to the frozen source, not an assertion of current running services.

| Question | Evidence | Verdict |
| --- | --- | --- |
| Where does checkpoint entropy originate? | [`coordinator_guta_update_gatherer.rs:39–43`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_node_common/src/coordinator/processor/gatherers/coordinator_guta_update_gatherer.rs#L39): `rand::thread_rng().fill_bytes`; invocation at 476 | Coordinator-local sampling; no qualified market beacon. |
| Is it durable across normal backup replay? | Same gatherer: backup reader 146–165 and writer 476–499 | A stored backup carries its chosen seed. Durability does not constrain initial choice or prove inability to regenerate before publication. |
| How does it reach checkpoint stats? | [`coordinator_output_builder.rs:341`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_node_common/src/backup/output/coordinator_output_builder.rs#L341) uses `random_seed_guta` | The producer-selected value becomes the recorded field. |
| Does the transition prove an unbiased/unique contribution? | [`checkpoint_state_transition_proofs.rs:83–100`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_plonky2_circuits/src/coordinator/gadgets/checkpoint_state_transition_proofs.rs#L83): virtual hash copied to new stats; witness set at 151 | No VRF/threshold contribution/unique-output verification found in this path. Hashing or recursion does not establish entropy quality. |
| Can a contract authenticate a historical recorded seed? | [`state_readers.rs:1589–1631`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/client_prover/psy_circuit/psy_dpn_circuit/src/vm/gadgets/state_readers.rs#L1589): index, current checkpoint root and stats/state hashes are constrained; seed limbs returned | Historical inclusion relative to the session checkpoint tree exists. It is not a beacon uniqueness, external finality or unpredictability certificate. |
| Is chain instance / round / finality certified together? | The stats reader authenticates checkpoint membership; no market beacon domain/round/finality statement in that interface | Missing dedicated source/domain/finality contract. Existing UPS network magic alone is insufficient. |
| Was the set fixed before the draw was knowable? | [`batching/admission/generate.mjs:55–61`](../../batching/admission/generate.mjs) seals queue root/count and binds members to batch | Current deterministic queue commitment exists. No future draw/source/round or proof of sealed-state inclusion before draw is bound. |
| Can it safely be activated now? | Existing admission generator rejects random mode; Executor accepts only reviewed profiles | No. Preserve deterministic mode. |

The older client-side checkpoint data helper also hashes a contribution with the
old seed (`client_prover/psy_core/psy_data/src/protocol/circuit_inputs/checkpoint_transition.rs:83`).
That is not a uniqueness or unpredictability proof either. It must not be used to
infer a guarantee absent from the actual source and circuit path.

**Inference:** a producer controlling the supplied virtual contribution can try
multiple candidate seeds before publication. A valid checkpoint proof authenticates
the selected result, not that it was the only attempted result. No network attack
or live grinding experiment was performed. Running image/commit, initial entropy
handling and withholding resistance are not attested by this source inspection.

## Threat model and the seal-inclusion requirement

Adversaries include a grinding/withholding producer, a selecting or abandoning
Executor, conflicting Executors, a malicious submitter and stale/wrong-chain RPC.
A compromised admitted identity can submit a slippage-constrained order or fail
to fund it; it must not choose its position after seeing the draw.

A future checkpoint number alone is insufficient. An Executor could see a seed,
then generate a seal UPS using an older source checkpoint and broadcast it late.
`ctx.checkpoint_id` is the proof's source context, not proof that the seal was
included at that wall-clock time. Activation needs authenticated inclusion of the
exact sealed state at a fixed finalized checkpoint strictly before the source's
unpredictability boundary. Historical absence is not a cancellation/escape proof.

The following must be committed before that boundary: version, network magic,
genesis/chain instance, market kind and ID, vault, code/layout/function roots,
SD-key fingerprint/public key, epoch, cutoff, full canonical member set and terms
hashes, count/queue root, beacon source identity, round and draw checkpoint,
seal-inclusion deadline, settlement deadline, recovery point and fee cap.
Legacy sealed queues cannot be reinterpreted as random batches. New code/layout,
key and instance acceptance are required; no old contract is updated to probe it.

## Source-provider deliverables and acceptance

Upstream/source maintainers must supply the following public interfaces and tests;
these are requirements, not methods assumed to exist in the current SDK:

1. A versioned, domain-separated beacon statement with source/key identity,
   exact chain instance, fixed round and draw checkpoint, output and proof bytes.
   Fixed verified keys/common data must be application-owned. An Executor signature,
   RPC `verified` flag, caller-provided verifier or external resource URL is invalid.
2. A circuit-verifiable unique-output proof (or an explicitly reviewed equivalent)
   and security analysis showing unpredictability at the seal boundary and a
   quantified bias/withholding model. One valid output per committed source/round;
   no selectable participant subset, optional reveal, reroll or alternate checkpoint.
3. A verifiable checkpoint/finality opening binding genesis, sealed contract state,
   its actual inclusion checkpoint and the chosen draw to one finalized history.
   Mere membership in an arbitrary supplied root or a signed seed is insufficient.
4. Source availability and delay semantics, key rotation boundaries and rejection
   rules for duplicate/conflicting certificates, old domains and historical rounds.
5. Adversarial vectors for forged proofs, wrong key/domain/round, two alleged valid
   outputs, producer grinding, reveal withholding, late seal inclusion and finality
   rollback. Release exact proof format, verifier/common digests, source code and
   independent review. SDK integration must be tested against the frozen cohort;
   changing dependencies is a separate user-authorized task.

There is currently no approved source adapter. No combination of a nonzero
`random_seed`, Merkle path and signature closes these requirements.

## Protocol boundary and implementation sequence

```text
collect -> seal exact set and draw request -> prove pre-draw seal inclusion
        -> wait for the one certified/final draw -> freeze full permutation
        -> settle in that order -> terminal outcomes
                     | unavailable / expiry / executor exit
                     +-> preserve set, request, seed if known, and permutation
                         -> governed refund/recovery; never reroll or reselect
```

1. Publish this source/threat assessment first, with frozen source hashes.
2. Add an independent candidate statement encoder and full-permutation constraint
   at current capacity. Bind all scope fields and full order identities; define
   canonical integer/hash ordering, domain separation and total tie rules.
3. Harden builder/client/Executor refusal of unreviewed random source/configuration.
   Implement certificate envelope validation without treating parsing as verification;
   with no approved source, execution remains rejected.
4. Test fixed-set mutation, fake certificates, history/round substitution, missing/
   duplicate/extra members, ties, deterministic restoration and restart identities.
   Run actual bounded permutation circuit proofs only if source-level review passes.
   They establish a component property, not beacon authentication or full market UPS.
5. Only after source and seal-inclusion delivery: new contract layout and key with
   the state machine, full CFC/UPS/call-stack and sequential U124 state verification,
   new-instance settlement/ordinary claim/refund/recovery, then matched performance.

AMM/Curve sequentially update shared reserves/curve state in the fixed permutation.
Slippage or invalid funding takes the specified refund disposition at its position;
it is not an excuse to omit the member. Book retains price/time priority and NFT
retains its unique-sale and buyer priority; neither is shuffled by this protocol.

## Cancellation, fees and liveness boundary

A permissionless relayer may advance a valid phase, paying its authorized fee or
using a consented sponsor. No phase transition may infer fresh fee credit from an
unclaimed Outbox. Shared vault/account nonce coordinates competing Executors;
a stale or unknown broadcast is reconciled by original request identity, not
replaced. After a confirmed phase, another Executor must use the same set/source/
round/draw/permutation. A losing Executor cannot consume another nonce as a reroll.

Pre-seal cancellation follows the accepted consent rules. After seal, each member
must reach a defined fill/refund/legal terminal outcome; cancellation must not
change the frozen set. Source lateness or executor abandonment must have a
contract-authorized timeout refund path with the original commitment, plus a
monotonic consumed epoch/order nonce. No deterministic fallback or random re-seal.
Already completed trades return actual remaining/intermediate assets, not a
fictional reversal at the original price. These new random-mode contract paths
are not deployed or accepted by this preflight.

The application cannot force a producer to publish, a relayer to pay fees or an
unfunded sponsor to act. A unique seed plus refunds prevents changing the outcome
of the same sealed batch, but cannot by itself eliminate selective service,
strategic abort/re-entry in a later epoch or withholding losses. Admission outside
the sealed finite queue remains unauthenticated discovery: no global inclusion,
censorship resistance or comprehensive anti-MEV claim. Proof aggregation is not
same-pool parallel execution.

## Measurements and evidence status

No new proof, full UPS, settlement, claim, confirmation, fee or cold/warm sample
has been run at this preflight stage. Random-versus-deterministic full-market
cost and protocol waiting comparisons are **not measured**. Upcoming component
proof timings must not be labeled live market throughput or chain TPS.
