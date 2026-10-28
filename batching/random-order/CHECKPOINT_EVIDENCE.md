# Fixed-resource checkpoint evidence inspection

This is a read-only application tool for proof/resource compatibility and
conditional root/leaf opening. It never authenticates finality, chooses a beacon,
installs a resource supplied by RPC, signs, generates a proof or broadcasts.
The source gate remains closed.

```text
inspect_checkpoint_evidence resources FRESH_REPORT
inspect_checkpoint_evidence OPENING CURRENT_PROOF PREVIOUS_PROOF_OR_DASH FRESH_REPORT
```

Prepare the application with the frozen mainnet-beta helper, the recorded root
test-target projection, selected testnet profile and release/locked/offline build.
No dependency, Node source or generated network artifact is modified.

`CheckpointOpening` has exact top-level fields: schema 1, caller-declared
`checkpoint_id`, checkpoint root, leaf hash and a 32-level Merkle path. The tool
checks root/leaf/index membership; reads proof bytes with a 2 MB ceiling; rejects
trailing serialization data; rebuilds common resources from the frozen generated
library; and recomputes cached key fingerprints from verifier data. It also
compares cached genesis resources to the actual frozen genesis constructor. A
cache mismatch blocks inspection, without adopting the constructed key instead.
The full transition resource graph is not rebuilt by that genesis comparison.

Checkpoint 0 selects the fixed genesis circuit; later values select the fixed
final-minified transition circuit. Caller-provided keys/common data/callbacks or
alternate-key acceptance are not supported. Each complete proof is verified anew.
The static resource cache contains no witness, nonce, balance or proof result.

For a nonzero checkpoint, the supplied predecessor proof is verified under the
appropriate fixed kind and its actual four-Felt PI is used to open the current
proof commitment with the frozen SDK's cumulative-hash helper. This relation
does not authenticate the predecessor's numeric index, latest append position,
full prefix or canonical genesis. These limitations have explicit false report
fields. Declared-index membership must never be presented as finalized position.

On a proof/opening verification failure, the tool saves a new failed report with
the opening/current/predecessor SHA256 identities and exits nonzero. The explicit
genesis/no-predecessor input uses a null predecessor digest. Earlier parse/size
failures can exit before report creation. Reports are create-new and fsynced;
existing artifacts are never replaced. A failed report is not a claim that all
chains or the source circuit are invalid.

## Current acceptance state

The first captured genesis proof response was empty. Both captured nonempty
transition proofs fail under the frozen cached transition resources. Genesis
cache and constructor compare equal; full transition reproduction and attribution
of the compatibility failure remain open. No replacement key or backend was
tried and no positive live-proof acceptance is claimed.

Three offline resource/hash/size unit checks pass. The separately selected
`captured_transition_proof_compatibility` ignored diagnostic intentionally reports
the actual two failed compatibility checks, writes both byte identities and exits
nonzero. It is not counted as a passing regression. Guard tests distinguish
pre-verification membership/parser rejection from failed-proof byte provenance;
a blocked verifier cannot establish a cryptographic substitution-test success.

All canonical-history, finality, chain-domain, qualified-source, causal-seal and
random-authorization flags remain false, even on the theoretical successful
conditional proof/opening branch. This tool is not a wallet Endcap verifier or
an execution/recovery permission.

[No-Node capability matrix and concrete U0–U3 deliveries](../../docs/security/NO_NODE_RANDOMNESS_FINALITY_20261028.md).


The current archive replay is `replay-extracted-v3.py`: before invoking the tool,
it pins the original opening/current/predecessor byte digests. It then checks the
exact predecessor-transition stage/cause and fixed fingerprint, not just a failed
boolean or hashes relative to arbitrary supplied files. Wrong-membership and
same-stage substituted-predecessor controls are retained. V1/v2 recipes/reports
are superseded provenance, never current acceptance.
