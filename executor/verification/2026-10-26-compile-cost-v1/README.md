# Frozen client build cost, 2026-10-26

This measures source compilation, not first-use circuit construction, proof
generation, network confirmation, wallet receipt or chain throughput. No financial
operations occurred; these new outputs are **not selected** as financial drivers.

| Attempt | Wall time | Result | Owned process-tree sampled RSS |
| --- | ---: | --- | --- |
| v1 clean target | 237.182 s | failed: SDK build script default config path missing | raw samples retained; not a successful comparison |
| v2 clean target | 661.127 s | success, 775 non-fresh artifacts | 2,512,453,632 bytes; 660 samples, maximum observed gap 1,170 ms |
| v2 unchanged warm target | 0.943 s | success, all 775 artifacts fresh | null: one in-phase sample cannot establish a phase peak |

Same machine, toolchain `nightly-2025-09-20`, two Cargo jobs, two Rayon threads,
release/locked/offline build, same frozen 72 application files, 1,466 SDK files
and configuration. Cold target starts empty; downloaded registry and OS file
caches remain. Targets: `isolated_wallet` and `compact_market_wallet`, including
their client-consumed SDK subset. No Node server build or Node edit occurred.

v1 failure is retained. v2 explicitly supplies the **existing** frozen
`PSY_CONFIG_PATH` and `PSY_NETWORK=localhost` from the manifest, not another SDK
or substitute network. Configuration SHA256:
`6c054465b28329820100e0e1958f86f6eb55a37f3ea4a734269340286930017b`.
SDK manifest:
`0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`.
Inputs were checked before and after both successful builds.

Cargo unit elapsed sums: SDK 273.633 s (32 units), application 197.048 s
(3 units), other dependencies 818.313 s (817 units). These **overlap**; do not
add them or call them separate sequential wall times. Build wall: 661.127 s.
Cold and warm outputs match each other but differ from the selected release.
No byte-reproducible release or new binary acceptance is claimed; financial
drivers retain their validated hashes.

One-second process-tree RSS sums can double-count shared pages and miss short
peaks. They are not true physical-memory peaks. Warm build memory remains
undersampled, so a complete warm compilation memory comparison is unavailable.
This gap is separate from the prior complete transaction-lifecycle RSS evidence.

v2 helper was captured **after** its process started, then remained unchanged.
Its provenance record states this; no pre-execution pin is invented. Failed v1
helper was not captured at execution time; its original Cargo logs and timing
records remain. No successful build was substituted for the failed sample.

[manifest.json](manifest.json) indexes 28 exact originals: both attempts, raw
Cargo JSONL/stderr, process-tree logs, plans, timing, binary hashes and helper
provenance. No target directory, executable or wallet is archived. All 28 records
were compared against originals.

```sh
python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-26-compile-cost-v1
```

[Runner](../../acceptance/measureCompileCost.mjs),
[report parser](../../acceptance/compileCostReport.mjs). Use a new directory;
never select experimental outputs without separate full release acceptance.
