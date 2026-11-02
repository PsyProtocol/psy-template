# Reset-chain development and first-registration guard

[Review and exact acceptance boundaries](../../../docs/security/RESET_CHAIN_DEPLOYMENT_20261102.md).
This is read-only reset-chain/necessary Native compatibility evidence and finite
application regression, not a financial deployment or network settlement.

`public/` contains fresh eight-read observations, a known-field Endcap projection,
public Native bytecode, exact source-pin checks, upstream source inspections,
original expected-red/intermediate/final host logs and offline build/inspection
reports. Original full remote registry captures remain in the local case; the
published projection is labeled with the original response digest. No wallet,
secret witness, credential, recovery file or executable is published.

`public/native-code-response-v1.json.gz` is the public Native code response;
`NATIVE-CODE-ARCHIVE-v1.json` hashes both original and compressed bytes. Unpack it
only into a fresh output directory. `source/` preserves the exact checker,
application/lock manifests, financial-route changes and bounded native runner.
`manifest.json` snapshots and hashes all members before opening its own output.

For finite non-financial host regression with Node v24.22.1:

```sh
node --test executor/fundedRegistration.test.mjs \
  executor/fundedStreamAdapter.test.mjs executor/funded.test.mjs \
  executor/runtimeEndcap.test.mjs executor/publicState.test.mjs \
  executor/publicRpcWire.test.mjs executor/preflightRecovery.test.mjs
```

Recreate the Native checker through the existing
`batching/dependencies/prepare_mainnet_beta_application.py` using the unchanged
frozen c92880c8 SDK/client/backend sources; do not build against another local
SDK/Node checkout. Use `nightly-2025-09-20`, `--offline --locked --release`, two
jobs/threads, explicit `PSY_NETWORK=testnet`, the frozen `PSY_CONFIG_PATH`, and
`PSY_MARKET_TESTNET_PROFILE=mainnet-beta-20261027-v1`. Build only
`chain_protocol_preflight`, then pass the public Native leaf/code envelopes and
a fresh report destination. Source/lock/toolchain/dependency identity is recorded;
a different build path can change executable bytes and is not a byte-identical
binary reproducibility guarantee. This helper proves no finality, layout
inclusion, approved-call/full UPS or financial authorization.

Do not replay RPC acquisition, registration or financial operations as part of
offline reproduction. Existing unknown requests are retained in their own chain
scope; incompatible runtime resources do not authorize re-signing or a second
send. The discovered latest branches are inspected source candidates only;
none is installed and the current runtime verifier mismatch remains a stop.
