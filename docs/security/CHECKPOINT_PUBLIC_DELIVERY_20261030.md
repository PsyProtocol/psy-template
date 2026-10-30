# Public checkpoint resource and record handoff — 30 October 2026

## Result and limits

This continuation implements the application side of the
[18504/18505 audit delivery checklist](CHECKPOINT_18504_18505_RESOURCE_AUDIT_20261030.md).
It exports approved local reference resources, imports a strictly bounded public
delivery, checks conditional record/proof consistency, and exposes the same
native verifier through an operator-owned Executor command. It does not invent
an upstream export RPC, install a foreign key, attest a running service, prove
canonical finality, or authorize random settlement.

The existing previous-checkpoint producer-seeded and delayed accepted-seal
protocols are preserved. Qualified randomness and seal-before-public-release
authentication remain open. No market, Node source, frozen SDK, account,
funding request, original checkpoint proof or prior evidence was modified.
All work in this case is read-only/offline: no new proof, transaction, fee,
RPC request, actual fill or wallet claim.

## Implementation

- [Native delivery module](../../amm/u124/vm-tests/src/checkpoint_delivery.rs):
  strict versioned manifest, exact frozen release pins, bounded confined regular
  files and SHA256 bindings. Symlinks, traversal, unknown fields and substituted
  resources fail closed. Resource bytes must equal the already approved local
  verifier/common bytes; external bytes are never installed or deserialized as
  a replacement verifier.
- [Existing fixed verifier](../../amm/u124/vm-tests/src/checkpoint_evidence.rs):
  reused for proof verification and extended to compare actual frozen
  `PsyVerifiableCheckpointTransitionWithProof` records with populated leaf
  hashes, membership paths, transition endpoints, circuit kind, fingerprint,
  predecessor cumulative commitment and consecutive append positions.
- [Native CLI](../../amm/u124/vm-tests/src/bin/checkpoint_delivery.rs):
  fresh reference export and immutable success/rejection report. Inputs do not
  select a verifier, signer, endpoint or broadcasting implementation.
- [Executor route](../../executor/checkpointDelivery.mjs): operator-reviewed
  native binary digest, sealed immutable executable, read-only artifact lease,
  saved intent before verification, bounded native process and exact report
  identity. This lease is separate from financial account/vault locks. An
  interrupted lease requires owner/log review; no automatic task replacement
  or claim of cross-machine coordination is introduced.

A successful conditional inspection still sets `runtimeIdentityAuthenticated`,
`snapshotProvenanceAuthenticated`, `chainDomainAuthenticated`,
`historyPrefixAnchored`, `finalityVerified`, `causalSealVerified`,
`qualifiedSource`, `randomAuthorization` and `broadcast` to **false**. Executor
rejects any report that promotes those fields. The qualified-random source gate
continues to reject even a conditionally successful delivery report.

## Delivery format

The runtime owner exports from **one identified, consistent storage snapshot**.
The exported snapshot identifier and binary/build digest remain claims until
their provenance is independently authenticated; file hashes alone do not do
that. Public RPC leaf/proof calls taken separately are not a substitute for the
stored record and cannot be labeled an atomic export by the importer.

One fresh directory contains `delivery.json` and basename-only members. The
manifest has exactly these fields (camelCase):

| Field | Required content |
| --- | --- |
| `schema`, `kind` | `1`, `checkpoint-runtime-delivery-v1` |
| `release` | Exact `sdkCommit`, `clientCommit`, `backendCommit` below |
| `runtimeClaim` | `binarySha256`, `buildManifestSha256`, `snapshotId`, `chainInstanceClaim`, `exporter`; public, bounded identifiers only |
| `resources` | `verifier` and `common`, each `{file, sha256}` |
| `boundaryPriorChainHash` | Canonical field hash of the predecessor of the first delivered transition; explicitly unanchored by this tool |
| `checkpoints` | Exactly two ordered non-genesis entries, each `{checkpointId, record: {file, sha256}, opening: {file, sha256}}` |

Release pins:

```text
SDK:     c92880c8b6e2c8d392f19368bc8801a2584fd427
Client:  b280d714a8f0930c61962c885374ea63ea63d274
Backend: 736572e9dd3ca93566471cf5a2a1cb67a13fe01d
```

Each record is the exact public frozen native type from
`psy_data::protocol::verifiable_checkpoint_transition`:

```text
PsyVerifiableCheckpointTransitionWithProof {
  info: {
    state_transition: {
      checkpoint_transition: {
        old_checkpoint_tree_root, new_checkpoint_tree_root,
        old_checkpoint_leaf_hash, new_checkpoint_leaf_hash
      },
      genesis_checkpoint_state_transition_hash,
      checkpoint_state_transition_circuit_fingerprint
    },
    checkpoint_leaf: { global_state_roots, stats }
  },
  circuit_type,
  zk_proof
}
```

Use `serde_json::to_vec(&record)` from the frozen native type, with no added
fields, formatting or trailing newline. The importer requires exact compact
round-trip bytes, rejecting ignored fields, duplicate keys and alternative
scalar encodings. Preserve the original stored artifact separately. This
canonical public export does **not** include a private signing witness, wallet
recovery data, worker credentials or a private database dump.

Each opening uses the existing strict `CheckpointOpening` schema:
`{schema: 1, checkpoint_id, checkpoint_root, checkpoint_leaf_hash,
checkpoint_path}` with the actual 32-level Merkle path. The populated leaf is
hashed using the frozen native implementation. Numeric adjacency, two valid
paths and cumulative linking do not authenticate the earlier history, global
latest tip, genesis anchor, runtime identity or finality. The importer also
checks that the current leaf replaces an empty position under the declared old
root and that the second record continues the first; these are conditional
append checks, not a trusted whole-chain history.

Limits: 32 KiB manifest, 2 MB per resource/proof, 16 MB per public record, 128 KiB
per opening, two records and 96-byte confined basenames. The reviewed manifest
SHA256 binds the whole input selection. A digest match is content identity,
not independent provenance authentication.

## Reproduction and operation

Build with the existing application snapshot helper against the unchanged
frozen source manifest, offline/locked release, nightly-2025-09-20,
`CARGO_BUILD_JOBS=2`, `RAYON_NUM_THREADS=2`, and the existing explicit
`mainnet-beta-20261027-v1` compiled-domain guard. There is no environment relabel
or fallback to a different SDK/key to force acceptance.

```text
checkpoint_delivery export FRESH_REFERENCE_DIRECTORY

checkpoint_delivery verify DELIVERY_DIRECTORY REVIEWED_MANIFEST_SHA256 FRESH_REPORT

node executor/checkpointDelivery.mjs DELIVERY_DIRECTORY REVIEWED_MANIFEST_SHA256 \
  OWNED_NATIVE_BINARY REVIEWED_BINARY_SHA256 RUNTIME_DIRECTORY FRESH_REPORT
```

`export` produces `transition-verifier.bin`, `transition-common.bin` and
`reference.json`, explicitly labeled `local-fixed-checkpoint-reference-v1`.
It is **not** evidence that the running prover uses these resources. The
expected resource digests remain:

```text
Verifier: 8816e9054d99382ce4d2d530505b436bb7109bee26102e4eb6afde57cdad51dd
Common:   bd7b8b4c937b134acf2bf69547776201a6a5115b63679e57b6944a804070377d
```

The command reserves a fresh report before verification. Failures remain
non-authorizing reports; collisions never overwrite earlier results. Executor
saves an immutable `.intent.json` and native log, refuses changed reviewed
pins, and does not accept a precomputed webpage report. A stale read-only lease
must be reconciled with its recorded owner, process and report before any
operator cleanup. This command does not replace the original financial
broadcast journal or release an account with an unknown transaction.

## Tests and evidence

The case plan declares zero financial operations, zero proofs, zero RPC reads,
three bounded build attempts and at most twenty native CLI invocations. Native
rejection tests preserve failures and output collisions. They do not fabricate
a successful runtime bundle or relabel the existing synthetic genesis control
as a current transition proof. Test-only runtime/build labels are explicitly
untrusted fixtures, never service attestations.

Final results:

- Seven native unit tests pass, including a deliberately altered negative
  proof fixture: structurally coherent test claims reach and fail the actual
  frozen cryptographic verifier. Wrong circuit kind, fingerprint, checkpoint
  index and predecessor leaf continuity also reject. No altered fixture is
  labeled a runtime export or accepted transition.
- Eleven native CLI rejection cases pass; reference resource digests equal
  the preceding audit. Export and report collisions retain the original bytes.
- Three Executor tests pass with the actual final owned native executable
  enabled. A separate durable CLI invocation retains its exact intent, native
  log and expected missing-record rejection. Reviewed-pin substitutions and
  interrupted leases fail before a native process starts. A conditionally
  valid report still cannot pass the qualified-random source gate.
- Sixteen native CLI invocations used the declared maximum of twenty; no
  financial operation, new proof or RPC read occurred. Accepted runtime bundles,
  accepted checkpoint transition proofs, real fills and wallet claims are zero.

Final owned executable SHA256 is recorded in the public summary. Native
production implementation, CLI, dependency lock and existing verifier are
identical between the v2 rejection-run snapshot and final v3 snapshot; only
additional `cfg(test)` binding negatives were added. Every snapshot checks all
2,756 frozen upstream files. Final working native sources match the v3 source
manifest. Original attempts and logs remain retained.

| Diagnostic operation | Elapsed | Sampled process-family RSS peak |
| --- | ---: | ---: |
| Release build v1 | 46.983 s | 1,166,448 KiB |
| Release build v2 | 51.441 s | 1,154,592 KiB |
| Release build v3 | 50.041 s | 1,165,200 KiB |
| Aggregate v2 native export/rejection regression | 34.437 s | 456,960 KiB |
| Final Executor/native expected rejection, including sealed driver copy | 5.217 s | 537,024 KiB |

These builds use an existing shared Cargo target; they are not clean SDK cold
builds or a controlled before/after performance experiment. The regression
aggregate includes multiple fresh native processes. One-second sampled family
RSS includes shared pages and can miss short peaks; it is not physical peak
memory. Results preserve all attempts and do not establish random-settlement
performance, confirmation throughput, warm-task latency or a market speedup.

Public evidence:
[summary](../../executor/verification/2026-10-30-checkpoint-public-delivery-v1/SUMMARY.json),
[file/digest index](../../executor/verification/2026-10-30-checkpoint-public-delivery-v1/index.json).

## Still required upstream; no Node modification in this task

| Owner | Public delivery / interface | Acceptance requirement |
| --- | --- | --- |
| Coordinator storage / edge | Exact kind-32 stored records for 18504/18505, pending IDs 18506/18507, predecessor commitment and openings from an identified consistent snapshot; equivalent current-cohort records after any repair | Native proof and cumulative endpoint verification must pass under the approved fixed release. Explain any discrepancy with the original immutable proof hashes; do not overwrite originals. A separately sampled RPC list is insufficient. |
| Prover / release | Actual running verifier-only/common bytes, public binary/build manifest, backend/compiler/features and source identity; worker-submit and coordinator-commit acceptance logs tied to proof hashes and expected/actual PI | Compare against the reference export. A different key is reported as a release incompatibility for separate review; never installed automatically. Identical bytes still require investigation of the existing polynomial failures. A completed-job count is not an acceptance log. |
| Network / consensus | Canonical chain-instance/genesis anchor, authenticated finality and history-prefix proof, actual rotation/validator parameters compatible with this fixed SDK | Resolve the recorded selector/magic and empty-validator construction failures without fabricating parameters or weakening guards. Bundle consistency alone cannot supply this authentication. |
| Random-source protocol | Authenticated seed/round and finality proof plus cryptographically anchored seal inclusion before a fixed future seed was publicly knowable; uniqueness/bias/withholding analysis | Bind the unchanged set, source/round, all pages and recovery. Neither signed seed, Merkle membership, observed checkpoint order nor this import tool proves unpredictability or pre-release causality. |
| Funding operator, after admission gates | Reconcile the original faucet request by its exact identity; then fund a freshly checked current-chain recipient within the original budget | Preserve the existing unknown-send lock; no automatic replacement or inference of disposal from new-chain absence. |

After those prerequisites pass, rerun the original fresh live preflight for
network/instance, full contract/key/asset identities, registered startup,
call stack/session/sig_hash, nonce, expiry, fees, state endpoints and balances.
Only then may the already authorized new isolated AMM/Curve settlement and
ordinary-wallet claim plan proceed. This continuation does not waive any gate.
