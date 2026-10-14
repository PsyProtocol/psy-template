# U124 staging executor

Installed on 2026-10-14 (Asia/Taipei) under the separate launchd label
`xyz.psy.executor.u124.staging`. The older `xyz.psy.executor.staging` service
remains unchanged.

| Market | Contract | Public SD-key vault |
| --- | ---: | ---: |
| AMM | 2443 | 401984 |
| Orderbook | 2444 | 1450560 |
| Bonding Curve | 2446 | 205376 |

The assets are custom staging Token A 2441 and Token B 2442, both with
18 decimals and two 62-bit balance limbs. Native PSY 0 pays fees at 9 decimals.
The runtime uses official HTTPS endpoints and needs no MCP owner/session
credentials or ordinary wallet keys. Its driver uses the deliberately public
SD-key with the registered fingerprint.

## Local release

Release root on this Mac:

`/Users/geir/Downloads/QED资料/litepaper/psy-template/executor/operations/staging-u124-2026-10-13`

- `app-v2/`: active frozen application runtime sources with ABI and recovery
  validation. The original `app/` remains available for rollback.
- `bin/market_wallet_verified`: tested public driver.
- `service.json`, the three vault configs, `abi/`, `policies/`, `configs/`:
  frozen chain identities and bindings.
- `rpc-config.json`: official HTTPS RPC/services endpoints.
- `SOURCE_MANIFEST.json`: original freeze hashes (38 source dependencies and
  the binary). Its original `installed: false` describes the preparation step;
  the later installation record is in the acceptance directory.
- `SOURCE_MANIFEST_V2.json`: active release hashes (40 source dependencies and
  the same tested binary). Activation preserved the original runtime/configs.
- `runtime/`: durable journals copied from successful acceptance, public calls,
  submission logs, service stdout/stderr. Original test journals were retained.
- `service-status.json`: mutable status/heartbeat.

The machine must remain awake, connected and logged into this macOS user.
This login service does not provide a server availability guarantee.

## Inspect and stop

Run from this checkout:

```sh
node executor/operations/staging-u124-2026-10-13/app-v2/executor/service.mjs \
  executor/operations/staging-u124-2026-10-13/service.json status
launchctl print "gui/$(id -u)/xyz.psy.executor.u124.staging"
```

The status contains per-market phase, last confirmed receipt and latest scan
checkpoint. Its top-level heartbeat updates every ten seconds. Scans run every
30 seconds. Configured ordinary users are C 8768 and D 1057344; the AMM also
observes Curve vault 205376. The bounded acceptance payer 1253952 was retired.
Add user discovery hints with `usersFile` as described in the executor README.

To stop this instance:

```sh
launchctl bootout "gui/$(id -u)/xyz.psy.executor.u124.staging"
```

To start the installed plist again:

```sh
launchctl bootstrap "gui/$(id -u)" \
  "$HOME/Library/LaunchAgents/xyz.psy.executor.u124.staging.plist"
```

Preserve the runtime directory on restart or migration. Allow an already
executing proof to finish during a graceful shutdown. Inspect an unresolved
submission's exact leaf and durable log; absence of a receipt does not authorize
rebroadcast. All competing executors on this machine must share the same
runtime directory. Cross-machine leases have not been implemented or tested.

## Verification

The [2026-10-14 report](../../verification/2026-10-14-resume-01/REPORT.md) and
[public result snapshot](../../verification/2026-10-14-resume-01/LIVE_RESULTS.json)
record three-market compound claim/close, Curve-to-AMM seeding, two real
executors, proof-owner crash recovery, one broadcast/asset movement, and
asset conservation. The service startup scan and configuration hashes were
checked after installation. Independent external security audit remains open.

Local binaries, frozen copies, configs and mutable runtime files are not Git
source deliverables. This document identifies the verified local installation.

The [hardening report](../../verification/2026-10-14-hardening-02/REPORT.md)
records the v2 activation and compatibility checks. Its pre-activation launchd
plist backup preserves the original startup configuration.
