# Recovered chain / incompatible Endcap / application hardening

This archive contains public read-only observations and application regressions
from 2 November 2026. It authorizes no payment. There are zero new accounts,
faucet requests, instances, full UPSs, network fills/claims or spent test PSY.

[Review and exact scope](../../../docs/security/PRODUCTION_RESUME_20261102.md).
Use **`manifest-v2.json`** for member verification. The initial `manifest.json`
accidentally included a hash of its own empty in-progress file; that invalid
original is preserved and explicitly indexed by the corrected manifest.
`public/PACKAGING-CORRECTION-v1.json` records the correction. The new manifest
snapshots members before opening its output and hashes README and the old
manifest as ordinary members, excluding only itself. No source, RPC response or
proof changed. The original full remote circuit registry
remains in the local acquisition directory and is referenced by SHA256; only the
explicit public Endcap projection is published. No browser profile, generated
wallet bundle, credential, recovery material or signing witness is included.

`public/` retains initial plans, all explicit RPC requests/replies, the actual
resource mismatch, SDK/native startup failure, separate workspace-setup failure,
red reproductions, focused/full wallet and Executor tests, build logs and exact
post-build distribution hashes. `SUMMARY-v1.json` distinguishes observations,
synthetic checks, actual extension onboarding and missing live acceptance.
`UPSTREAM-v1.json` is the concrete runtime/release/security delivery checklist.
Wallet source commit is `0a2fe2be51bebeaf4a54c2112b6434c3d08971f6`.

Use current source on the same application branch and the unchanged frozen SDK.
For the finite host regressions (Node v24.22.1):

```sh
node --test executor/runtimeEndcap.test.mjs executor/fundedStreamAdapter.test.mjs \
  executor/publicState.test.mjs executor/publicRpcWire.test.mjs \
  executor/fundedExit.test.mjs executor/funded.test.mjs \
  executor/fundedRegistration.test.mjs executor/readSingleFlight.test.mjs \
  executor/preflightRecovery.test.mjs executor/chainReceipts.test.mjs
```

For the wallet, use the unchanged reviewed 472-file SDK distribution and the
published consumer manifest in a **fresh** workspace. Run `scripts/verify-sdk.mjs`,
`vitest run`, `npm run build:staging`, and the SDK guard again. Never accept a
changed local sibling package or bypass the guard. `source/validate_wallet_v1.py`
and the logs describe the actual isolated workspace and command boundaries;
its local paths require deliberate adaptation into new output directories.
Existing public Genesis ABI/config files are required. Builds do not install a
wallet, create an account or authorize an instance-specific release.

The unchanged pinned native inspector, with explicit `PSY_NETWORK=testnet`,
`PSY_MARKET_TESTNET_PROFILE=mainnet-beta-20261027-v1` and the frozen
`PSY_CONFIG_PATH`, rejects `public/runtime-endcap-projection-v1.json` against the
frozen compiled verifier. Reuse its original audited source/toolchain if
rebuilding. Do not install the observed remote key to make this test pass.

Do not replay network capture scripts, old-chain requests or financial tasks as
part of offline reproduction. Raw read agreement is not authenticated finality;
compatibility inspection is not an approved-call/full-UPS proof. A welcome screen
is not real wallet settlement. No matched latency, memory, fee or TPS improvement
is established by this archive.
