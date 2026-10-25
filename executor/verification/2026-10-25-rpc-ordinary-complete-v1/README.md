# RPC / ordinary wallet matched live evidence

Authoritative closure: [ACCEPTANCE-CLOSED.json](ACCEPTANCE-CLOSED.json).
Measured stages and limitations: [PERFORMANCE.json](PERFORMANCE.json).
[Baseline full-proof audit](BASELINE-AUDIT.json) / [candidate full-proof audit](CANDIDATE-AUDIT.json).

Two real Book fills; 17 actual UPSs per round, 34 independently verified signed requests. Same QA market 2497/vault 662720, users, SDK and two Rayon threads. QA FT 2483/2484 (18 decimals); test PSY fees; existing pUSDT unused. All raw requests, exact receipts, staged state snapshots, failure attempts, source generations and independent verifier reports are preserved.

- Recurring funding and ordinary claims improve when using resident public circuits. First cold construction remains about 41 seconds; full commit/settlement cryptographic preparation remains about 260 seconds.
- Whole-round timing includes development/restart pauses and fixed cutoff waits. It is not an established whole-cycle improvement or chain TPS.
- First two candidate orders ACKed before a performance-serialization exception. Exact originals were reconciled; no replacement payment. Their outer durations are null, not reconstructed. Native phases remain in the archive.
- RSS captures ordinary wallet processes only, including idle resident clients. The initial observer omitted the renamed compact driver digest. No complete prover-memory comparison is available.
- Both rounds cost 17.000115 test PSY; caching is not a fee saving.

`manifest.json` records exact original and gzip hashes. `READABLE-COPIES.json` links the summaries above to those records. Wallet/private-key files and native executables are excluded. The frozen SDK manifest, compiler/lock identities and native application source are included or linked by the repository review document.

Integrity only (does not verify proofs):

```sh
python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-25-rpc-ordinary-complete-v1
```

With original durable files on this machine, add `--original-base /Users/geir/Downloads/QED资料/litepaper/psy-market-recovery-20261023` (quote the path in a shell).

Complete proof verification was performed for every actual request using the frozen `verify_saved_ups` binary, fixed Node verifier key and common data, plus metadata/endpoints/fees. Reproduce from the selected SDK with the source `amm/u124/vm-tests/src/bin/verify_saved_ups.rs`; its CLI is `PUBLIC_REQUEST FRESH_REPORT`. It never broadcasts. Re-running financial acceptance on either closed case is forbidden; use new isolated fixtures for new tests.

The review document is [RPC_ORDINARY_PERFORMANCE_REVIEW_20261025.md](../../../docs/security/RPC_ORDINARY_PERFORMANCE_REVIEW_20261025.md). Runtime image identity, upstream SDK release provenance, global fairness and cross-machine coordination remain outside this acceptance.
