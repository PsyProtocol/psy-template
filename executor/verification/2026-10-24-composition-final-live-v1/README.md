# Three terminal live composition outcomes

See [the acceptance report](../../../docs/security/COMPOSITION_LIVE_ACCEPTANCE_20261024.md).
This is a closed public snapshot of the same isolated QA run, including failures;
previous evidence directories and original run files are retained unchanged.
No private wallets, recovery files, drivers or sealed executables are included.

`manifest.json` maps every original relative path to its gzip file and exact raw /
compressed SHA256. `INTEGRITY.json` records comparison with the local originals.
To check archive integrity in a fresh checkout:

```sh
python3 executor/acceptance/verifyCompactArchive.py \
  executor/verification/2026-10-24-composition-final-live-v1
```

This command checks bytes, not cryptographic validity. The independent full UPS
verification is in `files/composition-final-receipt-verification-v2/`: 98 exact
requests verify against the pinned SDK end-cap key/common data; an actual-fee
mutation is rejected. The partial v1 verifier output and failure are retained.

Important original-relative paths (append `.gz` below `files/`):

- `composition-final-receipt-verification-v2/SUMMARY.json`
- `composition-live-v2/public/INITIALIZED-LIVE-ACCEPTANCE-COMPLETE-v1.json`
- `composition-live-v2/public/COMPOSITION-RECOVERY-AUDIT-v1.json`
- `composition-live-v2/public/COMPOSITION-OWNER-CLAIMS-AUDIT-v1.json`
- `composition-live-v2/public/COMPOSITION-TERMINAL-STATE-AUDIT-v1.json`
- `composition-live-v2/public/COMPOSITION-LIVE-PERFORMANCE-v1.json`
- `composition-live-v2/public/SDK-SOURCE-CHECK-v5.json`
- `composition-live-v2/public/TIMEOUT-TERMINAL-REENTRY-v1.json`
- `composition-live-v2/controllers-initialized-v1/partial-recovery/public/EXPLICIT-READ-RECOVERY-v1.json`
- `composition-route-resources-v2.log` and its `-SUMMARY.json`
- `composition-final-evidence-tools-v2/MANIFEST.json`
- `composition-final-regression-v6.log`

Preserved JSON contains original absolute machine paths for traceability. Do not
rewrite originals to relocate them. Decompress the requested file to a **new**
review directory, check its raw SHA against the manifest, then use a verifier
built from the frozen SDK/application lock and
`amm/u124/vm-tests/src/bin/verify_saved_ups.rs` on that exact request with a fresh
output report. The recorded verifier binary SHA is
`95344886059c5fe78617a6e1f7b9988cfd4ce8e9805da05086a79f7f5a6599cf`.
An independent rebuild must itself have reviewed provenance; the archive does
not supply binaries or certify an upstream SDK release or running service image.

The original two unknown deployments stay quarantined and were never resent.
The selected QA-B instance has its own exact included identity. Two-AMM success,
zero-fill timeout refund and one-fill intermediate-asset compensation are separate
outcomes, each ending with an actual ordinary owner claim. This is a multi-UPS
workflow, not cross-vault atomic settlement, global fairness or a production claim.
