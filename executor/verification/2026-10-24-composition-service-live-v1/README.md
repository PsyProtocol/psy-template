# Actual local composition service acceptance

New controller 2494 / vault 117952; ordinary owner 406720. QA-A 2483 and QA-B
2484 (18 decimals), test PSY 0 (9 decimals); no pUSDT. Formal service performs
owner-funded cancellation recovery with explicit QA proof-read failure injection,
two actual controller UPSs and ordinary final claim. This is a zero-market-fill
case. Four UPSs burn 4.000038 PSY; controller phase 99 and all balances zero.

837 public files; 24,932,866 gzip bytes. `INTEGRITY.json` compares every original
and compressed byte digest. It is separate from the cryptographic UPS results.
No wallet/recovery files or executable binaries are included.

## Start here

The manifest maps original runtime paths to exact gzip files. Important sources:

- `composition-live-v2/public/SERVICE-LOCAL-ACCEPTANCE-COMPLETE-v1.json`: joined
  closed-case evidence hashes; scope and external limitations explicit.
- `composition-service-receipt-verification-v1/SUMMARY.json`: all 102 actual
  cohort UPSs independently verified; actual-fee mutation rejected. The new
  four requests live under the selected `service-recovery` home. The original
  98 requests remain in `2026-10-24-composition-final-live-v1`; they are not
  duplicated here. This invocation did independently reverify all 102.
- `composition-live-v2/public/COMPOSITION-SERVICE-AUDIT-v1.json`: ten-account
  spendable/Outbox inventory, both 1,000-token QA supplies and exact 102.000815
  cumulative PSY burn.
- `composition-live-v2/public/COMPOSITION-SERVICE-OWNER-CLAIM-AUDIT-v1.json`:
  historical ordinary-claim start/end leaves, exact amount/cursor/fee deltas.
- `composition-live-v2/public/COMPOSITION-SERVICE-PERFORMANCE-v1.json`: bound
  real timing/fee/resource observations and unmeasured fields.
- `.../service-recovery/public/LOCAL-CONTENDER-COMPLETE-v2.json`: independent
  local process loses the actual journal lock before quote/prove/submit.
- `composition-service-terminal-cli-v1.json`: actual formal CLI terminal
  re-entry leaves financial history byte-identical and broadcasts nothing.
- `composition-service-sdk-integrity-v2.json`: frozen 1,466-file dependency and
  live financial core recheck; user's pre-existing Node diff unchanged.
- `composition-service-final-regression-v1.log`: 118 passed, no failed/skipped
  tests. Test counts do not establish production safety.

Matched source-build benchmarks are in the separate
`2026-10-24-composition-build-reuse-v1` archive. Full interpretation and local
timing table: `docs/security/COMPOSITION_SERVICE_REVIEW_20261024.md`.

## Preserved failures and exact identity

The initial publisher's historical deployment receipt is rejected before
registration/funding. The independent selected publisher's actual request and
fresh receipt/registration are retained. Possibly allocated 2493 is unselected
and unfunded; older unknown deployment outcomes are not declared dropped.

Original frozen-array harness failure, read-only/no-funding continuation check,
new `v3` source snapshot and fresh invocation logs are retained. The first
contender timed out before financial service entry; v2 uses a fresh label.
Finalization v1 rejected fractional observations with the protocol integer
parser; its source/log remain. V2 reads the performance report as observations,
retains exact integer parsing for all financial artifacts, and writes only the
previously absent completion marker. No request or receipt is rewritten.

Actual recovery is explicitly injected before proof-session start. It is not
evidence of a naturally occurring new outage. Safe failure classification,
persisted restart reservation and fresh guarded session rebuild are exercised.
Known ordinary funding, controller fund/return and owner claim each send once;
unknown observations reconcile the original identity without substitute payment.

## Limits and reproduction

    python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-24-composition-service-live-v1

Use the manifest to restore public artifacts to a fresh analysis directory. Full
proof reproduction/verification uses the reviewed frozen dependency/toolchain
and verifier release, not unreviewed current SDK HEAD. Private absolute runtime
paths are provenance, not replay instructions. Do not run financial acceptance
helpers against an original completed case as if it were fresh.

Physical two-host and coordinator-mode financial takeover, runtime/upgrade
authentication attestation, upstream SDK release, certified randomness, global
fairness, A-only onboarding and arbitrary routes remain outside this acceptance.
The explicitly declared refundable one-atom QA-B initializer and fee budget are
required. No cross-vault atomicity, matched financial speedup, chain TPS or
production certification is inferred.
