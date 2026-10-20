# Reproducible application SDK snapshot

`session-bound-sdk-20261020/` freezes the **existing** local SDK dependency,
not a new Node change or an upstream SDK release. It records base Git commit,
three pre-existing source deltas, 1,466 tracked files in 30 consumed path crates,
the application Cargo.lock, public build configuration, host and toolchain.
Unrelated MCP edits and untracked wallet files are excluded.

Reconstruct into a fresh workspace (never point `--out` at an existing Node tree):

```sh
python3 batching/dependencies/materialize_sdk.py \
  --objects /path/to/read-only/psy-node-git-objects \
  --genesis-objects /path/to/read-only/psy-genesis-git-objects \
  --out /fresh/workspace/psy-node
```

Objects must contain commit `5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6`.
A clean clone containing that commit also works; no dirty worktree is required.
The command validates all consumed source hashes and refuses existing output.
Place a checkout of this application at `/fresh/workspace/psy-template`, then:

```sh
PSY_CONFIG_PATH=/fresh/workspace/psy-node/frozen-build-config.json \
PSY_NETWORK=localhost \
CARGO_TARGET_DIR=/fresh/workspace/check-target \
cargo +nightly-2025-09-20 check --offline --locked \
  --manifest-path /fresh/workspace/psy-template/amm/u124/vm-tests/Cargo.toml \
  --bin policy_identity
```

Cargo registry/git dependencies remain pinned by Cargo.lock. Offline builds
require the corresponding registry/git source cache; a cross-platform `cargo
metadata` may additionally request crates for other hosts. Record the build
host and use `--filter-platform aarch64-apple-darwin` for host metadata. This
snapshot is not a claim that a network-isolated machine with no dependency
cache can build, that binaries are bit-identical across hosts, or that the
stable running service has been attested.

The application compile gate retains the SDK's session binding API requirement.
Never remove it or the source constraints to accommodate the stable SDK.

The build also consumes psy-genesis `9ea96ca13f60247c22b2108f086fb9cd1287ba94`
`genesis_contracts.json`. Its exact file hash is frozen; omitting this gitlink
input causes a fresh build to miss precompile constants even with correct Rust
sources. The first isolated failure is retained as evidence.
