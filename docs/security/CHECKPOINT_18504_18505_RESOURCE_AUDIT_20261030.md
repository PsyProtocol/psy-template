# Checkpoints 18504/18505: resource and stored-data diagnosis

## Result

Base application `361c37690b6600c9d5b63039b4772e82bfdd1f1e`, existing
`markets-batch-capacity-recovery-20261020` branch. SDK remains mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`; consumed client/Node source
`b280d714a8f0930c61962c885374ea63ea63d274`; resolved backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. No Node, dependency, configuration,
old contract, wallet history or original evidence was modified. No financial
worker was running at entry. Root owned the single bounded diagnostic worker.

**Neither original transition proof is accepted.** This milestone substantially
narrows the investigation, but does not establish which running-release,
proving or stored-data defect caused it. It is not evidence that the chain is
invalid. No replacement verifier or configuration was selected to obtain
acceptance, and no live financial request was sent.

The new findings are:

1. A fresh read of each exact checkpoint returns bytes identical to the original.
   Transport/JSON corruption in the local capture is not supported by this
   reproduction. The bodies differ throughout; this is not one proof reused
   with only its trailing public inputs replaced.
2. All 25 cached verifier fingerprints recompute correctly. A real synthetic
   genesis proof verifies under source-built, SDK cached and owned cached paths;
   changing its public inputs is rejected. This proves those local paths are
   capable of acceptance; it does not qualify either transition proof or the
   chain's genesis.
3. The final minified transition wrapper can be reconstructed from the frozen
   cached child/genesis identities without constructing the missing validator
   rotation. Its fingerprint, verifier-only data and common data exactly match
   the cache. This is a **partial source/resource reconstruction**, not a full
   reconstruction of the running network or its child circuits.
4. The observed 18505 leaf preimage and Merkle path are internally consistent,
   but its observed root/leaf, the unverified 18504 PI, and the fixed transition
   fingerprint do **not** reproduce the returned 18505 PI under the frozen SDK's
   cumulative formula. This is a second diagnostic inconsistency. All inputs
   are still observations/unverified PIs; it does not authenticate a fork,
   numeric adjacency, finality or a particular running version.

## Exact identities and narrowed hypotheses

| Item | Value |
| --- | --- |
| 18504 proof | 130328 bytes; SHA256 `caf28f81044ec8a7ae1bb842f4225ca2e0c9fe2dc55cf9707f08940292712f9e` |
| 18505 proof | 130328 bytes; SHA256 `19b69db6ffe0d2d09c1e60e14a692cbda90d8e8afa2a8080f4f85c4fe2ad5b0c` |
| Expected job kind | 32, `GenerateRollupStateTransitionProof`, according to the frozen RPC/storage/worker path |
| Fixed transition fingerprint | `5e4c467c5e5984b52b2ce8a8dc1401ef3d6046ef3b529935e4cc840112e63f06` |
| Verifier-only bincode SHA256 | `8816e9054d99382ce4d2d530505b436bb7109bee26102e4eb6afde57cdad51dd` |
| Common-data bincode SHA256 | `bd7b8b4c937b134acf2bf69547776201a6a5115b63679e57b6944a804070377d` |
| Wrapper child kind / fingerprint | 40 / `5b0d8a0845e666b230af055b8472d88f525e5c9bea1ca9ba466def59c1dd7818` |
| Genesis fingerprint | `ef362aad8a2686a173a67d7aedc881d203754a105fe8134d82786111a8554208` |
| RPC job reference for 18504 | pending ID 18506; scope nonce `311153078091084680002835001928641282806` |
| RPC job reference for 18505 | pending ID 18507; scope nonce `297803376811945968019439126552507028936` |

The job references and six completed jobs reported for each checkpoint are raw
RPC observations. They help locate records; they do not certify acceptance,
service identity or finality. Proof length and common shape cannot identify the
correct key by themselves: the valid synthetic genesis control also has 130328
bytes. No search across alternative keys was performed on the real proofs.

Both official SDK and application-owned verification fail here, before FRI:

```text
vanishing_polys_zeta[i] == z_h_zeta * reduce_with_powers(chunk, zeta_pow_deg)
```

Strict application decoding and official SDK decoding have exact byte-for-byte
roundtrips. New public Fiat-Shamir diagnostics record the circuit digest,
public-input hash, beta/gamma/alpha/delta challenges and zeta under the unchanged
key. These let the running prover compare the first divergent stage without
sharing a secret witness. They are not a new verifier or evidence of acceptance.

The separately observed cumulative relation is:

```text
step_18505  = H(H(observed_root_18505, observed_leaf_hash_18505), fixed_fp)
chain_18505 = H(unverified_PI_18504, step_18505)
```

Expected hash:
`2fa7c7d53fe92da4d4463a75a6813040db35127d18fa003c882100076b196235`

Returned unverified PI:
`a0705ad82ecb06bdd202249204dda6d0baf625a459e1147900763f890c7ac4ec`

Observed root:
`01a98f88892cc1012f44d3be94c81d8e0466126c205f3c622bf903d19c9c3cc9`

Observed leaf hash:
`6b9ef815825893e5e6267294f938cdd16f7989bf6dd51ee645770c2816ebf122`

The frozen source uses this relation in both the SDK helper and coordinator
commit validation. A different running fingerprint/protocol, a proof record
associated with a different state/history, or an incorrect proof/PI remain
possible. The available evidence does not select among them.

## Parameters and source checks

All **2756 pinned source files** were checked when creating each new application
snapshot. Application, SDK and Node Cargo locks resolve `plonky2`,
`plonky2_field`, `plonky2_maybe_rayon` and `plonky2_util` to the same backend
revision above. The nominal alternate revision in dependency declarations is
not the resolved revision. No dependency was switched.

Build/run profile stays `PSY_NETWORK=testnet`,
`PSY_MARKET_TESTNET_PROFILE=mainnet-beta-20261027-v1`, explicit frozen genesis
configuration, release/offline/locked, Rust `nightly-2025-09-20`, two build jobs
and two Rayon threads on `aarch64-apple-darwin`. Selected inherited Rust flags,
encoded flags, wrapper and target overrides were absent. The compiled magic is
`1384803358401154921`. Resource metadata: degree 12, four public inputs,
135 wires, 80 routed wires, two challenges, quotient degree factor 8, FRI rate
bits 3/cap height 4/28 queries/16 PoW bits, reduction `[4,5]`.

Full official network construction still fails at the unchanged guard:
`PSY_NETWORK testnet does not match localhost`. The frozen chain ID maps that
magic to `LocalDevnet`, while the runtime selector is `testnet`; both frozen
sections contain empty validator arrays. Neither relabeling the environment nor
inventing validators is a valid repair. This explains the full constructor
blocker, **not** the cached-key polynomial rejection. The new wrapper-only audit
success does not supply missing rotation or running-service parameters.

## Application changes and regression coverage

- [Pinned read-only capture](../../batching/random-order/capture_checkpoint_pair.py)
  now captures one exact proof at a time with bounded transport, original SHA256,
  strict integer IDs/bytes, raw failure preservation and no retries. It also
  collects public pending/job references. RPC errors are not absence evidence.
- [Diagnostic](../../amm/u124/vm-tests/src/bin/diagnose_checkpoint_resources.rs)
  adds fixed-cache fingerprint inventory, an actual synthetic genesis control,
  final-wrapper/source comparison, public transcript diagnostics and observed
  PI/opening consistency. Real proof verification always uses the original
  frozen cache. Diagnostic errors and panics are recorded; a missing/failed
  requested check cannot turn into successful process exit. `allProofsMatched`
  remains distinct from additional diagnostic completion.
- [Regression runner](../../batching/random-order/checkpoint_diagnostic_regression.py)
  accepts an explicit original-pair manifest instead of hardcoding the older
  6085/6086 pair. Original defaults remain. Tests separate malformed/trailing
  data, substituted originals, constructor failure, cryptographic rejection and
  output collisions. Positive-control success never relabels the real pair.
- Envelope tests reject wrong/float IDs, RPC errors, truncated JSON, invalid
  byte types/ranges, empty proofs and digest substitutions. CLI tests enforce
  panic/error handling and mandatory requested-check completion. A final-binary
  check re-verifies the **saved** control without generating another proof.

Only one synthetic genesis proof was generated. There were ten primary bounded read-only
RPC requests and a separately declared three-request current-cohort check, with
no retries or live transaction. Original bytes, both application
compile failures and all later snapshots/reports are retained. No existing
market/full UPS/financial experiment was restarted.

## Fresh current-cohort check

To avoid blocking on historical records after a possible service repair, a
separate budget allowed exactly three further read-only requests: one head and
two current proofs. The observed head was **19322**. Neither 19321 nor 19322
passes either frozen verification path; both fail the same polynomial identity.
They are separate captures, not replacements for 18504/18505.

- 19321: 130328 bytes, SHA256
  `4f54ba7dceed0a5e431439fb55091457881896c7cbe95b55deae1de95e96c171`.
- 19322: 130328 bytes, SHA256
  `54ba923d86d00e720f324c20ea6684946309bd172a95b4889f256b57ad098b6c`.

No current release identity or finality is authenticated by this observation.
It confirms that the observed compatibility problem is not limited to the two
older records. The total read budget was 13; financial operations and fees are
zero. No funding request or wallet state was changed.

## Specific upstream delivery and acceptance checklist

| Owner | Required public delivery | Acceptance / next diagnostic |
| --- | --- | --- |
| Coordinator storage / edge | For checkpoints 18504/18505 and pending IDs 18506/18507 above, export the exact `get_verifiable_checkpoint_state_transition_and_zkp` records: proof SHA256, state-transition statement, root/leaf, predecessor chain hash, fingerprint and job identity; identify the snapshot/replica serving each endpoint | Compare the proof hashes and observed openings above. Explain why the served 18505 PI does not satisfy the frozen cumulative relation, or supply the actual versioned relation and correct atomic record. Do not overwrite the original records. |
| Prover release owner | Running kind-32 verifier fingerprint, serialized verifier-only/common hashes, child kind-40/genesis identities and corresponding public source/build manifest (including compiler, backend, target/features and parameters) | Compare directly to the fixed hashes above. If different, state the release incompatibility; do not simply give an arbitrary key that makes a proof pass. If identical, compare the recorded Fiat-Shamir inputs/challenges and the quotient residual under the same exact bytes. |
| Worker / commit verification owner | Public verification/acceptance logs for those job IDs: proof hash, job type, expected/actual PI and verifier identity at worker submission and coordinator commit | The frozen source verifies proof bytes in `worker_handler.rs` and checks cumulative commitment at commit. Reconcile these checks with the stored tuple returned to clients; a job-completed counter is insufficient. |
| Network configuration owner | Reproducible current public chain-domain/rotation parameters: exact selector/magic, genesis anchor, epoch length, validator/sub-ID sets and fixed construction inputs | Resolve the `testnet`/`LocalDevnet` guard and empty validator sets without changing the selected SDK or fabricating parameters. Full reconstruction must match the approved release; wrapper-only equality is insufficient. |
| Test funding operator, after proof/admission prerequisites | Original faucet receipt/transaction identity or definitive rejection/disposal for request SHA256 `85332da2e78775c0653737658234df46df80a5e326ee3440afb81879ba2d286d`, current verified recipient 223232 | Preserve original send lock. No automatic resend, replacement payment or inference of disposal from an uninitialized receiver. Funding does not waive proof/network/resource checks. |

No private key, mnemonic, signed-secret witness or wallet recovery file is needed.
A branch name alone cannot prove the running verifier identity. The checklist
asks for exact public proof/resource/record correspondence, not a version number
as a substitute for evidence.

## Live settlement gate and evidence

Real AMM/Curve settlement and ordinary-wallet claims remain **not performed**.
Before proceeding, the actual current proof/approved resources and state lineage
must verify, then the original fresh instance/key/asset/layout/fee/nonce/balance
and budget checks must pass. A reviewed new instance is required; no old contract
will be updated to probe compatibility. Unknown original broadcasts are not
re-signed or replaced. Existing v13 synthetic evidence remains its original
scope; it does not supply live receipts.

Public evidence: [index](../../executor/verification/2026-10-30-checkpoint-pair-resource-audit-v1/index.json)
and [summary](../../executor/verification/2026-10-30-checkpoint-pair-resource-audit-v1/SUMMARY.json).
Reproduction uses the unchanged environment above, original pair
[manifest](../../batching/random-order/fixtures/checkpoint-18504-18505.json),
fresh output directories and `diagnose_checkpoint_resources cached-wrapper-audit
18504.bin 18505.bin FRESH_REPORT OBSERVED_OPENING`.
The synthetic control is run once with `cached-with-control`; later tests verify
its saved bytes. Neither command authorizes a financial operation.
