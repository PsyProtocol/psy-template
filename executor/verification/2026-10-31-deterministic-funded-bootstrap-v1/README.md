# Deterministic funded bootstrap — public review cohort

Read the [scope, failure analysis, measurements and remaining gates](../../../docs/security/DETERMINISTIC_FUNDED_BOOTSTRAP_20261031.md)
before interpreting these files. Four **synthetic** complete UPSs pass for new
AMM/Curve v14 keys. No network request, deployment, actual fill, ordinary-wallet
approval or recipient claim is included. Original v5/v9 profiles are unchanged.

`index.json` records original, public and gzip SHA256 values for 142 explicit
members. Paths are projected to placeholders; original machine artifacts remain
unchanged. `PUBLISHED-AUDIT.json` reports byte/field checks, not cryptographic
acceptance. Raw signing/CFC witnesses, private keys, wallets, binaries and SDK
source trees are excluded. Synthetic constant test-key code is not a live wallet.

The archived `request.json` and `key-proof.bin` files are public proof bytes.
`public-session.json` is an explicit public projection of the actual session and
ordered stack. It is not a hydrated signing witness. Changed-fee requests in the
independent-verification directory are intentionally invalid offline fixtures;
none may be sent to a network.

## Evidence layers

- `public/PLAN.json`: finite ownership, computation and zero-finance bounds.
- `full-ups-v1/*`: original failed AMM public session; no accepted UPS is claimed.
- `public/key-audit-v1.raw.log` and `ROOT-CAUSE-v1.json`: same-session diagnostic,
  only failing gate/row/constraint metadata; inactive 24-bit comparison cause.
- `application-v1/v2/*`: original and diagnostic source snapshots.
- `application-v3/*`: accepted circuit/helper snapshot. `FINAL-REVIEW-v1.json`
  matches all 110 production Rust source files to the final application source.
- `full-ups-v2/*`: four native-verified complete UPSs, public requests, key proofs,
  exact session, start/end roots and fees. First-use **stored** start leaf is zero;
  the registered initial **signed** leaf is distinct and must not be conflated.
- `public/CLOSED-v1.json` / `CLOSED-v2.json`: failed and successful process times;
  final sealed binary digest and sampled child RSS, not physical memory.
- `application-v4/*`, `public/build-vm-v4.log`: extra bytecode-only grant/low-cap
  rollback tests. Two complete-UPS/replay tests are intentionally ignored by this
  VM invocation; the successful full proof run is separately recorded above.
- `public/javascript-v2.log`: eight final generator/policy regression tests.
- `public/audit-test-v1.log` retains the first public-audit prototype failure;
  `audit-test-v2.log` passes after exact-field projection normalizes JSON object
  prototypes. `CONSISTENCY-v1.json` is explicitly not an independent verifier.
- `application-v5/*`, `public/INDEPENDENT-VERIFICATION-v1.json` and
  `independent-verification-v1/*`: separate fixed-key/common-data Endcap and
  endpoint/fee verification; four valid requests pass and four changed fees fail.
  These checks do not independently reconstruct the approved calls.

## Reproduction

Use the exact frozen cohort and materialization instructions in
[the dependency guide](../../../batching/dependencies/README.md). SDK is
`c92880c8b6e2c8d392f19368bc8801a2584fd427`; toolchain is
`nightly-2025-09-20`, testnet magic `1384803358401154921`, Rayon threads `2`.
No Node source edit or dependency upgrade is needed.

Decompress the explicit fixture members, preserving their paths, into a fresh
directory `$FUNDED_FIXTURES`. The fixture builder accepts that directory's
Native/FT/NFT artifacts and AMM/Curve configs, the reviewed `compile_stream_market`
binary and its SHA256, and a **fresh** output directory:

```sh
node batching/checkpoint-stream/funded-build.mjs "$FUNDED_FIXTURES" "$REVIEWED_COMPILER" "$COMPILER_SHA256" "$FRESH_FIXTURES"
```

The compiler used here has SHA256
`1f6963d8c7c16115c42bb1b0e8b966eb7f9462c33413b3445853be470904e801`.
Source/artifact/dependency hashes are in `fixtures-v1/FUNDED-BUILD.json`.
Only new fixture identities are generated; this builder is not a live deployer.

Materialize application source outside the repository and frozen SDK trees:

```sh
python3 batching/dependencies/prepare_mainnet_beta_application.py --source "$FROZEN_SOURCE" --out "$FRESH_APPLICATION" --test-only
```

With `PSY_NETWORK=testnet`,
`PSY_MARKET_TESTNET_PROFILE=mainnet-beta-20261027-v1`, `RAYON_NUM_THREADS=2`
and `BATCH_BUILD=$FRESH_FIXTURES`, run the two VM cases first:

```sh
cargo +nightly-2025-09-20 test --offline --locked --release --manifest-path "$FRESH_APPLICATION/Cargo.toml" --test batch_lifecycle deterministic_ -- --test-threads=1
```

The expensive full proof test is explicitly ignored by default. Declare finite
compute bounds and a sole proof owner, set `FUNDED_BOOTSTRAP_OUT` to a fresh
directory, then run only:

```sh
cargo +nightly-2025-09-20 test --offline --locked --release --manifest-path "$FRESH_APPLICATION/Cargo.toml" --test batch_lifecycle deterministic_fresh_vault_bootstrap_complete_ups -- --ignored --test-threads=1 --nocapture
```

The accepted run used a sealed copy of the test executable; hash it before and
after execution. Do not use the diagnostic witness-audit flag for normal proofs.
The test creates four complete UPSs without RPC or financial authority.

For existing saved requests, build `verify_saved_ups` from a fresh application
snapshot without `--test-only`, using the same frozen Cargo cohort/domain. Its
arguments are `PUBLIC_REQUEST FRESH_REPORT`; it verifies the exact saved Endcap
and metadata without generating a new proof or sending anything.

For public consistency tests, set `FUNDED_FIXTURES` and `FUNDED_UPS` to the
decompressed fixture/full-ups-v2 directories:

```sh
node --test batching/checkpoint-stream/funded-generate.test.mjs batching/checkpoint-stream/funded-policy.test.mjs batching/checkpoint-stream/audit-funded-evidence.test.mjs
node batching/checkpoint-stream/audit-funded-evidence.mjs "$FUNDED_UPS" "$FUNDED_FIXTURES"
```

Missing fixture environment variables skip fixture-dependent JS tests; a skip is
not acceptance. The archived final runs supply them and contain no skipped JS
tests. `archive-funded-evidence.py CASE FRESH_OUTPUT` reproduces the explicit
publication projection from the retained local case; checksum tests do not make
its reports trusted proof-verification inputs.
