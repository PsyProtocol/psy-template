# Selected mainnet-beta SDK source

The user selected `PsyProtocol/psy-sdk` **mainnet-beta**, pinned here to
`c92880c8b6e2c8d392f19368bc8801a2584fd427` (observed October 27, 2026).
Its consumed client revision is `b280d714a8f0930c61962c885374ea63ea63d274`.
The existing upstream backend replacement is
`plonky2-hwa@736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. No source patch is applied
to Node, the SDK or these dependencies. A moving branch is never a build pin.

This corrects the earlier scope misunderstanding: `release/testnet-stable` is
a Node deployment branch, not this selected SDK branch. The previous native
incompatibility result concerns the old `session-bound-sdk-20261020` snapshot;
it is not a failure of the selected mainnet-beta SDK. That historical snapshot,
its source recipe, code, build products and evidence remain unchanged.

The current native protocol checks **pass** with the selected source: numeric
deployer, `transfer`/`claim`/`burn` and automatic burn ID `3998182541`, plus exact
bytecode/code-root equality. Application SD-key and numeric-owner adapters now
pass complete market commit/settle and ordinary funding/claim proofs. The
unchanged browser SDK distribution also built. See the
[migration report](../../../docs/security/MAINNET_BETA_MARKET_MIGRATION_20261027.md)
for exact evidence and consumer gaps. Live inclusion, a new reviewed registry
and browser write authorization remain separate gates.

## Reconstruct without changing existing repositories

Use Git object repositories containing the four exact commits in `manifest.json`:

```sh
python3 batching/dependencies/materialize_mainnet_beta.py \
  --sdk-objects /absolute/psy-sdk \
  --client-objects /absolute/psy-node \
  --genesis-objects /absolute/psy-genesis \
  --out /absolute/fresh/source
```

The output must not exist. The tool never fetches, follows a branch, edits a
source repository or patches code. It verifies 2,756 upstream file hashes and
rejects archive links/traversal. SDK and client Genesis gitlinks are restored
individually; they have different commits but identical selected testnet config.
These are public configuration/artifact inputs, not new Genesis generation.

Place this application under `/absolute/fresh/source/psy-template`. Compile only
the native diagnostic consumer before attempting any financial integration:

```sh
PSY_NETWORK=testnet \
PSY_CONFIG_PATH=/absolute/fresh/source/psy-sdk/psy-genesis/config.json \
CARGO_TARGET_DIR=/absolute/fresh/target \
CARGO_BUILD_JOBS=2 RAYON_NUM_THREADS=2 \
cargo +nightly-2025-09-20 build --release --locked \
  --manifest-path /absolute/fresh/source/psy-template/batching/sdk-mainnet-beta-preflight/Cargo.toml
```

Use the retained consumer Cargo.lock. Offline reproduction additionally requires
its registry/git sources in the local cache. An initial offline build without the
new backend source failed and is retained; no fallback backend was substituted.
The consumer imports the exact core/VM crates consumed by the selected SDK. It
does not by itself attest a complete distribution; the later build and compiler
pins are recorded in the migration report.

The stage is explicitly **testnet**, with magic `1384803358401154921`
(`0x1337CF514544CF69`) and the upstream staging URLs. The SDK branch name does
not select the mainnet network. Do not reuse the old `sepolia` build selector or
silently rewrite domain constants. Keep package source version 2.0.8 distinct
from registry publication/packed-output acceptance, neither of which was done.

See the [compatibility evidence and migration boundary](../../../executor/verification/2026-10-27-sdk-mainnet-beta-v1/README.md).
