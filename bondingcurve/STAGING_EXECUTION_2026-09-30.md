# Bonding curve staging execution — 2026-09-30

Network: Psy Sepolia staging. The companion token and curve are deployed, and the public SD-key vault is registered. Minting, inventory funding, initialization, trading, refunds and graduation have **not** been submitted. The issuer has zero spendable PSY and the MCP faucet reports all operators busy.

## Confirmed deployments

| Component | Contract ID | Included checkpoint | Included time (UTC) | Transaction hash |
| --- | ---: | ---: | --- | --- |
| Fixed-supply launch token | 65 | 92385 | 2026-09-30 15:15:18 | `33b3594a61194ad445019fc032ce16bd9115b27c2241a2e64b3fd7545056e4d3` |
| Bonding curve | 66 | 92460 | 2026-09-30 15:22:48 | `21cd2d6ab077b29a5766a03e2274f193dadecc272b1bf203f9a5dd56c1806789` |

Both deployments used the configured **Psy Wallet MCP** `psyup_deploy` tool and issuer `Psy-01882112`. Each deployment was submitted once. The guard generated an issuer-bound request, checked the compiled artifact hash and empty → new layout endpoints, and independently verified the canonical layout proof before submission. The CLI regenerates the proof during submission; both actual submitted proofs were independently verified afterward as well. No contract update was submitted.

| Component | Code root | Layout root | Fields | Slots |
| --- | --- | --- | ---: | ---: |
| Token 65 | `dda0654156bc2d99229911678c853416699d6dc566ea5751b38de75f326e6855` | `37b9a3c271e229caafc399538416c01f79ab00cccd8c157a595090cac549a2d9` | 5 | 2147483652 |
| Curve 66 | `6cd2f5e219cfd8c1880f1673027690297c62cd92a43deee7dc3d816fd38a9d24` | `25f75784df8420fe918ac28cc845880f4c4c1e3891976b2a06577b177df51888` | 26 | 2197815318 |

Both state trees have height 32. The deployment verifier fingerprint is `f2be754869220ac3bd68cfba16bbfdf50159cd667c3b445efb0adf807d175e9f`. Chain leaves matched the reviewed code and layout roots. Subsequent checkpoint `92535` showed `next_contract_id=67` and continued block production.

The earlier preflight assumed that a wallet needed PSY to deploy. Inspection of the current deployment RPC corrected that assumption: it does not debit/check wallet balance. Ordinary UPS transactions, including minting and transfers, still need PSY fees. MCP policy accounting for deployment is separate from the wallet's chain balance.

## Registered public SD-key vault

| Role | User ID | Psy ID |
| --- | ---: | --- |
| Issuer, created with MCP | 1882112 | Psy-01882112 |
| Public SD-key vault | 758784 | Psy-00758784 |
| Staging graduation receiver, created with MCP | 1283072 | Psy-01283072 |

Vault public key hash: `65a6480a24934affad32db5f591962b6e889917cd20f19dc0a39f5c44d165aff`.

Vault policy fingerprint: `3eda54589294415dda512d0d054146acf13ed9176094b89b1a1f3b858e43349e`.

The policy fixes curve ID 66, token ID 65, issuer and graduation receiver, and the configuration below. Registration tree leaf **1338** at checkpoint **92535** exactly matched the fingerprint-bound public key hash. The local UPS start proof for this registered identity succeeded. The account has not performed its first UPS yet, so its user-state leaf still has a zero public-key field, nonce and balance. The coordinator's `get_public_key_for_user_id` lookup also returned unavailable for this inactive account; registration was verified using the registration tree and public-key-to-user-ID mapping instead.

The initial registration attempt and one retry failed before registration with an HTTPS connection error. Investigation found that this standalone Cargo package had no TLS feature enabled for reqwest 0.12, while the existing CLI enabled it through another dependency. Explicitly enabling `default-tls` in `sdkey-circuit/Cargo.toml` fixed the transport. The subsequent registration succeeded. Contract source, layout and policy circuit were unchanged by this build fix.

The receiver is a staging handoff account. It does not implement a successor AMM market; automatic AMM market creation remains separate work.

## Immutable staging configuration

See `deployments/staging-2026-09-30/curve.launch-config.json`.

| Parameter | Value |
| --- | ---: |
| Maximum sale lots | 4 |
| Reserved liquidity lots | 2 |
| Token base units per lot | 1000000000 |
| Base price, PSY base units | 100000000 |
| Price increment, PSY base units | 1000 |
| Graduation threshold, sold lots | 3 |
| Fixed token supply, base units | 6000000000 |

The companion token has been deployed but its supply has not been minted. The vault has not received either asset and remains uninitialized.

## Verification results

- JavaScript math/call-stack tests: 11 passed during preflight.
- Rust SD-key policy tests: 3 passed during preflight, including valid settlement/graduation and rejection of redirected or inflated outputs.
- Configured token simulation: issuer mint succeeded; another account was rejected.
- Both actual submitted layout proofs: canonical verifier fingerprint and independent cryptographic verification passed.
- HTTPS-enabled `curve_wallet` release build, `cargo fmt --check`, and `git diff --check`: passed.
- Registered-vault test against actual chain state: local `initialize` execution rejected with `issuer inventory or fee mismatch`, because both issuer Outboxes are empty. The diagnostic generated a valid local UPS start proof, then failed at the expected funding assertion. **No transaction was signed or submitted.** This is a negative execution test, not a successful live initialization or settlement.

## Funding blocker and remaining live tests

MCP `claim_faucet` repeatedly returned `all faucet operators are busy; retry shortly`. A post-deployment MCP `get_balance` confirmed issuer PSY balance **0**. Checks of all ten configured faucet operators found **0 claimable** for the issuer. Faucet operators checked: 262144, 1310720, 786432, 1835008, 131072, 1179648, 655360, 1703936, 393216, 1441792.

When faucet funding is available, continue with these already deployed contracts and registered vault:

1. Request test PSY through MCP, claim the grant, and confirm spendable balance. Supply test PSY to additional MCP buyer/seller accounts as needed.
2. Mint the fixed inventory once as issuer; verify repeated minting and unauthorized minting are rejected.
3. Send the exact inventory and fee escrow to the registered vault; prove and submit its six-call initialization stack. Check inventory, reserve and cursors.
4. Buy and sell with real staging PSY and token 65, claim the outputs, and reconcile every balance and reserve delta.
5. Test stale quotes, competing execution, replay, expired/unexecuted order refunds and attempted refund redirection. Record which requests are rejected locally and which transactions are included.
6. Reach the graduation threshold, fund the graduation fee, and verify the exact PSY reserve and remaining token inventory reach receiver 1283072. Verify that trading closes and outstanding refundable orders remain refundable.

Do not report these six steps as completed until actual transaction receipts and balance checks are saved.

## Evidence and reproduction

Public evidence is preserved in this repository at `bondingcurve/deployments/staging-2026-09-30/`: configured token/curve source, compilation JSON and ABI, prepared and submitted deployment requests containing layout proofs, receipts, chain leaf queries, registration evidence, launch configuration, the rejected initialization stack/log, and faucet claimable checks. SHA-256 manifests identify the copied artifacts.

Original execution files remain on this Mac under `/private/tmp/psy-curve-staging-20260930/`. The guarded MCP projects are in its `mcp-projects/` subdirectory. Deployment helpers are `mcp-probe.mjs`, `mcp-psyup-guard-v2.sh`, and `verify-mcp-deploy.mjs`; the earlier guard is preserved. Original files were not overwritten.

Repository: `/Users/geir/Downloads/QED资料/litepaper/psy-template`, branch `main`, base commit `377f4703aec2f945e3e650ade4810572ccb93f6a`; this work is uncommitted. The matching local CLI came from `../psy-node/target/release/psy_user_cli`, with node checkout HEAD `5b7f4e1e11adf4607a958bc39e863a2a80b5a7a6`. No psy-node source was modified for this execution, and contract 62 was not updated. No private keys, wallet backup paths, owner tokens or spending session tokens are included in the repository evidence.
