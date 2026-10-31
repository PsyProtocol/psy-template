# Faucet UPS-start root investigation

Read the [review report](../../../docs/security/FAUCET_START_ROOT_CAUSE_20261031.md).
The frozen/current resource maps error wire (46,12) to the session/path
checkpoint-tree root element 0. Original assignments correlate with public
roots 1758 and 1759 within a bounded 15-root range. Complete historical witness,
running-resource provenance and original request disposition remain unavailable.

- `capture-v1/`: 16 fresh chain/Native/user/public-resource observations.
- `reconcile-v1/`: all 203 config/registration/cursor requests and responses.
- `root-views-v1/`: six root/path reads at current checkpoint 25091.
- `historical-roots-v1/`: all 15 original historical-root reads and correlation
  flags. Raw private assignment values and original faucet body are excluded.
- `public/`: budgets, public error projection, exact topology report, build and
  sealed executable digests, four inspector checks, initial/final 26-case
  regression logs, source/resource checks, manual review and zero-fee closing.
- `application-source/`: source snapshots and the frozen application manifest.
- `capture-tools/`: bounded original acquisition/build-wrapper/package scripts,
  retaining local acquisition paths; no authority to replay finance.

The manifest binds every member, size, SHA256 and archive SHA256. Wallet secrets,
recovery files, raw original private faucet diagnostics, binary executables and
signing witnesses are excluded. Public `private_note_*` verifier metadata is
byte-identical to the previously reviewed public registry, not a secret key.

`FINAL-SOURCE.json` binds the archived and committed JavaScript digests after
restoring the surrounding two-space indentation. Only leading indentation tabs
were replaced; all remaining bytes, including strings, are unchanged. Original
archived source snapshots and manifest hashes are preserved.

There were exactly 240 public reads and no new faucet request, financial proof,
deployment, registration, fill or ordinary claim. A pending Outbox is not
spendable; current known funding is zero. Application root consistency checks
remain metadata checks and cannot replace complete Merkle/UPS/session verification.
