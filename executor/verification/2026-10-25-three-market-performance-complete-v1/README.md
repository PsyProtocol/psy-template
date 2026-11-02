# Three-market live acceptance evidence

- `ACCEPTANCE-CLOSED.json`: additive final closure; 3 economic fills / 5 members,
  ordinary claims included, 48 actual UPS receipts and 51 distinct verified UPSs.
- `AUDIT-SUMMARY.json`: final full native verification, receipts, endpoints,
  fees, asset deltas, confirmed timeout conflict, local restart and stale rejection.
- `PERFORMANCE.json`: final report v3. V2 reproduces the same numerical data;
  phase scopes, missing measurements and failures remain explicit.
- `READ-ABBA.json`: all four read-only trials, including the slow retry sample.
- `DEPENDENCY-CHECK.json`: unchanged selected SDK, Node baseline and source copies.
- `READABLE-COPIES.json` / `READABLE-INTEGRITY.json`: readable copies match the
  original digests in the compressed manifest.
- `manifest.json` / `INTEGRITY.json`: 6,596 public files, exact raw/gzip/original
  hashes. Integrity checking alone is not cryptographic UPS verification.

Original machine paths are retained as provenance. Native binaries are excluded;
source, frozen SDK/build/toolchain records and binary SHA256 values are included.
Wallet/private/recovery files are excluded. This is local isolated QA evidence,
not a production release, runtime image attestation, global inclusion/fairness,
steady-state chain TPS or cross-machine coordination claim.

The earlier audit v1 stopped in a report-only null-prototype comparison after
50 proof checks. V2 reran every cryptographic check and completed. Both remain.
Earlier failed and successful report generations are retained. Do not sum their
proof counts. The execution COMPLETE marker's old pending-accounting flag is
historical; the additive ACCEPTANCE-CLOSED index is authoritative for closure.
