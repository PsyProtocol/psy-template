# Randomness, finality and causal sealing without Node changes

## Decision and frozen scope

Application base `a13aaae6430582f1b2d0565c112c5c24b3eaecb2`, existing
`markets-batch-capacity-recovery-20261020` branch. SDK
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, Node/client source
`b280d714a8f0930c61962c885374ea63ea63d274`, proof backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. No source/dependency changes to that
cohort, Node operation, old-contract update, registration, faucet, financial
transaction or new proof. Root owns all local inspection. The existing read-only
UI gateway is left running. Random execution remains disabled.

An application can authenticate a qualified external source and finality evidence
inside a new SD-key using existing proof-recursion capabilities, without adding a
Node opcode. This is a conditional implementation route, **not an installed or
accepted adapter**. It needs independently qualified source protocols, owned
verification resources, actual new market/key/full UPS and capacity acceptance.
The application cannot turn the present producer-selected `random_seed` into an
unpredictable, unique and bias-resistant beacon by hashing or proving it.

## Code-based capability matrix

All source links below refer to the frozen commit, not the running service.

| Capability | Without Node changes | Evidence / current boundary |
| --- | --- | --- |
| Fetch checkpoint proof bytes | Existing RPC; no new endpoint required | [`standard_edge_rpc.rs:196`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_api_core/src/coordinator/standard_edge_rpc.rs#L196), SDK provider [`lps.rs:1444`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/client_prover/psy_provider/src/lps.rs#L1444), edge returns stored `zk_proof` at [`api.rs:323`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_node_common/src/coordinator/edge/api.rs#L323) |
| Fetch roots, leaves and membership paths | Existing read RPCs | Same API lines 172–183. These authenticate no canonical root by themselves. |
| Verify a proof under source-owned keys/common data and open its root/leaf | Application code implemented in this milestone | New read-only checkpoint inspector uses the frozen generated libraries, recomputes key fingerprints, verifies exact proof bytes and uses the actual cumulative-hash helper. Current captured proof compatibility **fails**, so real acceptance is not closed. |
| Authenticate genesis and one history | Needs a trusted release/anchor and a verified lineage opening | [`genesis circuit:42–67`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_plonky2_circuits/src/coordinator/circuits/checkpoint_state_transition_genesis.rs#L42) has virtual root/leaf/fingerprint; the coordinator edge checks canonical checkpoint 0 at [`worker_handler.rs:350–386`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_node_common/src/coordinator/edge/worker_handler.rs#L350). An external client must not inherit that trust from an RPC claim. |
| Certify finality / fork choice | Possible application adapter only after external finality delivery | Valid state transitions can describe competing histories. A height, a repeated RPC reply or a producer signature is not a finality certificate. No accepted adapter currently exists. |
| Bind exact admitted set to historical state and complete permutation | Conditional components already implemented | Seal/order linked proof binds one root and supplied seed. It still lacks authenticated canonical history and qualified entropy. |
| Prove seal-before-release causality | Needs a qualified source/release protocol, not just height order | `block_time` is virtual and monotonic in [`checkpoint_state_transition_proofs.rs:82,118`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_plonky2_circuits/src/coordinator/gadgets/checkpoint_state_transition_proofs.rs#L82). An external round may release while this ledger stalls. |
| Use an external unique-output beacon | Application/SD-key route is possible; provider and compatible circuit adapter are missing | New fixed verification resources and full UPS/call-stack/domain binding are required; no page/Executor-provided verifier or success flag. |
| Upgrade the existing native seed guarantee | Cannot be done solely in the market application | [`coordinator_guta_update_gatherer.rs:39`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_node_common/src/coordinator/processor/gatherers/coordinator_guta_update_gatherer.rs#L39) samples locally; the circuit copies a virtual contribution at lines 83–100. Native protocol enforcement would be a separate upstream Node change, outside this task. |

## What checkpoint verification actually establishes

The current checkpoint transition publishes four Felts: a **cumulative chain
commitment**, not a plain checkpoint root or the legacy single-step hash:

```text
chain_0 = H(H(root_0, leaf_0), genesis_fingerprint)
step_i  = H(H(root_i, leaf_i), final_minified_transition_fingerprint)
chain_i = H(chain_(i-1), step_i)
```

The implementation uses the frozen `CheckpointStateTransitionPublicInputs`
helpers, not a private reimplementation of the legacy hash. See
[`checkpoint_transition_hash.rs`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_data/src/protocol/checkpoint_transition_hash.rs)
and [`recursive_checkpoint_state_transition_verify.rs:34–86`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_plonky2_circuits/src/coordinator/gadgets/recursive_checkpoint_state_transition_verify.rs#L34).

Checking two proofs plus this last opening establishes a conditional linkage to
the predecessor proof's PI. It does **not** authenticate that supplied proof as
numeric checkpoint N−1, establish that the opened leaf is the latest append, or
anchor the entire prefix to approved genesis. A path proves membership at its
declared index only. The inspector explicitly leaves numeric adjacency, latest
position, history-prefix anchor, canonical genesis, instance and finality false.

An append-range proof can provide the additional boundary/index relation. The
frozen [`BridgeAggChain` business inputs](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_plonky2_circuits/src/bridge/circuits/bridge_agg_chain.rs#L58)
already expose start/end chain hashes, roots, leaf, indices and aggregate length.
Such delivery must verify the complete cyclic proof and fixed cyclic verifier
identity, bind an independently approved start, and connect the end to the actual
checkpoint proof. It still does not select a finalized fork by itself. No such
range proof was generated or accepted in this milestone.

## Observed compatibility blocker — preserve, do not substitute keys

Ten bounded public read attempts were declared. Python's TLS store failed before
an RPC response; the failure is retained. System curl then made nine successful
read-only calls with TLS and hostname verification enabled. The observed head
was checkpoint **6086**. Existing endpoints returned roots/leaf/path, transition
proof bytes for 6086 and 6085 (130,328 bytes each), and an empty proof array at 0.
No further RPC attempts or financial operation followed.

Both captured nonempty proofs independently fail verification under the frozen
cached transition resources. The ignored compatibility diagnostic exits nonzero
and preserves both results. This is **not a conclusion that the chain is invalid**:
wrong/stale wire data, a running release/parameter mismatch, proof encoding or
resource mismatch remain attribution questions. No alternate key, backend or SDK
was tried to obtain acceptance.

| Frozen resource / observed proof | Identity |
| --- | --- |
| Cached final transition fingerprint | `5e4c467c5e5984b52b2ce8a8dc1401ef3d6046ef3b529935e4cc840112e63f06` |
| Cached and constructed genesis fingerprint | `ef362aad8a2686a173a67d7aedc881d203754a105fe8134d82786111a8554208` |
| Cached and source-built genesis common degree | 12; verifier-only and common data compare equal |
| 6086 proof SHA256 | `bb7a12da2e29fc8a34b6abdfb61956a1d9f36f032c3b2a8952385a9ea71be3c3` |
| 6085 proof SHA256 | `7f59e1b7028c9e36b06606a9009cee200ecf2b13913e9a82cc83bf34862925db` |

Genesis cache equality is checked; a full source construction of the transition
manager is **not**. Its inputs include public network/tree/whitelist/validator
parameters; see [`coordinator_helper.rs`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_plonky2_circuits/src/coordinator/coordinator_helper.rs#L75).
The frozen bridge prover itself constructs network-specific coordinator resources
and requires the cached step fingerprint to equal the final minified fingerprint
([`prove_bridge.rs:725–747`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_cli/psy_relayer_cli/src/bridge/prove_bridge.rs#L725)).
Do not replace a failed verifier with a key returned beside the proof.

## Concrete upstream deliveries

These are proposed application-facing artifacts/interfaces, **not new SDK/Node
RPC names assumed to exist**. No delivery is approved merely because its JSON
parses or a provider asserts `verified: true`.

| ID / owner | Required delivery | Acceptance that closes it |
| --- | --- | --- |
| U0 — SDK release and running-service owners | Reproducible checkpoint cohort: exact source/backend/features and public network parameters; canonical genesis root/leaf and unique instance/key epoch; genesis and **final minified** transition verifier/common bytes with SHA256; wire format; the two captured proof identities or a precise explanation of the returned bytes | Independently construct/reproduce resources, match stamps/fingerprints/common data, verify the exact captured bytes and reject swapped keys/format/PI. If a different release is necessary, handle it as a separately authorized migration; no frozen-source patch here. |
| U1 — consensus/finality or bridge owners | `FinalizedCheckpointStatement`: scheme/version, network magic, unique instance/key epoch, approved genesis identity, checkpoint index, checkpoint root/leaf and cumulative chain commitment, verifier cohort ID; finality proof plus exact public-input and key-rotation rules | Fixed owned verifier authenticates canonical history and finality, not merely producer validity. Reject competing roots, stale/forked certificates, reused-genesis resets, wrong index/domain/epoch and forged/replayed finality. Supply historical lineage/range openings where required. |
| U2 — beacon protocol owners | `QualifiedBeaconDefinition` and `BeaconResult`: algorithm, participants/threshold and corruption assumptions, public keys/key epoch, source ID, fixed round/request, unique seed, exact proof and circuit-compatible verifier/common resources; availability and withholding model | Independently reviewed unpredictability and unique-output/bias analysis. Reject two selectable outputs, subset/key/round/checkpoint grinding, historical seed and reroll. A signature, VRF label or Merkle path alone is insufficient. |
| U3 — beacon and finality owners jointly | `CausalSealReleaseStatement`: exact finalized seal certificate digest, chain instance, frozen root and member commitment/count, market/vault/key, source/key epoch, predetermined round/draw policy, release request ID and transcript/proof of the qualified release rule | Establish the actual seal-before-unpredictability boundary under stated assumptions, including a stalled ledger and producer/Executor collusion. Reject output known before the accepted seal boundary, post-reveal set/cutoff changes, alternate draw requests and silent timeout fallback. |

Felt values must be canonical Goldilocks elements. SHA256 byte identities must
not be silently reduced into a Felt/hash limb; publish the exact complete-byte
encoding and domain separation. The current 74-Felt candidate has no standalone
unique-instance/key-epoch fields. A future release must either introduce an
explicit versioned encoding, or prove a reviewed source-definition commitment
that binds those values through the fixed source ID. An opaque unverified ID
does not supply this binding; no old sealed queue may be reinterpreted.

### Finality delivery routes that do not require a Node opcode

- A separately authenticated L1 anchor can bind checkpoint root, index and chain
  commitment. It needs a pinned chain ID, finalized header/light-client evidence,
  contract/proxy code and implementation identity, ABI/storage layout and
  receipt/storage proof tying the exact state to that header. The deployment
  team's contract source/artifacts are outside this frozen source bundle and
  have not been accepted here.
- The frozen bridge CLI calls `lastFinalizedCheckpointId` via `eth_call` and logs
  finalization after a mined receipt ([`daemon.rs:2220`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_cli/psy_relayer_cli/src/bridge/daemon.rs#L2220),
  [`finalize_bridge.rs:339–361`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_cli/psy_relayer_cli/src/bridge/finalize_bridge.rs#L339)).
  Those observations are not themselves an application-verifiable L1 consensus
  finality certificate. No live bridge receipt/header was inspected here.
- A reviewed checkpoint-attestation committee is another possible trust model,
  not native permissionless finality. It requires approved keys/threshold,
  conflict and rotation rules and explicit security assumptions. This document
  approves no committee, and an Executor signature cannot self-install one.

### Causal release route without trusting the local clock

A possible external threshold protocol releases a unique output only for one
precommitted request after its honest threshold participants verify the exact
finalized seal. It must refuse speculative/unsealed requests, prevent selectable
subsets and request retries, and bind one epoch/request/round. Its secrecy,
uniqueness, bias and withholding assumptions need an independent security review;
the transcript alone cannot prove that no corrupted coalition knew the result.
This is a delivery requirement, not an implemented beacon or proof of liveness.

A scheduled external beacon instead needs an audited cross-domain causal/release
certificate. A block timestamp, local time, checkpoint number or signed claim of
time is insufficient by itself. No such certificate is currently installed.

## Application-owned work and activation sequence

1. Close U0 with a fixed reproducible proof/resource tuple. Publishing existing
   data may need no Node code change; no guessed runtime key is adopted.
2. Implement and audit owned U1/U2/U3 adapters using the approved formats, then
   link exact roots, domains, source, round and seed to the existing conditional
   seal/order component. Parse-only interfaces cannot close these gates.
3. Introduce a new AMM/Curve contract/key version for immutable admission/seal,
   one-time draw, full permutation, consumed epochs, cancellation/timeout/refund
   and fee limits. This is application work, not an upstream obligation.
4. Verify actual bytecode, full ordered calls, caller/session/sig_hash, U124
   sequential state, nonce/fee/endpoints and complete UPS; then deploy fresh
   instances for settlement, ordinary claim and failure recovery. Do not update
   old contracts or admit funds to a queue with no accepted source/exit.

The application cannot force producers or relayers to publish or pay fees.
Random ordering covers the fixed finite set only; it does not prove global
inclusion, censorship resistance or comprehensive anti-MEV. Proof aggregation
does not make shared-pool state transitions fully parallel.

[Public source excerpts, captured requests/proofs, compatibility failures, exact build records and guard tests](../../executor/verification/2026-10-28-random-source-boundary-v1/manifest.json).


## Replay evidence guard

The first failure-replay recipe checked only a generic failed report. Review
found that a membership/profile/resource error could be mislabeled as the
expected transition-proof compatibility failure. In a fresh copy only, a changed
membership index reproduced that weak-label outcome; the v2 stage guard rejects it.
Review then found that v2 compared report digests with its supplied files rather
than requiring the original captured identities. Replacing the predecessor with
the other captured proof reproduced that classification gap at the same error
stage. The current v3 recipe rejects the substitute before invoking the verifier.

V3 pins the original opening/current/predecessor byte digests, exact frozen
predecessor-transition verification context and polynomial error, expected
transition fingerprint and genesis cache/source equality. It records those
identities, stage and cause in its output. Original v1/v2 recipes, reports and
archives remain superseded evidence; only v3 is the current guarded replay.
These repairs concern evidence classification, not on-chain proof acceptance.
