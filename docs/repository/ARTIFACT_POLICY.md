# Source repository and acceptance artifacts

The source repository contains maintained code, dependency locks, small test
fixtures, review reports and bounded checksum indexes. Full UPS requests, proof
payloads, verifier binaries, build trees, repeated source snapshots and complete
acceptance runs belong in a separate artifact store. Compressing them does not
make source Git an appropriate archive.

## Historical archive preservation

On 2026-11-02, the `markets-batch-capacity-recovery-20261020` branch was cleaned
with an explicitly authorized, lease-protected history rewrite. Its original tip
was `6e3648b406afd1da590e0a837797481fbbfe9434`.

The complete original branch was saved and `git bundle verify` succeeded before
filtering. The bundle remains outside this repository in the local recovery case
`repository-hygiene-20261102-v1/original-branch.bundle`. Its size and SHA-256,
original per-case sizes and retention counts are in
[the archive catalog](ARCHIVE_CATALOG_20261102.json). This is a local preservation
record, **not a claim that a public artifact download service exists**. Contact
the repository maintainer for an archive copy when a historical full-proof
replay is needed. Do not add the bundle or an old-history tag back to this repo.

`executor/verification/` and `batching/evidence/` were removed from rewritten
history. At the cleaned tip, original Markdown and direct JSON review/checksum
indexes no larger than 64 KiB were restored byte-for-byte. A retained index can
refer to a raw artifact which is now external. A report or hash alone does not
reproduce or validate a full proof. Original failures and chain identities in
these reports remain historical; they must never be replayed as new-chain
financial recovery.

The [commit map](COMMIT_MAP_20261102.tsv) maps pre-cleanup source history to the
filtered history. A zero new commit means that the original commit became empty.
The cleanup commit itself is newer than the map. Other remote branches were not
rewritten or deleted. GitHub may retain unreachable objects until its own garbage
collection; changing reachable branch history does not promise immediate server
disk reclamation.

## Unit tests and historical replay

`tests/fixtures/reviewed-abis.json` contains only the ABI/config projections used
by existing admission and composition unit tests, with original archive digests.
`reviewedAbis.mjs` checks the exact fixture SHA-256. These tests still use RPC and
driver doubles: this fixture is not compiled bytecode, authenticated state, a
reviewed runtime identity or UPS/network acceptance.

Historical replay uses external originals and keeps existing hash checks:

- `executor/acceptance/ordinaryWalletOffline.py --archive <original-bulk-four-full-ups-v1>`
  requires the original manifest and gzip members, in addition to its frozen SDK
  and compiler inputs. Missing data fails before creating an output run.
- `executor/acceptance/verify.mjs` accepts `PSY_HISTORICAL_EVIDENCE_ROOT` as the
  root of an original evidence checkout for the fixed sealed-history paths.
- `composition/acceptance/verifyPreparationRun.mjs` accepts
  `PSY_REJECTED_CALIBRATION_MANIFEST` for the original rejected-calibration index.

To inspect the full original history, clone the verified bundle into a separate
directory. Do not merge its old commits into the cleaned branch. Keep old raw
requests and signer identities separate from all new-chain execution.

## New evidence and repository budgets

Write raw output outside the source checkout. Publish only a concise English
review with the exact source/dependency identity, command/configuration,
measurement scope, failures, outcomes, artifact digest and actual storage
location. Do not publish keys, recovery files or secret signing witnesses.
External artifact publication, retention and access policy remain separate work;
this cleanup did not create a public raw-artifact service.

The two historical archive roots are ignored for new untracked files. Small
tracked reports can still be edited normally. Prefer `docs/security/` for new
maintained reports. An intentional forced addition is checked in the index by
`npm run check:repository` and the PR CI gate:

- maximum tracked file: 5 MiB;
- maximum tracked tree: 80 MiB and 10,000 files;
- historical review roots: at most 8 MiB total, only Markdown or direct JSON
  summaries/checksum indexes, each at most 64 KiB;
- nested raw JSON, gzip proofs, binaries and snapshot trees in those roots fail.

These are review budgets, not permission to commit financial secrets. A justified
budget change requires reviewing the artifact strategy rather than silently
raising a number. Ignore rules do not replace history cleanup for files already
committed.

## Collaborator synchronization

Commit hashes changed. Save uncommitted work before updating. The safest option
is a fresh clone of the cleaned branch, followed by deliberate application of
only maintained source changes. Do not merge/re-push the old branch or restore
its backup refs on the remote: that would make the removed history reachable
again. Existing local clones and their reflogs retain their own old objects until
their owners explicitly clean them; this operation does not delete those backups.
