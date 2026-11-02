# Diagram producer-mode recovery and proposal evidence

Read [SUMMARY.json](SUMMARY.json), [index.json](index.json),
[PUBLISHED-AUDIT.json](PUBLISHED-AUDIT.json) and the
[team report](../../../docs/security/DIAGRAM_PRODUCER_RECOVERY_20261029.md).

This milestone hardens the existing v4 AMM/Curve diagram flow. It does not
introduce qualified unbiased randomness, randomized whole-source continuous
spending, new contracts/keys, current-chain settlement or ordinary-wallet claims.
No RPC or financial operation occurred. Four preserved synthetic Endcaps were
reverified; no proof was regenerated.

## Evidence levels

- 62 JavaScript checks: public reader/config/request gates, immutable local
  source pin, racing writers, original deadline/set/seed/rank recovery and formal
  Executor route. The formal route uses driver/receipt coordination doubles.
- One Rust test: both markets at 2/3/4 members, unchanged rank and malformed
  policy/input rejection. It creates no proof or session.
- Native CLI: eight fresh-process rank samples, two unchanged key identities,
  and four independent preserved-request Endcap/public-endpoint verifications.
  Their original complete stack/session acceptance remains in the
  [prior four-UPS evidence](../2026-10-28-previous-checkpoint-v1/README.md).
- Current network, recipient claim, recovery UPS and whole-source random-stream
  acceptance: **not established**.

Two failed JavaScript runs remain in the bundle. The first exposed a prototype
fee-placeholder mismatch plus an overbroad new metadata guard; the second still
exposed that guard on unrelated admission maintenance. The corrected v4-only
guard and existing canonical non-settlement fee conversion pass the final run.
No native fee, exact-call or admission authorization check was removed.

## Contents and reproduction

`files/...gz` contains public plans, every run's logs/RSS results, native proposal
inputs/results, all eight timings including the slow first candidate, identity
and preserved-Endcap reports, dependency freeze checks, snapshot manifests and
reproduction scripts. Each index entry records original/public/compressed
digests; machine-local paths are explicitly redacted. Unpack into fresh paths.
No binary, wallet, private key, mnemonic or secret signing/state witness is
uploaded. The structural public-field scan supplements the explicit file list;
it is not a generic secret-detection guarantee.

Use frozen SDK mainnet-beta `c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`, nightly-2025-09-20,
release/offline/locked, two Cargo jobs and two Rayon threads.

Create a fresh application with
`batching/dependencies/prepare_mainnet_beta_application.py --test-only`.
For the baseline, restore only `src/checkpoint_processor.rs` and
`src/bin/compact_market_wallet.rs` from application commit
`6b469ab9621e32be80a5d330c7b3c88d43dd3f9e` **inside that new snapshot**;
`BASELINE-SNAPSHOT.json` records their digests. Do not edit the original frozen
SDK, historical artifacts or deployed contracts. Candidate snapshot source pins
and binary hashes are separately recorded. Add explicit compact-wallet and
saved-UPS-verifier targets in the snapshot manifest, as archived.

Set `PREVIOUS_FIXTURES` to the preserved v4 fixture root and
`PROCESSOR_FIXTURES` to its unchanged v3 default fixture root. The fixtures and
four requests can be reconstructed from the prior evidence index. Then run:

```text
node --test executor/producerBatchBinding.test.mjs
            executor/previousCheckpoint.test.mjs
            executor/previousCheckpointRoute.test.mjs
            executor/config.test.mjs executor/compactAdmission.test.mjs
            batching/checkpoint-processor/policy.test.mjs
            batching/checkpoint-processor/legacy.test.mjs
            batching/mainnet-beta/native.test.mjs

cargo +nightly-2025-09-20 test --release --offline --locked
      --manifest-path FRESH_CANDIDATE/Cargo.toml
      --test producer_order_proposal -- --nocapture --test-threads=1
```

The archived `native_cases.py` compares separately preserved baseline/candidate
binaries with identical policy/input and AB/BA scheduling, checks candidate key
identities against prior UPS identities and verifies the original public
requests with fixed Endcap/common resources. Give it a fresh case directory and
outputs; its path layout is recorded in the script. It never invokes a finance
or broadcast command. Bounds and stop conditions are in the public plans.

## Measurement limits

These are fresh-process **public rank proposal** timings, not complete proof,
settlement, ordinary-wallet arrival, resident warmth or RPC confirmation times.
Baseline calls constructed an unused SD-key; candidate proposals fully validate
the policy and calculate rank before that construction. All actual identity,
signing, proof and broadcast paths retain their constrained resources.

Keep the first slow candidate sample. AB/BA reduces order effects but does not
eliminate OS/file-cache variation or make two samples a p95/steady-state study.
macOS child rusage maximum RSS is recorded in bytes; the observer separately
samples process-family RSS in KiB and may include shared pages. Neither is a
physical-footprint peak. Baseline/candidate release builds differ in selected
binary targets and do not support a compilation-speed claim. No chain TPS,
end-to-end speedup, fee reduction or production-readiness conclusion follows.
