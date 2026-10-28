# Conditional seal and order linkage

This is a recursive **component relation**, not an enabled random market. It
verifies the conditional historical seal proof and permutation proof under keys
and common data rebuilt from the frozen source. All four frozen-root limbs must
match inside the circuit. Comparing two unverified trace/report roots is not a
substitute for these two recursive proof verifications.

## Fixed resources and public endpoints

`SealOrderCircuit::build(reviewed_layout)` internally constructs `SealCircuit`
and `PermutationCircuit`, embeds both verifier-only data as constants and uses
their exact common data. There is no caller-supplied child key, verifier callback,
resource URL or verification-success flag. The reviewed layout remains owned by
the operator/release resources and must match approved source, ABI, layout root
and correct frozen-root field semantics. A public JSON descriptor is not approval.

| Parent public inputs | Value |
| --- | --- |
| 0 | Relation version 1 |
| 1–4 | Complete frozen statement root, shared by both verified children |
| 5–8 | Expected checkpoint tree root |
| 9 | Checkpoint containing the conditional sealed state |
| 10–13 | Seed used by the permutation child |
| 14 | Frozen member count |
| 15–18 | Complete bounded permutation |

`verify_for` derives the expected root, member count and total ordering from the
exact 74-field statement and seed, checks all 19 endpoints, then verifies the
actual parent proof under its source-built resources. The child seal constrains
the inclusion schedule and state identities; the child permutation constrains
every bounded member exactly once and the full canonical ordering key/tie rule.
No amount arithmetic, pricing, refund, token transfer or market call is added.

The linked proof does not authenticate the seed. A parent proof with an
Executor-selected seed is still unusable for random execution. It also does not
authenticate canonical checkpoint history, finality, correct admission/sealing
methods, release causality or actual market CFC/SD-key/Endcap/UPS behavior.

## Reproduction and rejection boundaries

Prepare a fresh application with the existing frozen SDK snapshot helper. Expose
only the named read-only verifier target in the root-manifest test projection.
Use the recorded testnet configuration, nightly toolchain, release/locked/offline
build and two Rayon threads. No SDK, Node, verifier release or runtime trust
installation changes are required or authorized by this component.

```text
verify_seal_order CANDIDATE_INPUT REVIEWED_LAYOUT EXPECTED_CHECKPOINT_ROOT SEAL_CHECKPOINT LINKED_PROOF FRESH_REPORT
```

The candidate decoder requires canonical fields and seed. The CLI bounds reads
before decoding, rejects trailing proof bytes, requires canonical root/checkpoint,
and creates/syncs a new report. It neither proves, signs, calls RPC nor broadcasts.
The report explicitly keeps finality, beacon unpredictability, market semantics,
random authorization, full UPS and broadcast false.

Ignored test `linked_seal_and_order_proof` requires `SEAL_ORDER_INPUT` pointing to
the preserved synthetic seal case, `SEAL_ORDER_OTHER_CASE` pointing to the prior
permutation case, and fresh `SEAL_ORDER_OUT`. It verifies the saved seal proof and
the other-set order proof before attempting linkage. It generates at most one
matching permutation proof and one parent, then attempts three invalid recursive
witnesses: two individually valid different-set children, changed rank and changed
seal checkpoint. Test seed `[1,2,3,4]` is a declared fixture, **never a beacon**.

The runtime source gate remains closed. Actual qualification requires the
[provider and finality deliverables](PROVIDER_INTERFACE.md), including a certified
causal seal-before-release boundary even if the chain stalls. New actual market
state/key/full UPS, sequential U124 accounting and live recovery/claim acceptance
must follow. No old market or sealed queue may be reinterpreted as random.
