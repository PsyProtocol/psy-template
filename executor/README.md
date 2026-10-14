# Psy Executor

A chain observer and public SD-key execution service inside `psy-template`.
It discovers eligible requests for configured users, constructs an authorized
UPS, runs a proof-only preflight, revalidates chain state, submits once, and
reconciles the deterministic leaf against an included receipt.

The new [NFT Marketplace](../nft-marketplace/README.md) uses `kind: "nftmarket"`
and `profile: "nft-v3-u124"`, separate NFT/FT code and layout bindings, and
the same persistent submission and receipt recovery. Its public driver binds
ten calls rather than the existing markets' nine. No NFT market has been added
to the installed staging service. Test Marketplace 2451 / vault 1755712 are
deployed/registered; authenticated listing proof failures leave live acceptance
incomplete. See the [test report](../nft-marketplace/verification/2026-10-14-continuation-01/REPORT.md).

## Run

Configure [examples/service.json](examples/service.json) and its three vault
configs. The examples pin the existing staging deployments: AMM 1758 / vault
499200, Orderbook 64 / vault 591872, and Curve 66 / vault 1297920 / token 1494.
The curve is already graduated. Replace `/opt/psy-executor/rpc-config.json`
and the public driver binary paths with your installed paths. Contract IDs,
roots, public-key hash and fingerprint must describe the intended deployment.

```sh
npm run test:executor
npm run executor:service -- executor/examples/service.json scan
npm run executor:service -- executor/examples/service.json watch
npm run executor:service -- executor/examples/service.json status
```

The default mode is `scan`, which is read-only and never opens a transaction
journal or calls the submit driver. `once` reconciles and processes at most one
eligible task per vault. `watch` runs continuously. SIGINT/SIGTERM stop queued
work immediately without waiting for an active proof to release its slot,
interrupt polling waits, and allow already executing UPS tasks to finish.
The public driver timeout is 15 minutes; process managers should allow enough
shutdown time for that task to finish.

Single-vault commands remain available:

```sh
node executor/run.mjs /absolute/path/to/vault.json scan
node executor/run.mjs /absolute/path/to/vault.json once
node executor/run.mjs /absolute/path/to/vault.json watch
node executor/run.mjs /absolute/path/to/vault.json reconcile
```

## Markets

| Kind | Automated public actions |
| --- | --- |
| `amm` | PSY/pUSDT swaps, LP add/remove, swap refunds, partial LP-funding refunds, funded withdrawal cancellation |
| `orderbook` | Exact full-order matching, expired PSY/pUSDT refunds |
| `bondingcurve` | Buy/sell settlement; stale, invalid, expired or post-graduation request refunds; optional initialization and graduation |
| `launchamm` | Launch-token swaps, LP operations and refunds; graduation seeding when configured |

User wallets sign the intent and payment. The service does not claim outputs
or close intents on behalf of ordinary wallets; users finish those steps with
the existing wallet/SDK methods. Quote-invalid curve refunds preserve the
original funded amount rather than attempting to recalculate an executable
price. Initialization and graduation each require an explicit configuration
switch; the driver configuration fixes the issuer, inventory and successor.

## Configuration

Service fields:

- `vaults`: paths to vault configs, relative to the service config file.
- `maxConcurrentExecutions`: simultaneous proof/submission jobs across vaults;
  default 1. Scans run independently. Each vault remains serial.
- `maxBackoffMs`: transport/busy retry limit; default 300000.
- `statusFile`: optional JSON status snapshot, relative to the service config.

Vault fields include `kind`, `network`, `contractId`, `vaultId`, `publicKeyHash`,
`fingerprint`, `codeRoot`, `layoutRoot`, `rpcConfig`, `wallet`, `abi`, `users`,
`runtimeDirectory`, optional `name`, and `intervalMs` (1000..3600000).
File paths resolve relative to the vault config. Config validation rejects
unknown fields and ordinary wallet credential fields.

`receiptMaxPages` bounds historical receipt lookup (default 20, range 1..100).
Each page contains at most 100 events. The reader follows the services API's
`offset` pagination, stops at the final page, and deduplicates overlapping rows
and historical leaf reads. Reaching the bound or a non-advancing page keeps the
broadcast unresolved. Increase the bound or reconcile manually when necessary;
the absence of an indexed receipt is never evidence that a broadcast failed.

`bondingcurve` also requires `driverConfig`, the same camelCase launch JSON
used by `curve_wallet`. `automaticInitialize` and `automaticGraduation` are
false by default. The reader compares initialized chain parameters with that
configuration at one checkpoint.

`launchamm` additionally requires `pool` (matching the vault and contract),
`driverConfig`, and optionally `launch` for automatic seeding after graduation
and issuer fee funding. Preserve the existing launch pool configuration format.

`usersFile` optionally supplies a JSON array of user IDs, reloaded each cycle.
It overrides `users`, is bounded to 10000 entries and is sorted/deduplicated.
Update it by replacing a complete JSON file atomically. These IDs are scan
hints; all intents and payments are read from chain state and checked by the
contract and fingerprint. Global chain indexing is a later network stage.

State scans use four user readers at a time and a process-wide limit of four
in-flight state RPCs, shared across snapshots and vaults. Multi-field and
cursor reads run concurrently behind that limit. Leaf promises are coalesced
only within one snapshot, keyed by user/contract/leaf at its fixed checkpoint;
each new scan and execution revalidation reads a fresh snapshot. User results
retain their configured order, preserving planner priority. A failed scan
drains in-flight reads, schedules no more users and produces no partial plan.

Run `node executor/benchmarks/scan.mjs .` from this checkout for the controlled
100-user comparison fixture. The benchmark uses the existing local staging
ABI/config files and simulated RPC latency; it never contacts the chain.

## Recovery and concurrency

All executors for a vault on one machine must share `runtimeDirectory`.
Exclusive locks cover receipt reconciliation and the entire proof/submission
job. Lock records identify host and PID. A new executor recovers a lock only
when its same-host owner is conclusively dead; PID reuse, foreign hosts,
legacy records and unreadable records remain blocked for operator inspection.
The short `executor.acquire` gate prevents concurrent recoverers from deleting
a newly acquired lock. An interrupted gate also requires operator inspection.
Do not remove locks while any executor for that vault is running.

A durable journal records the task and broadcast intent before submission.
Historical reads share a limit of 32 open journal reads across all vaults in
the service and load records in batches. Each execution or reconciliation
reads one fresh snapshot under the vault lock; it does not keep a stale cache
across operators or restarts. Numbered events must be contiguous and unique.
A missing or duplicated sequence stops execution for inspection. Do not prune
or rename journal events; supported history compaction is not implemented.
Public call files live under `runtimeDirectory/calls/` and are checked against
the task before reuse and submission. A missing preflight file is regenerated
before another broadcast intent. The driver rebuilds its submission proof
against current chain state; the cached file is not a serialized proof.

Journal events and public call files are written and synced in a unique
temporary file, then published without replacing an existing destination.
The parent directory is synced after publication. An interrupted write leaves
an unreferenced `*.tmp`, which readers ignore; it cannot block creation of the
complete call file on restart. Inspect and remove orphan temporary files only
while the corresponding executors are stopped. Existing malformed final files
remain blocked for inspection rather than being silently overwritten.

Submission stdout/stderr is written directly into an exclusive
`*.submission.log`. The child retains those file descriptors if its parent
exits. On restart, the adapter can recover a leaf from that log even if the
parent never wrote `broadcast-result`. It still requires the historical user
leaf and matching included content-hash receipt before clearing the task.

An unknown broadcast pauses that vault. Timeout, a missing indexer receipt,
or a missing leaf never authorizes rebroadcast. Other vaults continue. If no
leaf was ever persisted, operator reconciliation is required. Completed tasks
return `already-included`; proof and submit callbacks are not invoked.

Transport reads and proof-only preflights have bounded retries. Watch mode
backs off after exhausted read retries or lock contention. Stale tasks are
rescanned. Identity, ABI/config or deterministic proof failures halt that
worker and remain visible in status while other workers continue.

## Operations

### U124 markets

Set `profile: "u124"` for the AMM, Orderbook and Bonding Curve profiles that
trade two non-genesis U124 Token contracts. Bind each asset with `contractId`,
`codeRoot`, `layoutRoot` and its `abi` path, and provide the market's `policy`
and `driverConfig` paths. State and call amounts remain BigInts and use
`low + high * 2^62`; submission files contain lossless JSON integer literals.
Native PSY remains the existing gas asset.

The U124 adapter independently verifies a proof-only preflight, checks that
the action and chain bindings are still current, then uses `verified-submit`
to verify the exact submitted UPS. Every attempt gets its own durable driver
log; its path is stored in the submission intent. A lost response is recovered
by the deterministic leaf hash. Only an explicit driver rejection that occurred
before a broadcast can release an attempt for a later rescan, including a
terminal rejection preserved by a child after its parent exits. Partial logs
and missing identities stay unresolved. Recovery checks the market, vault,
fingerprint, bounded fee and equality of verified/broadcast leaf hashes;
submission log paths must match the exact task and attempt UUID. Detailed
driver rejection reasons are preserved in the journal.

Token ABIs must match the actual two-limb balance, sent/claimed offsets,
outbox stride and claim/transfer wire signatures before any chain read or
proof driver starts. Each realm head and all public state identifiers/slot
offsets are validated before use.

Curve configurations can bind a predeployed AMM and a distinct fee donor with
`bootstrap`. Graduation transfers the remaining inventory and quote reserve,
sends one fee escrow, and opens a fixed AMM seed order in the same UPS. Include
the Curve vault in the AMM worker's `users` list so it discovers that order.
The AMM contract/vault must already exist. The seed LP belongs to the Curve
vault and is permanently locked by its current fingerprint, which exposes no
LP withdrawal operation. Both graduation fee cursors advance with the claims.

The 2026-10-13 staging evidence under `verification/2026-10-13-u124-01` and
`verification/2026-10-13-bootstrap-01` separates live results from offline
checks. Deployment and acceptance scripts use exclusive evidence files;
reconcile an existing intent before attempting another mutation.

Structured JSON events identify the network/vault and execution phase.
`statusFile` records each worker's phase, completed count, last outcome and
last error. `checkpoint` and `lastIncluded` describe its most recent confirmed
inclusion; `observedCheckpoint` records the latest scan without overwriting
that inclusion. Recovery confirmations are recorded before the next scan, so
a later read failure does not hide an already confirmed receipt. The included
count deduplicates task IDs within this service run; it is not a lifetime total.
Its top-level `updatedAt` refreshes every 10 seconds in
watch mode; per-worker `updatedAt` is the most recent phase transition. A
`stopped` worker retains its last outcome, including unresolved broadcasts.
The status command reads the file; it does not contact the chain or submit.

Use approved public SD-key drivers whose locally computed fingerprint matches
the registered vault. RPC and registration identities are checked at startup
and immediately before/after proving. Ordinary wallet keys and recovery paths
are not configuration inputs. The runtime directory contains public call
stacks, transaction logs and receipt journals and should persist across restarts.

Distributed leases, global discovery, cross-machine competition and operator
incentives remain network milestones. The legacy orderbook matcher has a
separate ledger; reconcile any outstanding attempts before switching runners.
Orderbook partial fills require a separate contract and fee design.

## Installed staging instance

The current Mac has a persistent login service. See
[operations/staging-2026-10-11/OPERATIONS.md](operations/staging-2026-10-11/OPERATIONS.md)
for its frozen configuration, launchd commands, availability and recovery
instructions. Keep its runtime journal when restarting or moving the service.

`acceptance/live.mjs` is the authorized, one-time PSY/pUSDT acceptance conductor
for this instance. It uses the installed MCP wallet for Alice, Bob and Charlie,
and observes public settlements performed by the service. It includes a
controlled service crash. Evidence files are exclusive; do not rerun it over
existing evidence or an unresolved transaction. It does not deploy contracts
or change wallet policies. `acceptance/verify.mjs` checks completed evidence,
release hashes, receipt identities, asset conservation and historical evidence
before producing a separate verification snapshot.

The [2026-10-11 live acceptance report](verification/2026-10-11-live/REPORT.md)
records 38 included transactions, AMM/Orderbook settlements and refunds,
recovery after a controlled service crash, and per-user asset reconciliation.
It also documents the HTTP 500 read-recovery fix and the graduated Curve
instance's scan-only coverage.

The [scan optimization report](verification/2026-10-11-scan/REPORT.md) records
the revision 3 upgrade, 100-user measurements, historical-state parity checks
and 136 passing regression tests. The active service uses bounded concurrent
state reads while retaining the previous submission journal and bindings.

### Installed U124 staging instance

The separate `xyz.psy.executor.u124.staging` login service handles contracts
2443, 2444 and 2446 using custom 18-decimal Token assets 2441/2442 and Native
PSY gas. See [its operations guide](operations/staging-u124-2026-10-13/OPERATIONS.md)
and the [2026-10-14 live report](verification/2026-10-14-resume-01/REPORT.md).
All three compound claim/close paths and a two-process proof-owner crash
recovery passed on chain. The concurrency scope is one machine with a shared
journal; independent external audit and distributed leases remain open.

The [2026-10-14 hardening report](verification/2026-10-14-hardening-02/REPORT.md)
records 73 passing checks, historical log compatibility and the active frozen
`app-v2` release. The driver, chain contracts, fingerprints and persistent
journal directory are unchanged by that release.
