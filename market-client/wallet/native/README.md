# Public market proof verifier

This application verifier consumes the selected, unchanged `mainnet-beta` SDK
primitives. It verifies the complete EndCap, each CFC/UPS step, ordinary
signature, ordered calls, session roots, code/layout/function membership,
state deltas, fees and approval endpoints. It does not sign, prepare a witness,
read RPC or broadcast. Verifier/common resources are compiled into the WASM;
a page cannot provide replacement keys at runtime.

The native test exports verifier-only resources from circuits built from frozen
source. Its synthetic state uses market 1000/vault 100. **That fixture pack must
never be installed as the live market pack.** A live pack requires reviewed
artifact provenance and exact code/layout/function roots for its actual IDs.
The resource digest is an extension build input, not a dApp/RPC argument.

## Reproduce the public verification

Use the SDK/client/backend revisions and testnet configuration recorded in
`batching/dependencies/mainnet-beta-20261027/manifest.json`. Supply an existing
verified source cohort and a fresh output directory:

```sh
python3 market-client/wallet/native/prepare.py \
  --source "$SDK_SOURCE" --pack "$PUBLIC_FIXTURES/verifiers.json" \
  --out "$VERIFIER_BUILD"
export CARGO_TARGET_DIR="$VERIFIER_BUILD/target"
PSY_NETWORK=testnet PSY_CONFIG_PATH="$SDK_SOURCE/psy-sdk/psy-genesis/config.json" \
  RUSTFLAGS='--cfg getrandom_backend="wasm_js"' \
  cargo +nightly-2025-09-20 build --release --locked --offline \
  --target wasm32-unknown-unknown --manifest-path "$VERIFIER_BUILD/Cargo.toml"
wasm-bindgen "$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/psy_market_wallet_verifier.wasm" \
  --target nodejs --out-dir "$VERIFIER_BUILD/node" --out-name market_verifier
node market-client/wallet/native/acceptance.mjs \
  "$VERIFIER_BUILD/node/market_verifier.js" "$PUBLIC_FIXTURES" "$FRESH_REPORT"
```

Use wasm-bindgen 0.2.126. On macOS the transitive `blst` build needs a WASM-capable
C compiler and archiver through `CC_wasm32_unknown_unknown` and
`AR_wasm32_unknown_unknown`; Apple's default compiler is insufficient. The
producer preserves the selected dependency graph and rejects version/source
drift. Do not use `cargo generate-lockfile`, which upgrades compatible crates.
A browser build uses wasm-bindgen's `web` target and an extension-owned loader.

`verify_market_public` re-verifies an exact saved request with the same native
core, without generating another proof. Its arguments are `PACK PACK_SHA256
REQUEST APPROVAL BUNDLE FRESH_REPORT`.

## Wallet lifecycle

```text
reviewed plan -> prepare once -> save exact unverified public capsule
  -> complete verification -> wallet confirmation of exact calls/fee
  -> fresh network/code/key/state/nonce/expiry/fee check
  -> save approval and broadcast intent -> one exact POST
  -> reconcile original content hash + receipt + historical end leaf
```

`createMarketWalletService` requires extension-owned verifier functions,
resource digest and confirmation callback. It creates no page RPC or financial
permission. The existing wallet integration remains prepare-only until the
live resource pack, confirmation surface and browser acceptance are installed.
A required browser-origin LockManager serializes the complete durable-state
read/write and send path across extension contexts. Prepare-only instances use
the same authority when available. A missing LockManager closes the native
factory and a direct staged broadcast without that authority fails closed.
An in-memory store-object lock alone is not accepted for financial writes.
The unverified capsule survives validation failure, restart and lost replies;
unknown broadcast results never cause re-signing or retransmission.

The selected protocol authenticates event count/envelope, **not event data**.
Event sidecars are advisory and cannot establish funds, NFT identity or receipt
inclusion. NFT writes fail closed pending same-UPS token-identity postconditions.
Read-only RPC rechecks do not attest remote runtime/upgrade governance and are
not a replacement for complete cryptographic proof verification.
