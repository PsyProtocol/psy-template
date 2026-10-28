# Checkpoint 6085/6086 compatibility diagnosis

## Result and release boundary

Base application `1b0188ac5ab1e899f67d516359b91188cf490a15`, existing
`markets-batch-capacity-recovery-20261020` branch. Frozen SDK
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, Node/client source
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. Source pins were checked again after
the build. No Node, SDK, dependency, old contract, wallet or gateway change.

**The two original proof/resource tuples still fail cryptographic verification.**
This investigation closes decoder and verification-entry-point hypotheses. It
also reproduces a separate resource-construction configuration blocker. It does
not yet identify whether the running prover used different resources, returned
incorrect proof bytes, or has another proving/release defect. No alternate key,
network parameters or backend was tried to obtain acceptance. Random mode remains
closed, and these results authorize neither finality nor financial execution.

## Exact reproduction

| Check | Observed result |
| --- | --- |
| Original 6085 proof | 130,328 bytes; SHA256 `7f59e1b7028c9e36b06606a9009cee200ecf2b13913e9a82cc83bf34862925db` |
| Original 6086 proof | 130,328 bytes; SHA256 `bb7a12da2e29fc8a34b6abdfb61956a1d9f36f032c3b2a8952385a9ea71be3c3` |
| Fresh read of both requested IDs | One HTTP JSON-RPC batch, two results, both byte-identical to the originals; observation only, no authenticated history/finality |
| Strict application decode vs official SDK decode | Equal; each serializer roundtrip reproduces every original byte |
| Owned application verifier | Both fail the vanishing-polynomial identity below |
| Official SDK cached verifier | Both independently fail the same identity |
| Cached genesis vs actual frozen genesis constructor | Verifier-only data, common data and fingerprint equal |
| Final transition source construction | Blocked before transition construction by the official network configuration guard |
| Application, SDK and Node Cargo locks | All four Plonky2 packages resolve to backend `736572e…`, with the same inherited patch; the nominal `1dfe611…` declaration is not the resolved revision |

Both verification paths first accept the proof shape, then fail here:

```text
vanishing_polys_zeta[i] == z_h_zeta * reduce_with_powers(chunk, zeta_pow_deg)
```

This is a polynomial consistency check before FRI verification, checkpoint
root/leaf opening, finality or randomness checks. It is not a Merkle membership,
cumulative-hash formula, RPC timeout or fee failure. Passing proof shape and
roundtrip does not establish that the proof is cryptographically valid.

The SDK path is [`zk_verifier.rs:67–94`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_plonky2_circuits/src/zk_verifier.rs#L67),
through `GenericCircuitVerifier` and the borrowed verifier. The application owned
verifier and borrowed verifier compute the same challenges and polynomial check
before their differing FRI implementations; both paths were actually executed.
The new [diagnostic](../../amm/u124/vm-tests/src/bin/diagnose_checkpoint_resources.rs)
records individual outcomes, public inputs, shape, key/common identities and
decode equivalence without selecting a replacement verifier.

| Fixed resource | Identity |
| --- | --- |
| Final minified transition type | 32, `GenerateRollupStateTransitionProof` |
| Fingerprint | `5e4c467c5e5984b52b2ce8a8dc1401ef3d6046ef3b529935e4cc840112e63f06` |
| Verifier-only bincode SHA256 | `8816e9054d99382ce4d2d530505b436bb7109bee26102e4eb6afde57cdad51dd` |
| Common-data bincode SHA256 | `bd7b8b4c937b134acf2bf69547776201a6a5115b63679e57b6944a804070377d` |
| Common degree / public inputs | 12 / 4 |
| Captured proof shape | 5 constants, 135 wires, 80 sigmas, 16 quotient openings, 28 FRI query rounds |

The resource hashes use `bincode::serialize` of the actual frozen native structs;
they are not SHA256 of the generated Rust file or JSON text. File identities,
lock resolution and the diagnostic binary/source digest are separately recorded
in `cohort-audit.json`.

## Runtime parameter blocker, kept separate from proof failure

Compilation and execution retained `PSY_NETWORK=testnet`, explicit frozen
`psy-sdk/psy-genesis/config.json`, profile `mainnet-beta-20261027-v1`, release mode,
Rust `nightly-2025-09-20`, two Cargo jobs and two Rayon threads. The compiled magic
is `1384803358401154921` (`0x1337CF514544CF69`).

The frozen [`chain_id.rs:33–39,158`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_core/src/constants/chain_id.rs#L33)
maps that magic to `LocalDevnet`. The official network constructor then loads the
`localhost` rotation section. Its guard at
[`network_config.rs:28–57`](https://github.com/PsyProtocol/psy-node/blob/b280d714a8f0930c61962c885374ea63ea63d274/psy_data/src/config/network_config.rs#L28)
rejects the unchanged runtime selector:

```text
official frozen network resource construction:
PSY_NETWORK testnet does not match localhost
```

Both `localhost` and `testnet` sections in this frozen config have the same magic
and zero injected validators for realm 0 and realm 1. The loader requires a
nonempty uniform validator set and derives validator sub-IDs and the compiled
epoch length at lines 60–80. Merely changing a label would not supply these
missing public construction inputs. No configuration alias, fake validator set,
environment rewrite or regenerated cache was installed.

This blocker explains why the official full source resource constructor cannot
currently reproduce the transition key in this frozen deployment configuration.
**It does not explain the separate cached-key polynomial rejection by itself:**
the cached verifier path does not call this rotation loader.

The configured public deployment document was read once with TLS and hostname
verification enabled. It supplies service/L1 deployment data and a Groth16
trust-setup archive reference, but not the missing Plonky2 checkpoint construction
parameters or service binary identity. That archive was not downloaded or
installed; Groth16 bridge setup is not a replacement for these native resources.

## Application changes and verification

- Added an offline diagnostic using the actual frozen SDK API. It reads each
  proof once and reports hashes of exactly those bytes, compares official and
  strict decoding, and executes both native verification entry points.
- Construction, read/decode/comparison and cached-inventory failures remain
  distinct. Failures are written to a fresh report and fsynced; no overwrite,
  verifier fallback, trust-resource installation or broadcast occurs.
- Added [real native CLI regressions](../../batching/random-order/checkpoint_diagnostic_regression.py):
  the original two rejection results, official construction rejection,
  malformed/trailing bytes, substituted original proof and output collision.
  Decode failures and substituted data cannot be labeled as the original
  cryptographic failure. All captured proofs remain rejected; the regression
  runner passing is not proof acceptance.
- Different-model read-only review preceded execution. The reviewed failure
  classification and input-snapshot repairs were included in the final build.

Two bounded release builds completed, approximately 46.6 seconds each. The final
serial regression process family took approximately 31.1 seconds, sampled RSS
peak 490,720 KiB. These are diagnostic/build measurements, including repeated
genesis resource construction, not market proof benchmarks, physical memory
peaks, network confirmation latency or TPS. No new transaction/checkpoint proof,
deployment, fill, claim or fee was generated. The original artifacts remain
unchanged.

The first local audit-script attempt lacked Python's `tomllib`; its failure is
retained and the corrected lock projection checked the existing files without
changing dependencies. The first re-read report projected named RPC parameters
as positional parameters; the saved HTTP response was reparsed into
`proof-recheck-v2.json` without another request. Both original reports remain.
The declared limit of two read-only HTTP requests was used: one deployment
document and one proof batch. There were no retries or worker job leases.

## Required upstream handoff and acceptance

No private key, signing witness, password or wallet recovery file is required.
Deliver public artifacts for the **same chain instance and the exact captured
proofs**, rather than a branch name alone.

| Owner | Required concrete delivery | Independent acceptance |
| --- | --- | --- |
| Running coordinator/edge/prover release owners | Source commits, backend revision, features, build/binary or image digest and active public circuit configuration associated with the captured IDs; identify the actual proof job circuit type and final minifier, not merely a similar ABI | Match proof SHA256 above to stored/emitted bytes and a service-side verification result under the declared resources; explain any mismatch |
| SDK/circuit release owners | A reviewed network selector/magic mapping and the injected validator count/sub-IDs, epoch length, Endcap identity, tree heights, whitelist inputs and minifier configuration used to build the running transition resources | Reproduce the official network constructor without removing guards or inventing parameters; require its published genesis/final-transition fingerprint assertions to pass |
| SDK/circuit release owners | Exact final transition verifier-only and common-data bytes, encoding and SHA256; coherent generated cache pair, build recipe and a known-valid public positive vector | Compare with the fixed identities above, then verify both originals and the positive vector independently; reject altered PIs, swapped common data and wrong circuit identity |
| Coordinator/edge/prover owners if resources match | Proof bytes at generation, verified admission and stored RPC lookup, with checkpoint/job association and expected four public inputs; include bincode wire/version | Establish where the original bytes diverge or the proof became invalid; a parse success or returned `verified: true` flag is insufficient |

If the running cohort differs, adopting it is an explicit SDK migration task,
not an automatic compatibility fallback in this application. If it matches,
the proof generator/storage/admission owner must resolve the failing tuple.
Until that evidence arrives, no application-side change can legitimately turn
these two failures into valid checkpoint proofs. Finality, qualified entropy and
seal-before-release authentication remain separate unclosed gates.

## Reproduction and evidence

Use the existing frozen-source materialization workflow with
`batching/dependencies/prepare_mainnet_beta_application.py`, a fresh application
output, the declared domain/configuration, and `cargo +nightly-2025-09-20 build
--release --locked --offline --manifest-path <application>/Cargo.toml --bin
diagnose_checkpoint_resources`. The diagnostic accepts:

```text
diagnose_checkpoint_resources cached|constructed PREVIOUS_PROOF CURRENT_PROOF FRESH_REPORT
python3 batching/random-order/checkpoint_diagnostic_regression.py \
  --binary <built-diagnostic> --evidence <extracted-public> --out <fresh-regression>
```

The native CLI exits nonzero for these incompatible tuples. The regression runner
exits zero only when the expected rejection and evidence-classification checks
hold. It does not submit or generate proofs.

[Public reports, original inputs, complete request/response, build/regression records and digested archive](../../executor/verification/2026-10-28-checkpoint-compatibility-v1/manifest.json).
[Previous untouched capture and guarded failure replay](../../executor/verification/2026-10-28-random-source-boundary-v1/manifest.json).
