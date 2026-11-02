# Dependency and source readiness evidence — 29 October 2026

This bundle contains public observations, exact proof requests, verification
records, source snapshots, failures and measurements. It does **not** certify a
production release, real trading or ordinary signed wallet claims. See
[the full review](../../../docs/security/PAIR_LIVE_READINESS_20261029.md) and
[the result summary](REVIEW.json).

- Frozen SDK: `c92880c8b6e2c8d392f19368bc8801a2584fd427`; no Node/dependency change.
- Native: all ten methods and full code/layout/function membership checked.
- Checkpoint 12428: all 312 nonzero account leaves, 575 verified paths; independent
  SDK reconstruction matches. Legacy traversal has 4103 logical discovery reads
  on the same reconstructed tree. This is not a matched RPC/throughput benchmark.
- Two Book full UPSs pass with the complete captured native identity, synthetic
  history and fixed Endcap/common verification. Open: 39.175 s; first source page:
  48.261 s; process: 194.373 s, sampled family RSS peak 2632128 KiB. No real fees.
- The actual sealed-native Executor budget route rejects caller-selected counts,
  preserves canonical plan identity on restart and rejects artifact tampering.
- All 78 coverage UPSs would still be required for that source size. The old
  C+32 deadline/funding plan does not fit. New-instance eligibility and protocol
  inclusion/cancellation/upgrade enforcement remain unverified. Financial gates
  stay closed; no real deployment, fill, claim or recovery is claimed.

## Verify and unpack

`index.json` maps every artifact to content-addressed gzip data with compressed,
public and original SHA256. Local machine paths are redacted in selected text;
cryptographic requests, state/proof artifacts and the final inventory transcript
remain byte-exact. Signing secrets, mnemonics, wallet recovery files and raw
signature witnesses are not packaged. The helper binaries are identified by
hash; build them from the frozen sources rather than downloading executables.

    python3 unpack.py /absolute/fresh-output
    python3 restore_inventory_prefixes.py /absolute/fresh-output --check-only

The final 575-proof transcript encodes every original prefix. The prefix index
verifies exact reconstruction of all 579 original inputs. Omit `--check-only` to
materialize them with their exact original bytes and hashes; existing files are
verified and never overwritten. Original local captures have not been removed.
This avoids publishing hundreds of redundant copies of the same proof prefixes.

## Important artifacts after unpacking

- `run/native-bound-v3/BINDING.json`: full native identity and membership.
- `run/inventory-v5/transcript-00575.json` and `verified-00575.json`: complete paths
  and leaf set, relative to the pinned observed root.
- `run/public/INDEPENDENT-INVENTORY-v8.json`: independent SDK root and legacy scope.
- `run/public/NATIVE-REJECTIONS-v1.json` and independent inventory rejection report.
- `run/actual-native-full-ups-v7/orderbook-captured-native-{open,cover}/`: exact
  requests, plans, public sessions, key proofs and complete verification records.
- `run/public/BUDGET-COMPLETE-INVENTORY-v2.json`: non-authorizing planning scenario.
- `run/public/FROZEN-ADMISSION-SOURCE-v1.json`: inspected source and complete-file
  hashes, with runtime attestation explicitly false.
- `run/public/PRIOR-EVIDENCE-PRESERVATION-v1.json`: all 434 prior original hashes
  remain unchanged. Earlier failures/stop conditions are retained in this bundle.

Reproduction uses testnet magic `1384803358401154921`,
`cargo +nightly-2025-09-20 --release --offline --locked`, two Cargo/Rayon threads,
the recorded application snapshots and frozen materializer. The source capture
is read-only; signing, deployment and broadcast interfaces are absent. Root
membership is not finality, an admission-age rule or a random-source guarantee.
