# Matched actual fills: full prover memory and cold startup

See [team review](../../../docs/security/PROVER_MEMORY_REVIEW_20261025.md), [complete memory/timing report](MEMORY-PERFORMANCE.json) and [closed actual proof/fee ledger](ACCEPTANCE-CLOSED.json).

- Same application source closure, exact binaries, selected SDK, QA Book 2497 / vault 662720, same users and volume, two Rayon threads per native process. Only explicit memory hygiene differs. Both use resident circuits.
- Two actual fills, 34 actual measured UPSs, 34 unique actual requests independently fully verified; 2 setup UPSs separately fully verified. Ordinary wallet claims, exact fees, finite-cohort conservation and cross-round asset/nonce/state continuity pass.
- All 22 ordinary job timers, 8 cold native constructors and 76 native memory checkpoints present. First-generation missing historical outer timers remain missing in the earlier closed case.
- Independent 1-second declared native-process RSS inventory includes sealed full-market provers; Node parent endpoints reported separately. Sampled RSS sums are not true peaks or host physical footprint. All declared clients and observer closed.
- Native sampled maximum RSS 12.452 -> 12.011 GiB; ordinary post-job median RSS 1525.4 -> 1374.1 MiB. Whole observed round 2255.177 -> 2694.058 seconds; warm funding jobs also slower. No overall acceleration or production conclusion. Allocation relief remains opt-in, default retain.
- Actual fees 17.000115 / 17.000119 native test PSY; 4 extra DA leaves are explained by double-Felt claim-cursor boundary crossings. Setup 2.000004; total 36.000238. QA FTs 2483/2484 are 18 decimals; existing pUSDT unused; QA NFT2496 unchanged.
- No Node / selected SDK / contract code or layout update. SDK consumed source files 1466 unchanged and original binary preserved. Not a new four-market maximum-batch or cross-machine acceptance.

`manifest.json` contains exact original/raw/compressed hashes, machine and directories. `INTEGRITY.json` compares all 2602 archived originals; this is not proof verification. Native cryptographic proof audit outputs are included separately. `READABLE-COPIES.json` maps these convenient copies to exact archived original bytes. JSONL lifecycle data is included. Wallet files, keys and sealed binaries are excluded.

Original public evidence remains in the durable closed `prover-memory-performance-live-v1` directory. Do not rerun financial commands there. Original-parent inline setup script and one EEXIST raw console output were not archived; `SETUP-RECOVERY-NOTES.json` describes that limit without fabricating them. Actual native inputs, requests, wires, proofs and receipts are preserved.
