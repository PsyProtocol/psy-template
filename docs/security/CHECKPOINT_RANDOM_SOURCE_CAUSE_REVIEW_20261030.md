# Checkpoint cohort exclusions and random-source boundary — 30 October 2026

## Decision

The proof failure is **not resolved or attributed**. This continuation runs a
bounded source-labelled comparison and traces the actual frozen entropy path.
It does not install another verifier, change the selected SDK, authenticate a
running image, enable random settlement, or claim a live trade/claim result.

Branch remains `markets-batch-capacity-recovery-20261020`, base `740f4d62`.
SDK remains `c92880c8b6e2c8d392f19368bc8801a2584fd427`, consumed client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. Root was the sole diagnostic owner;
no financial/proving worker was running at entry. No Node source, old contract,
wallet, original funding request, SDK dependency or original evidence changed.

## What was tested, and what was ruled out

The previous audit already checked original byte round-trips, frozen wrapper
construction, cache fingerprints and a saved synthetic genesis control. Those
experiments were not regenerated. This case adds two explicitly named source
families, not an open-ended search for a key that passes:

| Source family | Kind-32 fingerprint | Original 18504/18505 | Current 20171/20172 |
| --- | --- | --- | --- |
| Approved frozen release | `5e4c467c5e5984b52b2ce8a8dc1401ef3d6046ef3b529935e4cc840112e63f06` | Both reject | Both reject |
| Existing local Node Git HEAD `5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6` | `11922fd1eee2a075a45e9b1a82637df5f9ee529f92320f229312a70f8ea87f85` | Both reject | Both reject |
| Already-cached Node `origin/mainnet-beta` object `f786b599e08add77c7f28889d9e004aab716ba31` | `eaa0df030310fd5b374b852e512307aa63ea41474e1938501c429650c473fddd` | Both reject | Both reject |

The last two rows are **unapproved diagnostic comparisons**. Neither the local
HEAD nor the cached remote ref identifies the running service. No fetch,
checkout or SDK migration occurred. Each embedded comparison is pinned to its
public source-file SHA256 and commit; its verifier fingerprint is recomputed.
Both sources assign kind 32 the same common-data identity as the frozen release:

```text
Native debug hash:   7ea492b556ffc919706ac50511cadc6c6b3b38afe4810c7b5ef3320652b50f0e
Bincode SHA256:     bd7b8b4c937b134acf2bf69547776201a6a5115b63679e57b6944a804070377d
```

The diagnostic reuses that unchanged frozen common data; it does not load
arbitrary external common data. Original and current observed cumulative
PI/root/leaf relations also do not match either named comparison fingerprint.
This rules out those two simple cached-key substitutions as a repair. It does
not distinguish a different runtime/network-dependent circuit, wrong stored
proof type, mismatched proof/state records, an invalid proof, or another runtime
defect. It does **not** establish that the chain itself is invalid.

Public reference Poseidon vectors (zero and sequential inputs) and boundary
field addition/multiplication checks pass on the current aarch64 machine under
the frozen backend. These limited known-answer checks provide no evidence of a
failure in those operations; they do not prove all arithmetic, cross-platform
verification, or the correctness of a remote prover.

Current observations were captured once, with no retry:

| Checkpoint | Bytes | SHA256 |
| --- | ---: | --- |
| 20171 | 130328 | `0f398a506e05c33971a1f672086ce7f1f2bde14e7b9bca02ff66b4715bbf630f` |
| 20172 | 130328 | `dc3261bb236cb4e0646766978456f00955fef72685ed94f4038a863de7415841` |

The five read-only calls were one head, two proofs, one current leaf and one
current membership path. The head is an RPC observation, not finality. Original
18504/18505 artifacts and the preceding current-cohort captures remain intact.

## Randomness: the concrete source-level limitation

The frozen source has the following path:

1. `psy_node_common/src/coordinator/processor/gatherers/coordinator_guta_update_gatherer.rs:39`
   defines `get_temp_guta_rand_seed`. It fills 32 bytes with
   `rand::thread_rng().fill_bytes(...)`. Line 476 invokes it during gatherer
   finalization and saves the resulting seed in the backup output.
2. `psy_node_common/src/backup/output/coordinator_output_builder.rs:380`
   copies `random_seed_guta` into `final_random_seed_contribution`.
3. `psy_plonky2_circuits/src/coordinator/gadgets/checkpoint_state_transition_proofs.rs:83`
   creates a virtual seed target; line 100 assigns that target to the new
   checkpoint leaf's `random_seed`. The witness setter supplies its value.

The circuit commits the supplied value. This path does not verify an entropy
generation proof, unique-output future beacon, production/release time, or
resistance to producer grinding/withholding. A proof of membership authenticates
the committed value relative to a history; it does not authenticate how or when
the producer learned it. An honest source implementation generating a value
late is not a cryptographic certificate that every accepted witness did so.

Consequently, the existing v13 application can authenticate **S < C < D relative
to the same supplied history**, preserve the exact finite source set, seed,
permutation, cursors and recovery, and verify conditional shared-state updates.
It cannot derive canonical finality or seal-before-seed-knowledge authentication
from these fields. Hashing this producer-local value, increasing D's delay or
changing the sorting function does not add the missing guarantee.

No contract patch was made to pretend otherwise. Existing deterministic mode
and the separate producer-influenced candidate profiles retain their stated
boundaries. No replacement locally generated entropy was added.

## New application implementation and verification boundary

The [owned native diagnostic](../../amm/u124/vm-tests/src/bin/diagnose_checkpoint_cohort.rs)
contains two finite, embedded, source-pinned fixtures. There is no external
verifier filename, resource URL, signer, worker credential or broadcast API.
The normal checkpoint verifier and delivery gate remain unchanged. The
comparison code is a separate executable, not an application verifier registry
entry or a policy fallback.

Reports use the distinct `unapproved-source-cohort-diagnostic-v1` kind and
separate `approvedResourceProofVerified` from
`unapprovedNamedComparisonProofVerified`. Process exit zero means that the
**diagnostic completed**, never release or financial approval. Every run keeps
`comparisonResourcesInstalled`, `runtimeIdentityAuthenticated`,
`finalityVerified`, `qualifiedSource`, `randomAuthorization` and `broadcast`
false. `approvedReleaseCompatible` is false for all captured proofs.
That diagnostic field describes proof/resource correspondence only; it cannot
certify running release identity, state continuity, finality or admission even
if a later capture verifies. The production admission gates do not consume it.

Reproduce the final executable against a fresh report:

```text
diagnose_checkpoint_cohort cached-mainnet-beta-f786b599 \
  PREVIOUS_PROOF CURRENT_PROOF OBSERVED_OPENING_OR_DASH FRESH_REPORT

diagnose_checkpoint_cohort local-head-5b7f4e1e \
  PREVIOUS_PROOF CURRENT_PROOF OBSERVED_OPENING_OR_DASH FRESH_REPORT
```

Use the existing frozen application snapshot helper and unchanged release,
offline/locked, nightly-2025-09-20, testnet/profile/config, two build jobs and two
Rayon threads. Final v2 production code equals the final v3 production source;
v3 only adds the three non-proving unit tests. Raw captures, source differences,
source identity claims, attempts and failures are retained.

The [regression runner](../../batching/random-order/checkpoint_cohort_regression.py)
uses the actual native executable to distinguish malformed data from proof
rejection, reject an altered public input and an external resource selector,
and preserve an existing report on collision. These are offline diagnostic
checks, not market/UPS acceptance or a claim that alternate keys are trusted.

## Minimum next delivery; no private material or Node edit requested

Further local key guessing is stopped. The first required diagnostic delivery
is just the **actual running kind-32 verifier-only and common data**, plus the
exact proof hash to which they apply. Do not substitute the local reference
export, a moving branch name or another reconstructed cache for the running
registry. No private key, mnemonic, secret proving witness or wallet recovery
file is needed.

The service operator can provide public files or an existing read-only machine
connection alias. Public RPC currently exposes the proof byte vector and
separate observations, but not this runtime registry export. Application tools
cannot read a resource that the endpoint does not expose. The
[existing strict handoff format](CHECKPOINT_PUBLIC_DELIVERY_20261030.md) remains
available for the complete follow-up export.

| Owner | Exact next item | Decision it enables |
| --- | --- | --- |
| Running prover / release | Actual kind-32 verifier-only/common bytes from the registry used for the captured proof; recomputed fingerprint, serialized hashes and proof SHA256 | Identify whether the proof is paired with a different verifier/common data. A difference is an incompatibility for review, not permission to install that key. If resources equal the approved release, compare the public transcript and acceptance path instead. |
| Coordinator storage / edge | Exact stored `PsyVerifiableCheckpointTransitionWithProof` record and opening from one identified snapshot for 18504/18505 or current 20171/20172; include stored circuit kind | Distinguish wrong record/proof type or state correspondence from proof generation failure. Preserve original records; do not overwrite them or concatenate unrelated RPC observations into an atomic-export claim. |
| Worker / commit path, if proof and resources are identical | Public acceptance/rejection log tied to proof hash, job kind and expected/actual PI | Reconcile a stored result with the actual verifier used at submission/commit. Completed-job counters cannot do this. |
| Consensus / finality | Authenticated canonical instance/history anchor and finality/append witness linked to accepted seal C | Make a conditional history opening an authenticated canonical seal; raw head height is insufficient. |
| Entropy / release protocol | Fixed source/round and unique-output verification rules, unpredictability/bias assumptions, and an authenticated acceptance-before-release relation | Close the future-seed and public-release ordering requirement. Existing producer-local `thread_rng` plus membership cannot supply it. |

An application/SD-key adapter can verify suitable public certificates without a
new Node opcode once the source, fixed verification resources and trust anchors
exist. This is different from inventing certificates, assuming a running
version, or waiving the fixed SDK checks. No new trust authority or entropy
provider was silently selected in this task.

Only after the proof/admission and authentication prerequisites pass may the
original budgeted new-instance registration, random settlement and ordinary
wallet claim plan proceed. The original faucet unknown-send lock also remains;
no funding request was retried or replaced.

## Budget, measurements and evidence

There were two bounded release CLI build attempts, eight diagnostic CLI
invocations and five of at most seven read-only RPC calls. A separate bounded
120-second unit harness compilation checked known answers without a proof or
extra RPC. Financial operations, fees, new proofs, fills and wallet claims are
all zero. No actual market proof, financial job or performance run was restarted.

The two release builds took 57.157 s and 55.144 s on the existing shared Cargo
target. Each two-proof named-cohort comparison took 3.103–4.161 s; these are
diagnostic verification timings only. Process-family RSS was sampled at one
second and includes shared pages, not physical peak memory. These observations
do not establish a cold/warm market improvement, settlement throughput or final
confirmation latency. All samples, attempts and protocol observations remain.

Public evidence:
[summary](../../executor/verification/2026-10-30-checkpoint-protocol-cause-review-v1/SUMMARY.json),
[file/digest index](../../executor/verification/2026-10-30-checkpoint-protocol-cause-review-v1/index.json).
The unresolved root cause, external delivery, and conditional randomness scope
remain explicit; test completion is not production acceptance.
