# Repository-wide English language review — 2026-10-26

The project is international. Maintained code comments, runtime/UI text, tests,
READMEs, designs, team reviews, reports and new commit/PR prose use English.
See [contribution rules](../../CONTRIBUTING.md). This revision corrects published
maintenance material while retaining historical financial evidence exactly.

## Audit scope and result

Baseline `4f15da5e5a33a37f26052690e0e8aa58f9db9e76` contained 68,663 tracked files.
The complete plaintext inventory found **132 files / 101,620 Han characters**.
All tracked gzip containers were also decoded/inspected: **66,254 containers,
823,588,885 compressed bytes / 10,317,937,878 expanded bytes**, 37,398 unique payloads,
no decode failures. **1,554 containers** contain Han text or historical path names.
This is a language scan, not proof verification or financial acceptance.

- **33 existing text files** were revised to English: six-contract/module guides,
  shared market design, deployment/upgrade/security/performance reviews, current
  Executor/composition plan, root handoff/funding and dApp documentation. English
  editorial revisions retain reported outcomes, limits and source/evidence links;
  historical wording remains in Git at the baseline, not rewritten history.
- The exact JSON wire test retains the same runtime UTF-8 bytes through ASCII
  source escapes; non-ASCII protocol coverage is not removed.
- **99 existing plaintext originals remain byte-identical**: historical deployments,
  verification reports/logs/snapshots, rejected design artifacts and literal local
  filesystem provenance. These are explicitly listed with hashes, not hidden by a
  broad directory ignore. They are not claimed to be translated.
- The root README now links English contribution/review guidance. The
  [historical evidence guide](HISTORICAL_EVIDENCE_GUIDE.md) maps every preserved
  plaintext original to relevant English reviewer context.
- `npm run check:language` covers tracked and nonignored new UTF-8 text; any new
  Han prose or changed/missing frozen exception fails. CI has a dedicated job.
  Intentional Unicode samples use escapes. This checks script consistency, not
  grammar or all possible non-English languages.

[Baseline inventory](BASELINE_20261026.json),
[initial compressed scan](ARCHIVE_SCAN_20261026.json),
[full Unicode archive recheck](ARCHIVE_SCAN_FULL_UNICODE_20261026.json),
[exact historical exceptions](FROZEN_EXCEPTIONS_20261026.json),
[validation](VALIDATION_20261026.json).

## Validation and preserved boundaries

Reproduce the readonly compressed inventory into a fresh path with
`python3 scripts/audit_language_archives.py --out /absolute/fresh-report.json`.
It never changes evidence and refuses an existing output.

Three checker regressions reject new non-English text, changed/missing originals
and retain escaped Unicode fixtures. The two exact-wire/invalid-UTF-8 tests pass.
The full language check reports no unclassified Han text and all 99 exact hashes
match. Changed Markdown retains every original linked target and full hexadecimal
release identifier; editor-only changes do not rerun financial tasks.

No chain Node code, selected SDK, market contracts, registered keys, frontend
behavior, wallet policy or raw proof/request/receipt/archive bytes changed.
The only executable-source edit outside the new checker is an equivalent test
literal representation. Package scripts and CI add the language gate; dependency
versions and lockfiles remain unchanged. Existing performance numbers remain
historical observations with their failures, cold/warm scope and unresolved safety
boundaries. This work produces no new UPS, fill, claim or production certification.

Current service monitoring and the original isolated financial plan remain
separate; document translation cannot enable financial submission.

The final link audit reports zero newly broken local links. Two historical MCP
follow-up evidence directories referenced by the original 2026-10-09 note are
absent from this checkout; their links are retained and explicitly listed in
validation, without inventing replacement evidence. Two accidental editorial
PSY20-path spaces were caught and corrected before commit. Historical commit
subjects/bodies were also scanned: zero Han-bearing commits, no history rewrite.
