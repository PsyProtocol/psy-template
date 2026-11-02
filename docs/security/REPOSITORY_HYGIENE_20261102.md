# Repository payload cleanup — 2026-11-02

## Outcome and scope

The user authorized removing large non-source records from the remote branch so
new clones no longer download the accumulated proof archives. A normal deletion
commit would leave those objects in reachable history, so this change rewrites
only `markets-batch-capacity-recovery-20261020`, with an exact old-tip push lease.
Other remote branches and tags are not changed.

Before cleanup, the branch tip
`6e3648b406afd1da590e0a837797481fbbfe9434` contained 86,673 tracked blobs totaling
1,501,805,808 bytes. The two archive roots accounted for 84,448 files and
1,452,182,408 bytes:

| Root | Files | Checkout bytes |
| --- | ---: | ---: |
| `executor/verification/` | 82,027 | 1,364,738,299 |
| `batching/evidence/` | 2,421 | 87,444,109 |

Checkout bytes count every path, including duplicate blobs. They are not Git
pack size or network transfer bytes. The isolated filtered history was about
10.1 MiB packed before adding the bounded review summaries and fixtures; actual
post-push clone sizes are recorded separately in the delivery evidence.

## Preservation and code boundaries

- A complete 735,038,664-byte original branch bundle was created and verified
  locally before filtering. Its SHA-256 is
  `6127ada56717210f6b8168a27bb1e001c31bf9ca094d42ac3c37bd2b77758359`.
  The catalog records the authoritative measured size; no backup ref or bundle
  is uploaded to this source repository.
- All 488 retained Markdown/direct small JSON reports and indexes are restored
  from original Git blobs, byte-for-byte (4,387,034 bytes total).
- Admission/composition unit tests now load digest-pinned ABI/config projections
  instead of whole proof archives. The HTTP 413 regression retains the exact
  original 66-byte metadata and 26-byte response body in tiny fixtures, with
  provenance and hashes. No executable financial request is in those fixtures.
- Manual historical replay accepts explicit external archive locations without
  removing the original content-hash, SDK or verification checks.
- Market contracts, SD-key code, SDK manifests/locks, Node and wallet code are
  unchanged. Two pre-existing uncommitted wallet-acceptance source edits remain
  outside this cleanup commit, separately backed up and preserved.
- Historical language exceptions for removed payloads were retired. Two existing
  browser QA Unicode-input fixtures receive exact-byte historical exceptions;
  their contents are unchanged.

See the [artifact policy](../repository/ARTIFACT_POLICY.md),
[archive catalog](../repository/ARCHIVE_CATALOG_20261102.json), and
[commit map](../repository/COMMIT_MAP_20261102.tsv). Raw archives are preserved
locally, not represented as publicly downloadable or as new-chain acceptance.

## Validation and limits

The same Node v24.22.1 runtime was used for original and candidate host tests.
No deployment, proof generation, faucet request, wallet interaction or financial
transaction was initiated by this cleanup.

| Check | Original | Cleaned candidate |
| --- | --- | --- |
| Composition + compact admission unit tests | 126 passed | 126 passed |
| Broader exchange/token/NFT/Executor command | 443 passed, 6 failed, 2 skipped | 443 passed, same 6 failed, 2 skipped |
| Language gate | Archived failures predated cleanup | No violations; 82 exact frozen matches |
| Repository budget gate | Original archives exceed new budgets | Passed |
| Repository gate negative cases | Not present | 4 passed |
| Language gate negative cases | Existing suite | 3 passed |

The six unchanged broad-suite failures require explicitly supplied complete
external/native fixtures: `checkpointStream`, `finalStatePairReadiness`,
`finalStateStream`, `previousCheckpoint`, `previousCheckpointRoute` and
`producerBatchBinding`. They fail at their input preconditions in both trees.
They were not skipped, mocked into cryptographic success, or weakened. The first
candidate broad run also exposed the missing historical HTTP 413 fixture; the
tiny exact-byte extraction fixed it. That failed run remains in the local case.
These results are repository/host regressions, not a fresh UPS or live network
acceptance claim.

Full test logs, original/source-tree inventories, preservation checks and push/
clone observations remain under the external local recovery case
`repository-hygiene-20261102-v1`. The compact validation summary contains their
digests without committing the logs themselves.

## Prevention and delivery

The two raw archive roots are ignored for new files. An index-based CI gate
rejects forced raw archive additions and enforces per-file, total-byte and
file-count budgets. Production source and small fixtures stay in Git; large
binary/proof/source-snapshot publication needs a separate artifact store.

The remote update uses `--force-with-lease` pinned to the original tip, preventing
overwrite of a concurrent push. After rewriting, collaborators must preserve
their local work and synchronize deliberately, preferably by making a fresh
clone. Merging or republishing old-history refs would reintroduce the payloads.
GitHub's eventual storage reclamation is independent of new clone reachability.
No claim is made that existing local clones instantly shrink or that raw
historical replay works without obtaining the external archive.

## Remote clone verification

The lease-protected push completed at `0435b0ae3bb69ebc528c57de02a1827c605ddeea`.
A fresh ordinary GitHub clone fetching all advertised branches and full reachable
history produced one **11.86 MiB** Git object pack (including its index). At that
commit the cleaned tree contains **2,725 files / 54,816,281 bytes (52.28 MiB)**.
All seven other branch heads match the pre-cleanup inventory. See the
[delivery manifest](../repository/REMOTE_CLEANUP_20261102.json) for exact pack
bytes, hashes, measurement scope and limitations. This report update and its
small delivery manifest are newer than the measured cleanup commit.
