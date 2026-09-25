#!/usr/bin/env bash
set -euo pipefail

if [[ -x /opt/homebrew/bin/go ]]; then
  export PATH="/opt/homebrew/bin:$PATH"
fi

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_source="${PSY_NODE_SOURCE:-$(cd "$project_dir/../.." && pwd)/psy-node}"
if [[ ! -f "$node_source/Cargo.toml" || ! -f "$node_source/psy-genesis/config.json" ]]; then
  echo 'PSY_NODE_SOURCE must point to a local psy-node checkout with psy-genesis/config.json' >&2
  exit 1
fi

node_revision="$(git -C "$node_source" rev-parse HEAD)"
patch_file="$project_dir/compiler/private_intrinsics.patch"
patch_revision="$(git hash-object "$patch_file")"
build_dir="${PSY_PRIVATE_TOOLCHAIN_DIR:-${TMPDIR:-/tmp}/psy-template-private-toolchain-$node_revision-$patch_revision}"
if [[ ! -f "$build_dir/.psy-template-private-patched" ]]; then
  mkdir -p "$build_dir"
  git -C "$node_source" archive HEAD | tar -xf - -C "$build_dir"
  patch -d "$build_dir" -p1 < "$patch_file"
  touch "$build_dir/.psy-template-private-patched"
fi

cp "$project_dir/compiler/psy_private_note_fingerprint.rs" \
  "$build_dir/client_prover/psy_cli/psy_user_cli/src/bin/psy_private_note_fingerprint.rs"

# Only an isolated archive is patched. The source checkout is read-only here.
PSY_CONFIG_PATH="$node_source/psy-genesis/config.json" \
  cargo build --release -p psy_user_cli --bin psy_user_cli --bin psy_private_note_fingerprint \
    --manifest-path "$build_dir/Cargo.toml"
echo "$build_dir/target/release/psy_user_cli"
