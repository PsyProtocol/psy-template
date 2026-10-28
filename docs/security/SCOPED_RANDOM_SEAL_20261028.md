# Versioned scope, stored seal and complete permutation

## Delivered boundary

Application base `125cf50307efaf5c3591f01c693eb8a8136786ee`, existing
`markets-batch-capacity-recovery-20261020` branch; frozen mainnet-beta SDK
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, Node/client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. No Node, dependency, deployed contract,
wallet or gateway change. Root owned all writes and serial proof/verification
work. There were zero RPC calls, financial operations, deployments and fees.

This milestone implements a missing application protocol boundary: a new seal
must bind explicit chain-instance, source-definition/key-epoch,
finality-definition/key-epoch and causal-release-policy claims. The same stored
commitment drives the full permutation. Changing a claimed identity invalidates
the saved proof; **the claim itself is not authenticated by this component**.

The earlier 74-Felt candidate binds a genesis root and opaque source ID, but has
no explicit unique reset-instance or key-epoch fields. Adding those only in a
sidecar would allow them to change after sealing. The new encoding therefore
uses a new stored root and proof schema. No old sealed queue, deployed layout,
existing journal or saved proof is reinterpreted as this version.

Random execution remains disabled. No qualified entropy/finality/causal-release
provider or approved identity registry was installed. This is not a random market
contract, market SD-key, full UPS, live settlement, ordinary claim or timeout
refund acceptance. It does not repair the failing 6085/6086 checkpoint tuples.

## Encoding and circuit

[Client encoding](../../batching/random-order/scope.mjs) accepts exactly:

```text
version = 2
candidate = existing strict version-1 74-Felt AMM/Curve statement
chainInstanceId
sourceDefinitionSha256
sourceKeyEpoch
finalityDefinitionSha256
finalityKeyEpoch
releasePolicySha256
requestNonce
```

The four complete 32-byte identities are encoded as eight big-endian u32 words
each, in byte order. They are not reduced modulo Goldilocks or converted into
four Felt limbs. Leading zero words are retained; the complete identity must be
nonzero. Epochs and request nonce are canonical positive decimal strings below
`2^62`. These rules run in both client/native decoding and circuit constraints.

| Scope indices | Meaning |
| --- | --- |
| 0 | Version 2 |
| 1–8 | Complete chain-instance identity |
| 9–16 | Complete source-definition SHA256 |
| 17 | Source key epoch |
| 18–25 | Complete finality-definition SHA256 |
| 26 | Finality key epoch |
| 27–34 | Complete release-policy SHA256 |
| 35 | Request nonce |

Using the frozen SDK Poseidon implementation:

```text
scopedRoot = H(0x50535953434f5032 || baseFields[74] || scopeFields[36])
orderKey[i] = H(0x5053594f52445231 || scopedRoot || seed[4] || member[i][6])
```

The [native circuit](../../amm/u124/vm-tests/src/scoped_order.rs) reuses the exact
existing member validation, unsigned canonical full-key comparison and complete
permutation constraints. Rank ties retain owner/nonce ordering. Active members
occur once; inactive padding is canonical. Capacity remains four. Full U124 terms
remain bound by all four limbs of each terms commitment; no token arithmetic or
market pricing rule changes here.

The supplied checkpoint paths must open **scopedRoot itself** from the declared
vault's reviewed state slot, with the same contract code/layout/function roots
and vault/key identity. An old stored base root plus an unsealed context sidecar
cannot satisfy this relation. Packed roots crossing word boundaries are covered.

The 55 public inputs are:

```text
version[1], scopedRoot[4], checkpointRoot[4], sealCheckpoint[1],
scopeFields[36], seed[4], memberCount[1], rank[4]
```

The seed remains a supplied, unqualified input. A producer can construct another
conditional proof for another seed; preventing that requires the missing owned
beacon verifier and one-time on-chain draw state. Similarly, a source-definition
digest does not approve its contents or prove that its key epoch is authorized.
An approved adapter must bind these exact bytes to its independently reviewed
keys, instance, finality and release rules. No caller boolean, URL, signature or
opaque digest installs that authority.

## Verification and preserved evidence

- Client/native strict scope decoding, complete-byte identity changes,
  canonical bounds and disabled authorization are exercised. Existing
  deterministic builder and request-recovery tests remain passing.
- Shared synthetic fixtures derive layout metadata through the actual SDK ABI
  helper. Host membership tests cover AMM/Curve and packed root offsets 0–3,
  every scope word, digest/epoch boundaries and old-root rejection.
- Exactly two new synthetic component proofs were generated, one AMM and one
  Curve, with four members. Eight invalid circuit witness attempts reject
  instance/key/release substitutions, digest overflow, duplicate member/rank
  and late seal. Thirty-six changed public scope endpoints and the saved old
  membership proof reject.
- The final verifier source re-verifies those same saved proofs without creating
  replacements. The [saved-proof regression](../../batching/random-order/scoped_replay.py)
  verifies both and rejects 64 input, identity, checkpoint, layout, seed and
  proof-body mutations. Corrupted proof bytes and changed layout reach and fail
  cryptographic verification; they are not counted solely as parser failures.
- Client reconstruction produces the exact native fields/context for both
  markets, then the native CLI verifies the saved proofs using those client
  encodings. The two original v1 membership/permutation proofs also still
  verify under rebuilt v1 resources after the helper extraction.
- Review caught a proposed replay check that would count any nonzero exit as a
  successful rejection. Before execution, it was replaced by typed failure
  stages, exact input digests and normal exit 1. Panic exits 2; read/resource/
  domain failures cannot pass as expected endpoint/proof rejection. A real
  wrong-domain control is retained separately.

The native verifier saves a fresh fsynced report on success or verification
failure. Input files are snapshotted once before decoding; reported identities
describe the actual bytes used. It distinguishes domain, file read, decoding,
resource construction, public endpoint and cryptographic verification stages.
No report overwrites an existing file. Every report leaves authenticated
instance, finality, qualified source, causal sealing, full UPS and random
authorization false.

Resource build was about 0.093 seconds, synthetic AMM/Curve proving about
0.212/0.181 seconds and AMM component verification about 0.0047 seconds. These are
single synthetic component measurements, not full market UPS costs, network
confirmation/claim latency, cold/warm comparison, throughput or evidence of
production readiness. The serial proof harness took about 2.06 seconds and its
1-second sampled process-family RSS peak was 146,880 KiB. Sampling can miss short
peaks and double-count shared pages; this is not true physical peak memory.

## Still required before actual random settlement

1. Resolve the [checkpoint proof/resource mismatch](CHECKPOINT_PROOF_COMPATIBILITY_20261028.md)
   using the exact running proof cohort and public construction parameters.
2. Obtain an approved instance/finality verifier, qualified unique unpredictable
   beacon and causal seal-before-release protocol. Fixed heights or the existing
   producer-selected seed do not supply these guarantees.
3. Bind those verifiers to this versioned stored root and exact scope fields in
   a new market/key/full UPS. Add immutable draw consumption, cancellation,
   timeout/refund, fee limits and replacement-executor recovery. No arbitrary
   seed, reseal, deterministic fallback or silent migration of old queues.
4. Complete actual bytecode, ordered calls/session/sig_hash, U124 funds, state
   endpoints and fresh isolated settlement/ordinary claim/refund acceptance.

These are open requirements, not implemented capabilities hidden behind a
configuration switch. Global inclusion, censorship resistance, forced service,
comprehensive anti-MEV and cross-machine coordination are not established.
Shared-pool state remains ordered; proof aggregation is not same-pool parallelism.

[Public proof, rejection, client/native, legacy compatibility and resource records](../../executor/verification/2026-10-28-scoped-random-seal-v1/manifest.json).
Use the existing frozen-application helper and the archived test-only target
projection; `verify_scoped_order SCOPED_INPUT REVIEWED_LAYOUT EXPECTED_CHECKPOINT_ROOT
SEAL_CHECKPOINT PROOF FRESH_REPORT` re-verifies a saved component. It installs no
source and broadcasts nothing.
