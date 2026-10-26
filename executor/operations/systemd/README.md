# Standalone server template

This template has not been installed or accepted on a Linux production server.
It configures one host. Executors on multiple machines need verified coordination;
independent journals do not provide a distributed lock.

## Release directories

- `/opt/psy-executor/app/`: frozen ESM source and `package.json`.
- `/opt/psy-executor/bin/market_wallet_verified`: public SD-key driver built and
  verified for this server platform, with HTTPS support enabled in the build.
- `/etc/psy-executor/`: service/vault configs, official RPCs, ABI, policy, compiler
  config and release hashes. Use absolute paths.
- `/var/lib/psy-executor/`: durable runtime, calls, broadcast journal, status and
  user-discovery hints.

A deployment administrator controls code, policies and ABI. The service account
writes only durable state. Do not copy ordinary-wallet private keys, mnemonics,
recovery files or MCP owner/session tokens; public SD-key execution needs none.

Create a dedicated `psy-executor` user, install supported Node.js, the platform's
driver and system CA trust. Do not copy macOS binaries onto Linux. Configure
`maxConcurrentExecutions` and discovery scope, verify release hashes, then run
`service.mjs ... scan` to check network, roots, fingerprint, public identity and
ABI. Enable the service only after readonly checks and small-value settlement
acceptance on that platform.

## Stop, recover and monitor

`TimeoutStopSec=1200` leaves time for an active proof to exit. Persist intent and
leaf hashes before broadcasting. After forced termination, reconcile before the
next operation. Preserve the entire runtime and original logs; never delete
pending records to resume service.

Monitor system logs and configured `statusFile`: heartbeat, checkpoint progress,
vault `halted`/`unresolved`/`read-unavailable`, last confirmed receipt and proof
time. A running process does not imply all vaults are healthy. Individual vaults
may stop and need an explicit alert/response procedure.

Back up and restore runtime once; verify confirmed work is not rebroadcast.
Measure capacity, proving resources and behavior under node failures in an
isolated environment, and record availability/alert response. The template itself
does not establish those acceptance results.
