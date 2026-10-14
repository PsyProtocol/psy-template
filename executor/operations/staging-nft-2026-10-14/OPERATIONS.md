# NFT staging executor

Installed on 2026-10-14 under the separate login-service label
`xyz.psy.executor.nft.staging`.

| Object | Contract / user ID |
| --- | ---: |
| NFT Market | 2452 |
| Public SD-key vault | 1256000 |
| NFT collection | 2447 |
| U124 payment token | 2448 |
| Configured ordinary users | 936512, 1448512, 1460800 |

The FT has 18 decimals; Native PSY 0 pays fees at 9 decimals. These are
isolated staging assets, not genesis pUSDT. See the [acceptance report](../../../nft-marketplace/verification/2026-10-14-production-01/REPORT.md).

## Frozen local installation

Root on this Mac:

`/Users/geir/Downloads/QED资料/litepaper/psy-template/executor/operations/staging-nft-2026-10-14`

- `app/`: 46 frozen source dependencies and an ESM package descriptor.
- `bin/market_wallet_verified`: verified application driver with HTTPS enabled.
- `nftmarket.json`, ABI, policy and driver config: chain identities and roots.
- `rpcConfig.json`: official HTTPS endpoints; no loopback transport dependency.
- `SOURCE_MANIFEST.json`: preparation-time source and binary hashes. Its
  `installed: false` records preparation; the later installation receipt is
  retained with the acceptance evidence.
- `runtime/`: durable journals, calls and submission logs copied after all
  acceptance transactions were reconciled. Original evidence remains in its
  original directory; historical proof paths in included records are retained.
- `service-status.json`: mutable heartbeat, phases and scan checkpoint.

The service needs no ordinary private keys, wallet recovery files or MCP
owner/session credentials. The public key material is deliberately public;
the registered fingerprint constrains its permitted call stack.

## Inspect, stop and recover

```sh
node executor/operations/staging-nft-2026-10-14/app/executor/service.mjs \
  executor/operations/staging-nft-2026-10-14/service.json status
launchctl print "gui/$(id -u)/xyz.psy.executor.nft.staging"
```

To stop:

```sh
launchctl bootout "gui/$(id -u)/xyz.psy.executor.nft.staging"
```

To start the installed configuration:

```sh
launchctl bootstrap "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/xyz.psy.executor.nft.staging.plist"
```

Preserve the runtime directory. An unknown submission blocks the vault until
the exact durable leaf/log is reconciled; absence of a receipt is not permission
to retry. Do not run a competing executor using a different runtime directory.
Moving pending records requires inspecting their absolute call/log bindings;
this installation copied only a fully reconciled journal.

Scans run every 30 seconds, using the configured user list and referenced
sellers. All-chain user discovery and cross-machine leases are not implemented.
This login service depends on the Mac remaining awake, online and logged in;
it is not a production availability guarantee. Security and operational release
gates remain in [PRODUCTION_READINESS.md](../../../PRODUCTION_READINESS.md).
