# Gloas certificate acquisition and conditional verification

## Outcome

This continuation acquired an actual Sepolia Gloas light-client finality update
and a matching bootstrap. Native verification passes the committee SSZ inclusion,
all 512 public-key validations, aggregate-key correspondence, all-participant
BLS signature, finality branch and both execution-parent-hash branches. The
Executor owns the verification process, binds every captured byte digest and
rejects an individually valid L1 inclusion report for a different execution hash.

**Canonical finality is not admitted.** The bootstrap came from the same provider
as the update and has no independently reviewed trust anchor. Native signature
verification is not a new SD-key constraint or full UPS. Running kind-32 CST
resources, a matching certified L1 state-inclusion packet and qualified seed
publication evidence remain missing. No transaction or ordinary-wallet claim
was made, and no public signature was repurposed into a random seed.

Branch remains `markets-batch-capacity-recovery-20261020`, base
`25c86f8830fe945379afb4f7d442a6f3ef8eb893`. SDK remains mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`. No financial/proving process was
running after the interruption check. Root was the sole execution owner. Node,
SDK, dependency versions, Cargo manifests/lockfiles, old contracts, market/key
semantics, original artifacts and unknown financial-send identities are unchanged.

## New acquisition findings

| Source / request | Actual outcome | Admission limit |
| --- | --- | --- |
| `sepolia.lightclient.xyz`, finality update | TLS transport failure, no response body | No retry or claim of a bad certificate. |
| `beaconstate-sepolia.chainsafe.io`, finality update | HTTP 404 | A checkpoint-sync endpoint need not serve light-client updates. |
| `lodestar-sepolia.chainsafe.io`, finality update | HTTP 200, Gloas data, signature slot 11469060 | Captured material is verified conditionally below, not trusted by its URL. |
| Bootstrap at the update's finalized beacon root | HTTP 500, `syncCommitteeWitness not available` | Original failure is preserved. |
| Bootstrap at the fixed attested beacon root | HTTP 200, 512-member current committee and 11-element branch | This supplied root is not independently trusted or claimed finalized. |
| Previous committee-period update | HTTP 200 | Captured only; no committee transition or historical signature chain is verified by this profile. |
| Genesis API and official Sepolia references | Public genesis root agrees; configuration supplies Gloas fork version/epoch | Network-domain reference is not a contemporary weak-subjectivity anchor. |
| Public `PsyProtocol/psy-contracts` tree and deployment artifacts | Solidity Groth16 verifiers, no standalone Plonky2 CST bundle; its StateManager is `0x1f17D331a635F3078129A37269CB3e6e595Ae8D8` | Different from observed `0x4eC67bA22A3F7a9Af1f19F480e5Df33bFD7B06F1`; manifest is not adopted for this instance. |

The separate contracts repository's default branch is `mainnet-beta`; the first
tree read against `main` failed before the actual branch was taken from the
root listing. That failed lookup is recorded, not presented as evidence of a
missing repository. The examined deploy script installs Groth16 Solidity
verifiers, which cannot replace the required kind-32 Plonky2 verifier/common data.

## Exact certificate and domain

```text
Unreviewed bootstrap / attested beacon root:
  0x01c0f75510dc725f37c689cce0711b4810e29e47c8b1ae9fd7a85dcda1734c47
Finalized beacon root proved relative to that attestation:
  0x160f787b86ec49f9c2fb849f573d019885e5ca066c94ba32e1a81ed113818227
Attested slot: 11469059; signature slot: 11469060; finalized slot: 11468992
Committee period: 1400; participation: 512 of 512
Conditional finalized execution parent hash:
  0x24d4e500db37e7546b055c816587dbed1e396ab5fac3dcd30258700b8e63e724
```

The network reference is Sepolia genesis validators root
`0xd8ea171f3c94aea21ebc42a1ed61052acf3f9209c00e4efbaaddac09ed9b8078`,
Gloas fork version `0x90000076`, activation epoch 353024. The official
[network configuration](https://github.com/eth-clients/sepolia/blob/main/metadata/config.yaml)
and [genesis reference](https://github.com/eth-clients/sepolia/blob/main/metadata/README.md)
were captured and their Git blob SHA1s match the repository inventory:
`bf938430a8f52f52e638fe3ad44f634f60b566d4` and
`8478ecb53f93da09e11bf52df690a003a8d8fa76`. Source SHA256s are archived.

The [Gloas sync specification](https://github.com/ethereum/consensus-specs/blob/master/specs/gloas/light-client/sync-protocol.md)
defines the compiled generalized indices: current committee 2945, finalized root
735, execution parent hash 2856. Its captured SHA256 is
`e0bd1537ff3bdcddafa708ddce35f97de0cac9aac19b08f022ee6c57db1b4f5e`.
The [light-client trust model](https://github.com/ethereum/consensus-specs/blob/master/specs/altair/light-client/sync-protocol.md)
requires an out-of-band trusted bootstrap root. Same-provider consistency does
not supply it. Moving source links are references, not runtime attestations.

## Native and Executor implementation

[`gloasCertificateInspector.rs`](../../executor/acceptance/gloasCertificateInspector.rs)
implements one explicit, read-only, same-committee-period Gloas profile:

- Exact typed envelopes, bounded inputs, canonical encodings and explicit
  network/genesis/fork domain; other forks and committee transitions reject.
- BeaconHeader SSZ roots; exact generalized-index branch depth; current committee
  membership in bootstrap state; finality membership in attested state; Gloas
  execution **parent** hash membership in each beacon body.
- SSZ root of all 512 48-byte committee keys plus aggregate key. Every key and
  signature is checked for valid subgroup/infinity encoding. The aggregate key
  must equal the sum of the complete committee. Legitimate repeated committee
  positions are preserved rather than deduplicated.
- Little-endian participation bits, at least two-thirds participation, slot
  ordering, exact committee period and `DOMAIN_SYNC_COMMITTEE` signing context.
- Complete input digests and fresh fsynced reports for acceptance/rejection.
  The policy explicitly denies independent review, signing and broadcasting.
  Flipping its `anchorReviewed` bit to true rejects; it is not a trust switch.

The build helper now has two fixed allowlisted source profiles. Default L1
behavior stays available; the new Gloas profile links **existing locked blst
0.3.17**, serde, SHA256 and anyhow artifacts. It reuses the exact successful
Cargo artifact stream from the preceding case, with library hashes checked
before/after compilation. Two rustc invocations build the new binary and tests;
no Cargo rebuild, dependency download/version change or SDK patch occurred.

[`consensusEvidence.mjs`](../../executor/consensusEvidence.mjs) seals and rechecks
the operator-reviewed binary, pins policy/bootstrap/update bytes, persists an
inspection intent and compares the stored report with its owned native output.
It has no page-supplied verifier/resource URL or financial route. Fresh-process
reinspection reproduces the same report. `inspectGloasExecutionEvidence` executes
both the certificate and existing L1 native checks itself; their execution hashes
must match exactly. A smaller L1 block number is not a substitute for ancestry
or exact inclusion. All canonical finality and financial authority flags stay false.

These checks are native evidence verification, **not CFC/SD-key/UPS constraints**.
Authorizing a market from a certificate would additionally need a reviewed
trust-anchor policy and circuit-consumable binding into actual spending/call
contexts, with complete UPS and fresh-instance testing. Neither a native report
nor proof aggregation establishes that binding by itself.

## Validation and L1 gap

The actual certificate passes all relation/signature checks. Three native unit
tests pass; 21 native mutation cases reject wrong domain/root, committee/key,
branch, slot/period, participant set, signature and authority claims. Executor
schema/byte binding tests and actual owned-native restart pass. Two independently
valid crypto results using different execution hashes are rejected by the
composition route; a positive certificate-plus-state composition is **not** tested.

The certificate's execution header was retrieved from the configured L1 RPC,
but both account-proof requests at that exact hash failed the proof window.
No latest-block fallback occurred. The previously saved paired packet remains
valid inclusion evidence for its own header, but is a different block. It was
not relabeled finalized. This retains the need for an archive proof at the exact
certified hash, or a separately designed prefetch schedule that preserves the
future finalized boundary candidate and matches a later authenticated update.

## Seed publication is a separate protocol dependency

The signed Gloas certificate commits beacon/execution data relative to a
committee. It contains no proof that Psy's producer-local `random_seed` was
unknown before sealing or first disclosed at a particular time. Multiple valid
attestations and participant subsets are possible; hashing a sync aggregate,
bitmap, timestamp or selectable block hash is not a qualified random beacon.
No such construction was added.

The existing v13 set/seed/page constraints and deterministic/producer-influenced
candidate modes are unchanged. Canonical set acceptance, qualified future entropy,
causal seal-before-release and eventual service remain distinct requirements.
No full-market fairness, censorship resistance or fully parallel same-pool
execution is implied by the certificate or batching work.

## Exact upstream handoff

[The machine-readable request](UPSTREAM_CHECKPOINT_RANDOMNESS_HANDOFF_20261030.json)
specifies the required files and acceptance checks:

1. **Running CST resources and stored records.** Public kind-32 verifier-only and
   common data, recomputed fingerprint, actual child/genesis identities,
   build/rotation/domain parameters and two consistent public stored records for
   original 18504/18505. Do not relabel a foreign resource as the frozen release,
   rebuild against default/empty validators, send a private database, or return
   the user Endcap key. Resource export is operational work and need not change Node.
2. **Independent current Beacon anchor.** An independently verified, finalized
   Sepolia beacon root within the weak-subjectivity period, with provenance and
   explicit review policy. The captured attested-root candidate is included for
   independent investigation, not already approved. Other periods require actual
   bootstrap/update witnesses and an implemented transition verifier.
3. **Exact matching execution inclusion.** An archive EIP-1186 packet at the
   certificate's execution hash, both account/code bindings and reviewed proxy/
   implementation/layout/upgrade semantics. The public repository's different
   deployment identity cannot close this item.
4. **Entropy/release certification and spending binding.** A fixed source/key and
   future round with authenticated unique output, explicit unpredictability and
   withholding/bias assumptions, and a batch acceptance commitment before that
   round's release boundary. Certificate commitments must be enforced by the
   spending proof, not just an Executor log. Existing producer-witness membership
   cannot manufacture those guarantees. No replacement beacon is adopted here.

Before any new financial plan, the original fresh identity/code/layout/key,
call-stack/session/sig_hash, nonce/expiry, fee/state endpoint, budget/funding and
owned exact-broadcast gates still apply. The original unknown faucet request
and account lock remain intact. There were zero live fills/claims or fees.

## Cost and evidence scope

The new inspector build took 3.135 s using already-built frozen libraries, with
sampled process-family RSS peak 205,392 KiB. That is not a cold SDK build or a
market proof benchmark. All native tests/inspection processes, failures, retries
(zero), transport results and sampled RSS are retained. Subsecond processes are
undersampled by the 1 s monitor; tiny samples are not real physical peaks.
No end-to-end speedup, confirmation/arrival latency, TPS or production claim is made.

See [public certificates, raw results and reproduction](../../executor/verification/2026-10-30-gloas-certificate-v1/README.md).
