# Bonding curve staging preflight — 2026-09-30

> Historical snapshot taken before deployment. See [STAGING_EXECUTION_2026-09-30.md](STAGING_EXECUTION_2026-09-30.md) for the subsequent deployments of token 65 and curve 66. The earlier assumption below that zero PSY prevents deployment was corrected: the current deployment RPC does not debit a wallet balance. Minting and other UPS transactions still require fees.

Network: Psy Sepolia staging. No bonding curve or companion token deployment has been submitted as of this report. Contract 62 was not updated and psy-node source was not changed.

## MCP wallet identities

| Role | User ID | Public key hash | Status |
| --- | ---: | --- | --- |
| Issuer | 1882112 | `dc99845e40abd523a573883147959f7754803cedd72a223eec27366e7235fffa` | Registered, 0 spendable PSY |
| Graduation handoff receiver | 1283072 | `08bd17c4220d8ae3fa3da68b418b14ea40eb309d25feb17e15b21564ebd81b57` | Registered |

Both keys were created by the configured Psy Wallet MCP server and backed up in its owner-side keystore. This report contains no private keys, backup paths, owner token, or session tokens. The handoff account is a staging receiver; it is not an AMM market vault.

The issuer's MCP policy now permits `deploy_contract` and `call_contract` within its original 10 PSY per transaction, 50 PSY per day, and 100 PSY lifetime caps. Its outbound recipient allow-list remains empty. No spending session has been issued and its spent counters remain zero.

## Reviewed deployment candidates

| Candidate | Layout | Code root | Method count | Source |
| --- | --- | --- | ---: | --- |
| Fixed-supply `PsyLaunchToken` | Empty → 5 fields, root `37b9a3c271e229caafc399538416c01f79ab00cccd8c157a595090cac549a2d9` | `dda0654156bc2d99229911678c853416699d6dc566ea5751b38de75f326e6855` | 3 | `/private/tmp/psy-curve-staging-20260930/launch-token-candidate/main.psy.rs` (issuer 1882112, supply 6,000,000,000 base units) |
| `PsyBondingCurve` | Empty → 26 fields, root `25f75784df8420fe918ac28cc845880f4c4c1e3891976b2a06577b177df51888` | `6cd2f5e219cfd8c1880f1673027690297c62cd92a43deee7dc3d816fd38a9d24` | 11 | `bondingcurve/contract/src/main.psy.rs` |

The token has the same four-slot Outbox prefix expected by the curve and by PSY. Its `claim` and `transfer` method IDs are `2394033944` and `194520553`. The ordinary `token/` template is not layout-compatible with this curve and must not be substituted.

The source and compiled artifacts are preserved in `/private/tmp/psy-curve-staging-20260930/`. The staged MCP deployment projects are under its `mcp-projects/` directory. Each compiled deployment artifact was reconstructed from the reviewed local compiler ABI and circuit definitions because the installed `dargo` parser does not accept the current `.psy.rs` contract syntax. Offline `psy_user_cli deploy-contract` generated prepared requests from these exact project artifacts without submitting them.

Both requests passed the pinned ABI, code root, method ID, empty old layout, new layout, and verifier-fingerprint checks. The canonical layout proofs were also independently verified with `/private/tmp/psy-layout-verify/target/release/psy-layout-verify`. The verifier fingerprint is `f2be754869220ac3bd68cfba16bbfdf50159cd667c3b445efb0adf807d175e9f`, matching the previously successful orderbook 64 deployment. An older installed CLI produced a different fingerprint, `71ccedf5edeb805302238b4bef499f618a37ff4f253c93e28ab4920f23d3e7bb`; its proof failed verification against the current canonical verifier and must not be submitted. The MCP deployment process is configured to use the matching local CLI and a fail-closed preflight guard that checks the actual issuer-bound request before it invokes `psyup deploy`.

The offline requests use a public dummy key only to generate reviewable proofs. Their deployer hash is deliberately not the issuer's hash. The MCP guard requires the issuer's public key hash when producing the final request; it does not expose the signing key.

## Verification completed

- `npm run test:bondingcurve`: 11 passed.
- Rust SD-key library tests: 3 passed, including positive settlement/graduation and negative redirected or inflated outputs.
- `cargo fmt --check` and `git diff --check`: passed.
- `mint_once` simulation: issuer succeeded; another account failed with `only launch issuer may mint`.
- Both reviewed deployment requests: empty → new layout endpoints checked and independent cryptographic proofs verified.

## Current blocker and remaining chain tests

The Psy Wallet MCP `claim_faucet` call repeatedly returned `all faucet operators are busy; retry shortly`. A later attempt timed out; a subsequent read-only balance and faucet-operator claimable check still found 0 PSY for the issuer. At checkpoint `92252`, a read-only latest block query showed `next_contract_id=65` and continued block production. There is no funded MCP issuer wallet, so no deployment, mint, funding, trading, refund, or graduation transaction has been submitted. Retry the MCP faucet when its operators recover; then claim the grant, verify spendable balance, re-read `next_contract_id`, and deploy the fixed-supply token followed by the curve using the guarded MCP path. Register and verify the curve's SD-key fingerprint before sending either asset to the vault. Prove each six-call vault stack before sending it, then test buy, sell, stale-order refund, and graduation with real staging assets. Record contract IDs, transaction hashes, checkpoint IDs, balances, and claim cursors here.

Do not assume token ID 65 or curve ID 66 until `next_contract_id` is checked immediately before each deployment. Do not fund an unregistered or mismatched SD-key vault. The handoff receiver only verifies the graduation transfer; a compatible AMM market for the new token requires a separate deployment.
