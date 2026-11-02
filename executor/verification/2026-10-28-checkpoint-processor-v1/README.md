# Offline checkpoint processor evidence

Start with [SUMMARY.json](SUMMARY.json), [index.json](index.json) and the
[security report](../../../docs/security/CHECKPOINT_PROCESSOR_CANDIDATE_20261028.md).
This is a claims-first AMM/Curve candidate, not qualified randomness or network
acceptance. All identities, funds, checkpoint roots and seeds are synthetic.

The index records original/public and gzip digests. Each `files/...gz` expands to
one exact artifact; never overwrite original files when unpacking. Source and
request/proof bytes are unchanged. Only machine-local paths in logs, commands and
build manifests are redacted, explicitly recorded per file. No private-key,
mnemonic or signing/state-reader witness is included. `*-public-key-input.json`
is an explicit public projection, not a serialized signing witness.

## Evidence groups

- `final/`: final nonce-retiring source, policy, config, actual compilation
  artifacts, native/FT/NFT support and immutable compilation manifest. Its initial
  `BUILD.json` intentionally says full UPS verification is pending; completed
  acceptance is in the separate summary and current run reports.
- `market-checkpoint-retirement-20261028-v1/`: **current** four complete UPS
  requests/reports, public projections, measurements, bytecode/redraw regression,
  JavaScript checks and public key/code identities.
- `market-checkpoint-processor-fee-20261028-v1/`: prior fee-corrected acceptance,
  preserving the original AMM commitment instead of proving it again. Superseded
  function/code roots must not be substituted for current acceptance.
- `market-checkpoint-processor-20261028-v1/`: original build/native-ABI/fee
  failures, standalone source CFC, isolated signature reproduction, trace-only
  diagnostic and the exact fee-stack conflict reconstruction. A trace-only
  intentional stop is not a full UPS or an attack rejection.
- `prior-fee-candidate/` and `source-cfc-resources/`: exact earlier artifacts for
  those historical proofs. Historical success never enables current deployment.
- `dependencies/manifest.json`: frozen cohort and artifact inputs. SDK is
  `c92880c8b6e2c8d392f19368bc8801a2584fd427`, client/Node is
  `b280d714a8f0930c61962c885374ea63ea63d274`; no upstream patch was made.

Auxiliary identity-tool builds initially selected the wrong cached `anyhow`
feature unit. Failed builds are retained. The successful command uses the exact
unit from the application build. Derived public key hashes were checked against
all four current proven request endpoints. This is not a dependency migration.

## Reproduction

Materialize the exact reviewed cohort and use
`batching/dependencies/prepare_mainnet_beta_application.py --test-only` to create
a **fresh** application snapshot. It checks the fixed dependencies and copies
application sources/lockfile; it does not patch Node or SDK. Set `PSY_NETWORK` to
`testnet`, `PSY_CONFIG_PATH` to the frozen SDK Genesis config, and
`PSY_MARKET_TESTNET_PROFILE` to `mainnet-beta-20261027-v1`. Network magic must be
`1384803358401154921`. Use `nightly-2025-09-20`, release, `--locked --offline`,
`CARGO_BUILD_JOBS=2` and `RAYON_NUM_THREADS=2`. Preserve all original outputs.

Unpack `final/` into a new fixture directory. Run the recorded application
snapshot's `batch_lifecycle` binary with that directory as `BATCH_BUILD` and
`BATCH_PROOF_PROFILE=compact-v1`:

```text
processor_ --skip processor_checkpoint_source_cfc
           --skip processor_complete_claims_first_ups
           --skip processor_key_stack_reproduction
           --nocapture --test-threads=1
```

For fresh complete proofs, set a new, nonexistent `BATCH_FULL_UPS_OUT`, leave
`PROCESSOR_RESUME_COMMIT` and `PROCESSOR_KEY_TRACE` unset, and select:

```text
processor_complete_claims_first_ups --ignored --nocapture --test-threads=1
```

This generates exactly four synthetic complete UPSs. Bound the run explicitly:
the recorded current run used 900 seconds, 8 GiB sampled family RSS and one
execution owner. It performs no RPC, registration, deployment or broadcast.
The recipient and recovery checks are bytecode only. Do not run every legacy
market test against these two-market-only fixtures.

The application snapshot disables automatic binary targets. To rebuild the
owned compiler or saved-request verifier, add explicit `[[bin]]` entries for
`src/bin/compile_checkpoint_processor.rs` or `src/bin/verify_saved_ups.rs` in the
**new snapshot only**, then use the same frozen release build settings. The
compiler accepts `SOURCE FRESH_OUTPUT ASSET_A ASSET_B`. The existing
`batching/checkpoint-processor/build.mjs` requires the compiler, baseline fixture
directory and fresh output directory. It copies support artifacts without
modifying them. Unpacked final fixtures can supply the baseline assets/config.

`verify_saved_ups` takes `PUBLIC_REQUEST FRESH_REPORT` and verifies the preserved
complete proof and endpoint/fee binding against pinned Endcap resources without
proving or sending. Saved requests are public evidence, not broadcast permission.

Run JavaScript tests with `PROCESSOR_FIXTURES` pointing to the new fixtures:

```text
node --test batching/checkpoint-processor/policy.test.mjs
            batching/checkpoint-processor/legacy.test.mjs
            batching/mainnet-beta/native.test.mjs
```

No real wallet, production signing resource, live qualified beacon or actual
chain-finality proof is installed by these reproduction steps. Keep both native
wallet and Executor candidate authorization guards closed.
