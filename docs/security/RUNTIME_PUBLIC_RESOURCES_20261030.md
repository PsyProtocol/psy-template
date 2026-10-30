# Runtime public resources and L1 anchor observations — 30 October 2026

## Result

This continuation **obtained and compared actual public client verification
metadata**. It did not obtain the running checkpoint-transition verifier/common
bundle, authenticate canonical finality, qualify producer entropy, or authorize
a live market transaction. Original failures remain unresolved, not attributed
to a particular running build or to chain invalidity.

The branch remains `markets-batch-capacity-recovery-20261020`, base
`d28412704391ccaa58a204671b255bb86e0d0788`. The SDK remains
`c92880c8b6e2c8d392f19368bc8801a2584fd427`; consumed client source remains
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. Frozen source hashes were checked
before both application snapshots and again at close. No financial/proving
worker was running at entry. Root owned the bounded read-only diagnostic work.
There were no Node/SDK changes, old contract updates, funding requests, new
proofs, live fills, ordinary-wallet claims, or live fees.

## Acquired material and its precise authority

| Material | Actual observation | What it does not establish |
| --- | --- | --- |
| `https://prove-stg.psy-protocol.xyz`, `psy_get_circuits_data`, params `[]` | HTTP 200; 25,921-byte encoded-JSON registry. Full Endcap verifier equals the compiled frozen key; advertised fingerprint recomputes. | No checkpoint kind-32 verifier/common export; no running image attestation or chain-instance authentication. |
| `https://psy-config-stg.pages.dev/config.json` | HTTP 200; public Sepolia configuration, StateManager and proving/coordinator URLs. | Public configuration is not proof that any service runs a particular commit/configuration. |
| Config-declared Sepolia RPC | Chain ID 11155111; one fixed hash selected from its `finalized` response; code, getters and EIP-1967 implementation read at that same hash with `requireCanonical: true`. | The RPC's `finalized` label and canonicality assertion are not independently verified consensus finality. |
| Coordinator historical checkpoint-tree root | Checkpoint 20724 root exactly matches the StateManager getter under frozen root-word packing. | Agreement between RPC observations is not an authenticated L1 storage proof or canonical history. |
| `eth_getProof` at that fixed hash | Rejected with `-32602`, `distance to target block exceeds maximum proof window`; no retry or moving-block fallback. | No account/storage proof was obtained or verified. |
| Public trust-setup installer and archive HEAD | Installer declares Groth16 circuit/pk/vk files. Archive HEAD returns 200 and 2,044,939,481 bytes. | Archive body was not downloaded or inspected; its declared SHA is not verified. No Plonky2 CST resources were acquired from it. Nothing was executed or installed. |
| Connected GitHub releases metadata | Two listed releases, v0.1.0/v0.1.1, contain binary archives and checksum assets, without a separately listed CST resource bundle. | Archive contents were not inspected; neither release identifies the running services. No binary was downloaded or executed. |

The proof proxy endpoint is declared by the frozen configuration and its
`get_circuits_data` implementation returns its in-memory client registry. The
actual response inventory, rather than a guessed URL/key, was inspected. That
registry contains UPS/CFC/signature/aggregation metadata, not the coordinator's
`GenerateRollupStateTransitionProof` verifier or common data. A matching public
Endcap key is useful and closes that exact comparison; it cannot repair a
different proof role.

```text
Runtime/compiled client Endcap fingerprint:
  78b73eceb32a446a7cc04ca3ad36e0d856293f366593de8f6132c9240f91c6a3
Exact compiled/remote verifier bincode SHA256:
  17324fd6b8370138844b79ef65932692a8708edbacfbff4e2e358dae04bde41a
Compiled common bincode SHA256 (not supplied by the RPC):
  bd7b8b4c937b134acf2bf69547776201a6a5115b63679e57b6944a804070377d
```

The common-data digest also occurs in the frozen checkpoint resources. Common
shape equality does not identify a circuit or permit key substitution.

## Application implementation and verification

[Resource inspection](../../amm/u124/vm-tests/src/public_runtime_resources.rs)
accepts a bounded captured JSON-RPC envelope, validates its identity, recomputes
the remote Endcap fingerprint, and compares the complete verifier against the
compiled frozen resource. It never installs remote verifier/common data. The
compiled network-domain guard remains mandatory. Unknown registry fields are
inventoried by name; a claimed certificate or `verified` field has no authority.
Its report explicitly denies signing, broadcasting, approved-call-stack
verification, runtime/chain authentication, finality and qualified randomness.

The [native comparison CLI](../../amm/u124/vm-tests/src/bin/inspect_public_runtime_resources.rs)
reads bounded regular captures, hashes the same bytes it parses, and saves a
fresh fsynced report. It has no RPC, wallet, deployment, signing or sending path.
The original response and the explicit public Endcap-only projection produced
the same verifier/fingerprint/common identities. The raw registry remains in
private quarantine; its hash, field inventory and public resource projection
are published. No secret witness is required.

Two focused native tests passed, covering exact-resource comparison, refusal to
promote an injected certificate claim, fingerprint/config substitution, wrong
response IDs, an RPC error, oversize input and duplicate envelope fields. These
are metadata tests, not new full UPS or browser-wallet acceptance.

The [specific wrong-role diagnostic](../../amm/u124/vm-tests/src/bin/diagnose_checkpoint_as_client_endcap.rs)
first matches that runtime metadata to the fixed client Endcap, then checks the
original 18504/18505 and already-archived 20171/20172 bytes under that one known
client role. All four reject at the same quotient-identity condition. This
excludes the narrow hypothesis that these exact captures are valid proofs for
the acquired fixed client Endcap. It does not identify the actual failing CST
resource/record, try arbitrary keys, or authenticate a checkpoint. An Endcap
success would still not be admitted as a CST or as an approved market call.
No proof was regenerated, no original capture was refetched, and no replacement
verification resource was adopted.

## L1 observation, not finality certification

The source-declared L1 endpoint was
`https://rpc-eth-stg.psy-protocol.xyz`. Getter selectors were generated locally
with installed `cast` 1.5.1, without installing dependencies:

```text
lastFinalizedCheckpointId()       0x3590a6a3
lastVerifiedCheckpointRoot()      0x6bf60cb1
```

The fixed observed block is `0xb780fd`, hash
`0x7c1d565b5dc220ecb40e2ef4a76d1c09c29c59b00b28823575737c8c144abf43`.
StateManager is `0x4eC67bA22A3F7a9Af1f19F480e5Df33bFD7B06F1`.
Its getter returned checkpoint 20724 and root
`0x52cfa2ca11b365b14e1c93d6b7391b070cb3538e3e0aa13f5eb6f3608b923499`.
The coordinator's exact historical root equals this word without the `0x`
prefix. EIP-1967 storage points to
`0xd1ca5e95e2b58461343f9d55c61fbb4b6662fb04`; code was acquired at the same
fixed hash and is archived as public bytecode. Its source/build equivalence,
upgrade authority, header consensus and account/storage proofs are unverified.

The inspected local StateManager source exposes both proof-based `finalize`
and admin-only `forceSetState`. That source is **not authenticated as the deployed
implementation**. A stored root alone does not show which route established it
or which upgrade/admin rules apply. No such trust boundary is silently accepted.
The rejected storage-proof request is preserved; it is not called a bad proof
or worked around by replacing the fixed finalized block with `latest`.

## What can be completed without changing Node

| Owner / needed delivery | Exact public material / interface | Acceptance requirement |
| --- | --- | --- |
| Runtime/proving operator | Export the actual kind-32 verifier-only data, common data, recomputed fingerprint and child/genesis identities from the running build, with binary/build/config digests and public network/rotation parameters. | Reproduce from pinned sources/parameters; compare exact resource bytes to reviewed resources. A digest claim alone does not authenticate the running build or authorize another key. Existing [delivery importer](CHECKPOINT_PUBLIC_DELIVERY_20261030.md) remains read-only. |
| Coordinator/storage operator | Export the two complete `PsyVerifiableCheckpointTransitionWithProof` records for 18504/18505 from one identified consistent snapshot, including job kind/reference, checkpoint leaf, old/new roots and exact proof bytes. | Bind the original SHA256s and pending/job references; verify actual crypto and cumulative PI/leaf/root correspondence. Supply public verification logs with first divergent stage, not secret witnesses. |
| L1 infrastructure / security | An archival EIP-1186 account/storage proof at the exact fixed header, reviewed proxy/implementation source and storage layout, upgrade/admin configuration and acceptance provenance; a verified consensus/light-client or explicitly reviewed anchor policy. | Verify header ancestry/finality against an independently fixed trust anchor, then account/storage/code identity and the checkpoint-root inclusion. RPC agreement or a `finalized` label is insufficient. An archive endpoint can fix the observed proof-window failure without a Node patch. |
| Randomness protocol owner | A versioned, fixed future round with an authenticated, unique output and public verification key/proof; evidence that the immutable batch commitment was accepted before that round's unpredictability/release boundary; explicit withholding/bias assumptions. | Circuit/SD-key constraints bind chain instance, set/count/cutoff, source, fixed round, seed, whole permutation and all recovery pages. Reject past/chosen rounds, re-draws, changed roots and selective restart. A producer-local RNG witness plus membership does not meet this requirement. |

Resource/record export can be operational work against existing artifacts; it
does not intrinsically require a Node source modification. A reviewed external
finality/beacon adapter could also live in the application/SD-key layer, but no
valid certificate, fixed verifier or trust anchor can be manufactured from the
current RPC assertions. The current frozen circuit only commits a seed witness;
the [prior source audit](CHECKPOINT_RANDOM_SOURCE_CAUSE_REVIEW_20261030.md)
still applies. No claim of seal-before-producer-knowledge follows from S < C < D.

## Budget, reproducibility and next admission gate

All 10 declared logical RPC reads were used: one client registry, six fixed L1
identity/state observations, one implementation code read, one rejected account
proof, and one coordinator historical root. Three HTTPS configuration reads
were used: config, installer source and archive HEAD. Two GitHub release-metadata
fetches were made; the first response-shape misunderstanding caused a redundant
metadata fetch. No financial request or proof generation was repeated.

Three bounded native build/test commands completed; the two unit tests passed.
Four native inspection invocations completed. Build/test and inspection logs,
all sampled process-family RSS and failed RPC results are retained. The first
build took 47.755 s; the unit build/run 50.989 s; final two-binary build 48.799 s.
Each cold inspection process took approximately 4.15–4.16 s. These are resource
inspection/build timings, **not market proof, confirmation, wallet-arrival or
matched performance measurements**. RSS includes shared pages and is not a
physical peak. No cold/warm market speedup, TPS or production conclusion follows.

The original faucet send identity/unknown-result lock is unchanged. No new funds
or instances were requested. Before live settlement, the original fresh checks
must still establish current chain/dependency/key identities, actual proof and
call/session/sig_hash binding, nonce/expiry/fee/state endpoints, a bounded funded
plan and exact owned sending/reconciliation. Qualified random settlement also
needs the distinct finality and causal entropy evidence above. Current live
fills and ordinary-wallet claims for this continuation are **zero**.

See [public evidence and reproduction](../../executor/verification/2026-10-30-runtime-public-resources-v1/README.md).
