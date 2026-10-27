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

## Source-derived numeric-ID resources

`export_market_verifiers REVIEWED_ARTIFACTS_JSON FRESH_DIRECTORY` checks every
input file hash, code/layout identity, complete source whitelist and selected
method set. Inputs contain local `file`, `sha256`, reviewed `binding` and
`methods` for each contract. It exports only verifier/common bytes; no RPC or
proof is sent. Never infer a replacement contract ID before its actual receipt.

`ownedLoader.mjs` is for an extension bootstrap with statically imported
bindgen glue and compiled release pins. It accepts only that extension's own
resource URL, verifies WASM bytes and embedded resource/SDK/network identities,
and snapshots pins/functions before awaiting I/O. A failed release stays failed
for that context. It creates no page RPC or approval permission. The related
`loaderAcceptance.mjs` exercises real web-target WASM and a saved public proof
in Node with simulated extension location/file transport; it is not evidence
of actual extension installation or financial authorization.

The loader accepts only the sealed application glue. After `wasm-bindgen
--target web`, run `sealGlue.py --js ORIGINAL_JS --sha256 REVIEWED_JS_SHA256
--wasm ORIGINAL_WASM --out FRESH_DIRECTORY`. The exact original remains intact;
the fresh copy exports a read-only module-identity accessor. One initializer
can own only one release. Preinitialized or raced glue rejects, and successful
initialization must identify the exact compiled verified module. The helper
never patches the SDK prover. `loaderAcceptance.mjs` tests same-pack/different-
binary reuse and preinitialization with real bindgen output.

## First-session proof variant

A zero stored user leaf requires the separately pinned SDK registration-start
verifier, nonce one and its authenticated empty session leaf. Its signature
hashes that initialized session leaf; its Endcap still binds the zero stored
leaf. Missing registration resources reject. Initialized-user proof packs remain
usable only for their initialized-user branch.

The ignored `full_ups::wallet_proof::verify_preserved_wallet_bundle_and_mutations`
test accepts `MARKET_WALLET_REPLAY_IN` and a fresh
`MARKET_WALLET_VERIFIER_OUT`, with the selected release manifest and `--test
batch_lifecycle -- --exact --ignored --nocapture`. It only re-verifies saved
public bytes and negative mutations; it creates no replacement proof or request.
For the native claim/burn first-session case, after the normal WASM build:

```sh
node market-client/wallet/native/firstSessionAcceptance.mjs \
  "$VERIFIER_BUILD/node/market_verifier.js" "$PUBLIC_FIXTURES" "$FRESH_REPORT"
```

This uses the actual compiled WASM with public synthetic proofs. It does not
simulate an extension origin or prove live registration, broadcast, receipt or
ordinary-wallet acceptance. See
[the first-session report](../../../docs/security/FIRST_SESSION_WALLET_VERIFICATION_20261028.md)
for failures, exact proof reuse, fee-slot conservation and unclosed activation gates.
