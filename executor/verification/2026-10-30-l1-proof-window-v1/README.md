# L1 inclusion prefetch and immutable Executor packets

This archive contains public **read-only inclusion evidence**, not market
transaction acceptance, finality, qualified entropy or wallet payments. All
financial/proving counts are zero. The generic archive-tool scope text must not
be interpreted as evidence of a financial Executor run.

See the [full review and remaining upstream deliveries](../../../docs/security/L1_PROOF_WINDOW_CONTINUATION_20261030.md)
and [team entry](../../../docs/security/MARKET_DEEP_VALIDATION_20261027.md).

## Actual results

- The unchanged old anchor still lacks an archival account/storage proof.
  Alternative provider errors, HTTP 429/522 and curl failures are preserved.
- A separately declared recent-header capture obtained real EIP-1186 data;
  complete 23-field header hashing, account/storage/code verification and
  fresh-process Executor reinspection pass on the same stored bytes.
- A delayed implementation proof at that first prospective header later failed
  the provider window. Complete paired prefetch at a second independent header
  obtained both accounts immediately; their MPT/code checks and EIP-1967
  location/account binding pass. A pair mixed across valid headers rejects.
- Three native unit tests, 26 native mutation rejections and two Executor tests
  support this inclusion scope. No new CFC/signature/Endcap UPS was generated.
- Runtime prover role is `user`, without system methods. The examined release
  run lists no artifacts. No running CST resource bundle was obtained.
- The Beacon feed returned no `LightClientFinalityUpdate`. No consensus or
  causal randomness certificate, source-equivalent deployed contract or new
  trust anchor was accepted.

`manifest.json` indexes 287 gzip members, including all original/compressed
hashes. Total compressed member bytes are 565,177. The public summary and the
two actual paired account reports distinguish inclusion from all missing trust
properties. Native build/inspection logs, failed probes and the initial build
selection failure are retained. Short inspections are undersampled by the 1 s
RSS monitor; their tiny samples are not physical memory peaks.

The archive includes the final four source files, frozen application identity
and lockfile, build/library hashes, exact immutable packets, regression inputs,
native reports, owned-output receipts and acquisition scripts. Unknown raw
responses, full transaction lists, wallet files, secret signing witnesses,
private keys, executables and SDK copies are excluded. MPT nodes and state/code
values in the selected public projections are public chain inclusion material.

## Offline reproduction

Materialize the existing frozen mainnet-beta source tree with the repository's
dependency workflow, and prepare a **fresh** application snapshot using
`batching/dependencies/prepare_mainnet_beta_application.py`. Keep SDK commit
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, the unchanged application lockfile,
toolchain `nightly-2025-09-20`, and the recorded environment:

```sh
export PSY_NETWORK=testnet
export PSY_MARKET_TESTNET_PROFILE=mainnet-beta-20261027-v1
export PSY_CONFIG_PATH="$SDK/source/psy-sdk/psy-genesis/config.json"
export CARGO_BUILD_JOBS=2
export RAYON_NUM_THREADS=2
```

The selected build also used the recorded Go runtime from the existing frozen
dependency setup. No dependency download or version change is required.

```sh
python3 executor/acceptance/buildL1ProofInspector.py \
  --manifest "$FRESH/application/Cargo.toml" \
  --target "$SDK/target" --out "$FRESH/inspector"
"$FRESH/inspector/l1-proof-inspector-tests" --nocapture
node --test executor/l1Evidence.test.mjs
```

This selects the unique release-target libraries from Cargo's exact artifact
stream, not guessed library filenames or another checkout. The recorded initial
host/release ambiguity was fixed by profile selection and exact-stream reuse;
the recovery arguments are in the build helper and public recovery plan.

Unpack the complete `files/packet-v1/*.gz` set into a new directory, or either
`paired-proxy-packet-v1` / `paired-implementation-packet-v1`. Use `packet.json`
to verify all four original member digests. Native input names are:

```text
STATEMENT REVIEWED_STATEMENT_SHA256 HEADER_PROJECTION PROOF_PROJECTION CODE_PROJECTION FRESH_REPORT
```

The formal operator-only Executor route can inspect a stored packet with:

```text
node executor/l1Evidence.mjs PACKET_DIRECTORY REVIEWED_PACKET_SHA256 NATIVE_DRIVER REVIEWED_DRIVER_SHA256 RUNTIME_DIRECTORY FRESH_REPORT
```

Use fresh reports/runtime directories and a reviewed binary hash from the new
build. Reports are compared to owned native output; supplied JSON reports or
external verifier URLs are not accepted. Reinspection of immutable historic
bytes creates no transaction or proof and makes no fresh-state/finality claim.

Do not replay archived network acquisition scripts for offline reproduction.
They are preserved as evidence of declared, bounded reads, not retry/funding
instructions. The native mutation harness is case-local and records all 26
rejections. Mixing the two valid-header packets is explicitly rejected by
`inspectL1EvidencePair`. Native code and Executor APIs deny signing, broadcast,
finality and qualified randomness even when every inclusion check passes.
