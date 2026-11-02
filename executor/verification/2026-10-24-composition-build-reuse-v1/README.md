# Verified source resource reuse — immutable observations

82 files; 112,389,051 original bytes; 12,432,687 gzip bytes. Every archived
original and compressed SHA256 was checked against the retained runtime bytes.
`INTEGRITY.json` establishes byte integrity, not UPS validity or production safety.
No wallets, recovery files or executable binaries are included.

Read the report at `docs/security/COMPOSITION_SERVICE_REVIEW_20261024.md`.
Matched ABBA adapter reconstruction medians: 213.267 seconds with source
verification rebuilt; 12.232 seconds with the same verified immutable closures
reused. Cold priming: 212.494 seconds. Two repetitions per variant; actual
transactions, proof-generation acceleration and chain TPS were not measured by
this experiment. Source/ABI/IR/tool hashes and live identities remain checked.

The archive includes the original summary-serialization failure and reconstructed
original benchmark source, all five unmodified rows, finalization metadata,
runtime verification artifacts and the missing observational summary. Trial
timings were not repeated to repair the summary.

The frozen SDK's 1,466 source files and lock/config hashes were rechecked.
The complete local regression invocation passed 116 tests. Later targeted
invocations cover the same-payer scope exclusion and frozen funding/cancel
builder; these overlapping counts must not be added as distinct tests.

Loopback coordinator tests use simulated financial/proof IO and independent
local processes. They do not establish two-host or chain financial coordination.
Real service recovery/ordinary claim validation is a separate evidence bundle.

To check compressed evidence integrity from this repository:

    python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-24-composition-build-reuse-v1

The manifest maps each gzip file to its exact original path and SHA256. Source
and explicit private runtime paths in JSON are provenance, not portable CLI
configuration or authorization to replay a financial operation.
