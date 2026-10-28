# Required beacon and finality delivery

These are proposed public statement requirements for an upstream adapter, not
existing SDK RPC names or an implemented/approved source. The frozen SDK and
Node are unchanged. The present envelope parser remains explicitly unverified.

## Ownership and linked statements

| Boundary | Required public statement and evidence |
| --- | --- |
| Reviewed source definition | Version, source ID digest covering type/algorithm, keys/participants/threshold, round schedule, domain and release rules; source/verifier/common-data hashes and independently reviewed security assumptions |
| Unique beacon | Network magic, genesis instance, source ID/key epoch, precommitted round and draw, unique output, proof and authenticated unpredictability/release boundary |
| Chain finality | Same domain/genesis, finalized checkpoint ID and checkpoint tree root, finality scheme/key identity and certificate/proof accepted by fixed owned verifier resources |
| Seal inclusion | Frozen statement root, exact reviewed layout/slot resources, seal checkpoint in that finalized tree, vault/key, code/layout/function and stored root opening |
| Actual market execution | Same frozen root and unique certified seed/permutation plus fresh state/nonce/fees, complete ordered calls, signature/session/sig_hash and final endpoints |

The existing `beaconProof`, `sealInclusionProof` and `finalityProof` byte fields
are not verification reports. The future adapter must decode fixed proof formats,
verify all public bindings and reject a caller-selected verifier or `verified`
boolean. The conditional seal component now supplies one possible membership
relation; it does not implement the other two proofs.

Illustrative ownership flow (pseudocode, not shipped API):

```text
final = owned_finality_verifier(finalityProof, reviewed_chain_resources)
seal  = owned_seal_verifier(frozen_statement, reviewed_layout, final.root, sealProof)
draw  = owned_beacon_verifier(beaconProof, reviewed_source_resources)
require matching chain/source/round/draw and seal-before-release causality
require one output, original frozen set and fixed timeout/refund policy
verify permutation and actual market SD-key/full UPS
```

A Merkle root supplied by an Executor is not a finality input. A source signature
alone does not establish unique/unbiased entropy. Multiple valid proof encodings
for the **same** output need not be a problem; multiple selectable outputs are.

## Temporal release is stronger than checkpoint order

A producer can delay checkpoint production while an external round is released.
`sealCheckpoint < drawCheckpoint` alone therefore does not establish that the
seed was unknown when sealing. The adapter must prove a causal boundary, such as
a reviewed source protocol that withholds threshold output until a specific
finalized seal commitment is fixed, or a qualified cross-domain commitment/time
opening that predates the independently defined round release. This is not
permission to use a timestamp as entropy or trust an operator's local clock.

The frozen checkpoint transition source allocates `block_time` as a witness and
checks monotonicity against old time; the inspected path does not supply a
trusted wall-clock certificate ([`checkpoint_state_transition_proofs.rs:82,118`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_plonky2_circuits/src/coordinator/gadgets/checkpoint_state_transition_proofs.rs#L82)).
Do not repurpose that field as the missing release proof. The current local
`random_seed` sampler also remains disqualified.

## Concrete acceptance conditions

1. Release exact public-input encoding, proof sizes/limits, verifier/common data,
   source code, key generation/rotation and test vectors; pin dependencies before
   acceptance. No runtime URL or page-provided verification resource.
2. Demonstrate unique output per fixed request; reject alternate participant
   subsets, keys, historical rounds, alternate checkpoints and rerolls. State
   explicitly who can predict, influence or withhold, and quantify assumptions.
3. Reject forged/wrong-chain/forked finality, late or fabricated seal openings,
   provider clock/ledger-height drift, root substitution and output known before
   the actual seal boundary. A signed claim of time is not a substitute for proof.
4. Fix source/round and set before release. Persist exact original identity and
   support handoff without new draw, new set or deterministic fallback. Provide
   governed timeout refunds, consumed epoch/order protection and fee exhaustion
   recovery in the actual new contract/key/full UPS.
5. Supply two-output, withholding, reorg, release-delay, key-rotation and replay
   rejection vectors, independent review and reproducible costs. Validate fresh
   instance settlement/ordinary claim/refund before production use.

This does not guarantee producer publication, relayer service or global inclusion.
A deterministic finite set and unique seed cannot eliminate strategic non-service,
abort/re-entry or comprehensive MEV by themselves. No adapter is approved by this
interface document; the runtime gate remains closed.
