# SDK dependency snapshots

The active selection is [selected.json](selected.json): `psy-sdk/mainnet-beta`
at exact commit `01b8f2b0a077367a7b9879baba1a72aea8ab5510`. On 2026-11-02 the
remote `mainnet-beta` and `audit` refs both resolved to this already reviewed
commit. No SDK/client source bytes, Cargo dependencies, verifier keys, network
domains or installed wallet distribution changed when switching branch provenance.

Use `prepare_selected_application.py --source /frozen/source --out /fresh/app`
to verify the 2,759 original source members and prepare a new application tree.
Compile that tree with the recorded `sdk-audit-v1` feature and locked dependencies.
The existing [audit source freeze](audit-20261102/manifest.json), profile IDs,
manifest digest and verification resources retain their historical names and
bytes. These names identify a reviewed release, not a moving Git branch. A branch
name alone never authorizes another commit or an older release.

For an empty workspace, `materialize_audit.py` still reconstructs exactly that
same commit from explicit object stores; it does not follow `audit` or fetch a
branch. The [2026-10-27 mainnet-beta freeze](mainnet-beta-20261027/README.md) at
`c92880c8...` is historical and must not be selected as a fallback. Do not build
against an arbitrary sibling Node checkout. This metadata alignment does not
close the [private-token compiler gap](../../docs/security/TOKEN_COMPILER_INTERFACE_REVIEW_20261102.md).

The instructions below describe **historical reproduction only**. Use the
application commit recorded by the historical evidence; current migrated source
requires the selected new SDK. The old application Cargo.lock is retained in
`session-bound-sdk-20261020/Cargo.lock` so preserving this snapshot does not
constrain or overwrite the active lockfile.

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
