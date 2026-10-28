# Conditional sealed-state inclusion

This verifies historical membership and checkpoint ordering. It does **not**
certify the checkpoint root, a live seal method, finality, beacon unpredictability
or financial authorization. Random execution remains disabled.

## Caller-owned inputs and public proof

- The frozen statement is the existing 74-field encoding, supplied **without a
  seed** as `{ "fields": [...] }`. The strict decoder rejects an added seed.
- `SealLayout` is a caller/resource-owned versioned descriptor: state height,
  field/slot counts and the reviewed four-Felt frozen-root field's raw slot.
  It must be matched independently to the approved source/ABI/layout root and
  correct named field. An RPC or untrusted opening cannot select it.
- The expected checkpoint tree root is an explicit public input. A future owned
  finality adapter must authenticate it. Inclusion of the right genesis in an
  invented tree does not make that tree canonical.
- The opening carries genesis/seal checkpoint leaves, common-root Merkle paths,
  sealed global state roots, contract and user leaves, user-contract proof, exact
  packed root words and the key's public parameter. No secret or signature witness.

```text
explicit expected checkpoint root
  +-- checkpoint 1 -> expected genesis instance
  +-- seal checkpoint C -> sealed global roots
        +-- global contract leaf -> expected code/layout/function + metadata
        +-- global user leaf -> expected vault/key + initialized user state
              +-- user-contract leaf -> that market's state root
                    +-- one or two packed words -> exact frozenRoot[4]
```

The key hash is checked as `H(fingerprint, public_parameter)`. Contract IDs,
vault IDs, checkpoint indices, SDK tree heights, common roots and full path
values are bound. No path from a different snapshot can silently enter the chain.
The raw root slot may cross a packed-word boundary; all four limbs are checked,
with exact word count and indices, no duplicate or extra opening.

The temporal condition is `cutoff < C <= sealBy < drawCheckpoint`. `C` is the
checkpoint containing the state under the supplied root, not the transaction's
source checkpoint, `last_checkpoint_id`, an ACK or a timestamp. This proves a
checkpoint-order relation only. If the beacon follows an external clock, the
chain could stall while the round becomes known. The source/finality protocol
must additionally certify the seal-before-unpredictability causal boundary.

## Native and circuit ownership

`seal_inclusion.rs` checks native SDK Merkle proofs. The circuit uses the same
frozen-statement constraints and the frozen SDK leaf/Merkle gadgets; its public
inputs are frozenRoot[4], checkpointRoot[4] and C. The reviewed layout constants
are part of the built verifier resources. The circuit recomputes Merkle roots
from values/siblings; redundant root claims in JSON are not independent authority.
The native opening verifier additionally checks those serialized root fields.

`SealCircuit::verify_for` binds the exact expected statement/root/checkpoint
before proof verification. No verifier resources are accepted from a webpage.
This component is not a market signature, SD-key or Endcap and is not installed
as one. Even an accepted component proof cannot enable `authorizeRandomBatch`.

A root value at a reviewed location does not prove that approved admission,
immutability or refund logic wrote it. That requires the actual new contract/key,
reviewed bytecode, full UPS and source/finality integration. No old contract or
sealed deterministic queue is updated or reinterpreted here.

## Read-only reproduction interfaces

Build the exact application snapshot against the frozen SDK and declared testnet
configuration with `nightly-2025-09-20 --release --locked --offline`. The archived
root-manifest projection exposes only the named read-only binaries.

```text
verify_seal_inclusion FROZEN_FIELDS REVIEWED_LAYOUT EXPECTED_CHECKPOINT_ROOT OPENING FRESH_REPORT
verify_seal_component FROZEN_FIELDS REVIEWED_LAYOUT EXPECTED_CHECKPOINT_ROOT SEAL_CHECKPOINT PROOF FRESH_REPORT
```

Both interfaces cap reads before deserialization, reject unknown top-level fields,
require canonical expected root/checkpoint, and create/sync a new report without
signing, RPC, proof generation or overwriting history. The second verifies the
preserved component proof using source-built resources; it does not regenerate it.

Native tests in `--test seal_inclusion` cover aligned/cross-word openings for AMM
and Curve and mutated paths/identities/schedule/slots. Ignored test
`conditional_seal_component_proof` requires fresh `SEAL_INCLUSION_OUT` and a
predeclared component budget. It uses synthetic checkpoints and canonical test
ABI layouts, not a deployed market or certified checkpoint.

Reports keep `finalityVerified`, `beaconUnpredictabilityVerified`,
`randomAuthorization`, `fullUpsVerified` and `broadcast` false. The source gate
continues to reject every random execution request.
