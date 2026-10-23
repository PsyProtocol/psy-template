# Psy Executor

A chain observer and public SD-key execution service inside `psy-template`.
It discovers eligible requests for configured users, constructs an authorized
UPS, runs a proof-only preflight, revalidates chain state, submits once, and
reconciles the deterministic leaf against an included receipt.

The new [NFT Marketplace](../nft-marketplace/README.md) uses `kind: "nftmarket"`
and `profile: "nft-v3-u124"`, separate NFT/FT code and layout bindings, and
the same persistent submission and receipt recovery. Its public driver binds
ten calls rather than the existing markets' nine. Marketplace 2452 / vault
1256000 uses one-time activation before funding. Its live acceptance and the
earlier failed deployment history are documented in the [current report](../nft-marketplace/verification/2026-10-14-production-01/REPORT.md).

## U124 / NFT market submission guards

The U124 and NFT market adapters require a driver built from this release's
`amm/u124/vm-tests` sources. They invoke `guarded-preflight` and
`guarded-submit` with a persisted `guard.json`-format file. An older driver
that cannot run those actions fails before broadcasting; there is no fallback
to unguarded submission.

The guard covers the exact union of contracts called by every registered
policy branch: the market, both assets (or NFT collection and FT payment),
native PSY for fees, and the bootstrap AMM where configured. It binds the
network name, market and vault IDs, derived fingerprint and public-key hash,
and each dependency's code/layout roots and state height. The Rust driver
checks current RPC leaves and registration before proving, after verifying
the UPS, and again after the caller-anchor/nonce checks immediately before
writing a broadcast intent. It also checks the proven end user's ID.

Configured market/asset roots remain the release's explicit pins. Native PSY
roots are captured from the trusted RPC on first use and persisted under
`runtimeDirectory/bindings/<network>/<vault>/<fingerprint>.json`. A restart
with different roots fails closed. Do not delete that file to silence a root
mismatch: review the changed contract and release bindings first. A separate
runtime represents a new operator-approved baseline, not an upgrade lock.

The adapter detects changes to its ABI, policy, market config, RPC config and
asset ABI files during operation. Stop and review a new release instead of
replacing files under a running worker. These checks assume a trusted host
and RPC; they do not protect against a host administrator modifying files
between the check and use. Receipt recovery reads the exact per-attempt log
immediately as well as after restart. Old unguarded attempts may be reconciled
read-only; new proofs and broadcasts require guard verification.

These checks constrain this executor. They do not change the SD-key circuit,
authenticate RPC leaves independently, prevent an upgrade after the last
check, or constrain another executor using the public SD-key. Production
funds still require an independently verified immutable deployment or an
explicitly accepted upgrade authority, plus independent security audit.

## Reviewed driver and request evidence

U124 and NFT market configs now require `walletSha256`, the lowercase SHA256
of the reviewed standalone driver binary. Record this digest during release
review; do not automatically adopt a changed installed file. The adapter
checks the supplied digest, publishes a private, content-addressed executable
copy under `runtimeDirectory/drivers/<sha256>/market-wallet`, and executes
that copy. Replacing an install/current path cannot replace a running
worker's driver. A modified copy or changed executable permissions halts
proof/submission. The host, OS libraries, and runtime administrator remain
trusted. Scan still performs no chain mutation; initialization may publish
these local driver/binding files.

Both JavaScript and Rust check every explicit call against the selected
policy branch, including all input values and activation's pre-guard calls.
Unknown/duplicate JSON fields and a task kind inconsistent with its witness
are rejected by the JavaScript request gate. The Rust driver also explicitly
binds the UPS proof's four public inputs to the broadcast end-cap state
transition and stats, and checks its leaf hash, user ID and checkpoint.

The verification record contains `callsSha256` and `guardSha256`, calculated
from the exact bytes the driver read. These digests are recorded in the
preflight journal and checked during submission/recovery. They identify the
original request, including an optional zero fee placeholder; the driver
reports the actual fee separately after applying policy limits. Whitespace
changes also change the byte digest. Old cached proofs must be regenerated;
old pending broadcasts retain read-only reconciliation support.

These are evidence from a pinned, trusted application driver. JSON digest
reports do not independently prove an arbitrary operator's log is authentic,
add new public inputs to the protocol circuit, or certify an audit. Current
NFT acceptance requires evidence version 2, full registered-call equality,
request/guard-bound broadcast records, the reviewed driver digest, and sealed
RPC/configuration/guard files. A valid log from another operation is not
interchangeable merely because its market and fingerprint match.

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
the action and chain bindings are still current, then uses `guarded-submit`
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
records 73 passing checks and the earlier frozen `app-v2` release. The current
`app-v3` release enables HTTPS in the application driver and checks its derived
public key hash as well as fingerprint for every U124/NFT profile. Contract IDs,
fingerprints and the persistent U124 journal directory are retained. Older
binaries lacking `identity` must be upgraded before using this source version.

[Server service templates](operations/systemd/README.md) describe a dedicated
Linux runtime; they have not been installed or certified on a production host.
The [production checklist](../PRODUCTION_READINESS.md) records the remaining
security, upgrade-authority and operational gates.

### Authenticated admission and compact UPS route

Select `profile: "batch-admission-compact-v1"` explicitly. It uses the same
`executor/run.mjs CONFIG scan|once|reconcile|watch` and persistent journal as the
other routes. `scan` only proposes; `once`/`watch` may prove and submit. A public
`admissionPlan` has `{version:1, epoch, cutoff, members:[{owner, nonce:"1"}]}`,
with at most four ascending distinct owners. It is an operator discovery hint.
Every actual admission requires the owner's on-chain signed consent. The sealed
queue, including every accepted member, defines settlement scope thereafter.
The plan is fixed for one epoch. After it is terminal, start a worker with a
distinct immutable next-epoch plan/config, preserving the same vault journal;
overwriting a live plan is rejected. Automatic next-plan generation is not
provided by this profile.

Required pins: ABI, driver config, policy, all dependency roots/counts/whitelist,
registered public key/fingerprint, reviewed binary SHA256, explicit testnet
profile and immutable RPC config. `proverThreads` defaults to two. The reviewed
compact driver must support `preflight` and `broadcast-prepared`; its manifest
is journal-bound. Broadcasting verifies the saved whole proof and fresh state
without proving a replacement. Unknown broadcasts block the vault until exact
historical receipt reconciliation. Share one runtime directory for workers on
the same host; this is not a distributed lease for independent hosts.

The finite queue is not global market inclusion. Explicit `users` hints can
also discover enrolled, inactive sender recovery; active orders outside the
accepted set are never selected for settlement. Missing gas sponsorship is a
blocked proposal, not permission to take another user's fees. Old routes and
old deployments are not silently migrated. See the
[production candidate review](../docs/security/MARKET_BATCH_PRODUCTION_CANDIDATE_20261021.md)
for tested versions, evidence, and remaining gates.

#### User exit and operator recovery for admission candidates

Use the reviewed ABI/policy and exact current contract/vault IDs. These steps
apply to the fresh consent-lock candidate, not silently to older deployments.

1. Before signing `request_admission`, an owner may sign `request_cancel`,
   `release_unaccepted`, and `request_recovery(vault)`. Release changes that
   owner's order only; it does not move money from the shared vault. The public
   SD-key recovery subsequently claims the owner's exact pending deposit and
   sends it back to the same owner. An unfunded order authorizes no withdrawal.
2. After admission consent, historical nonmembership or a missing index entry
   is insufficient to release. The matching epoch must be terminal (or a later
   monotonic epoch authenticated). An omitted owner can run a reviewed public
   Executor to abort an empty expired epoch, or finish the already accepted
   scope. At most four accepted members define that scope, not every user who
   wanted service. No further owner signature is needed to execute a valid
   public SD-key action; exact authorized gas sponsorship is still required.
3. An already frozen batch must settle its frozen terms or expire and refreeze
   the same accepted set. Cancellation after freezing is considered by the
   refreeze; it cannot rewrite the pending commitment. Use `scan` to inspect the
   proposed operation and its checkpoint bounds before `once` can send it.
4. After terminal epoch evidence, the omitted owner signs release and recovery
   enrollment. Put only that owner's ID in the explicit `users` recovery hints.
   `scan` either proposes exact sender-bound `recover_funding` / `recover_nft`,
   or reports missing authorization/gas/backpressure. It cannot charge arbitrary
   unrelated users. The owner finally claims FT/native outboxes and NFT FIFO
   delivery using an ordinary wallet. An NFT delivery queue must be drained by
   its recipient; increasing or bypassing its limit is not a recovery procedure.
5. On restart, run `node executor/run.mjs CONFIG reconcile` before new work.
   An unknown transmission blocks the vault until exact historical receipt
   reconciliation. A timeout, absent log or newer scan is not permission to
   delete journal events or resend a replacement. Preserve the prepared UPS,
   child intent, raw response, expected end leaf and indexed receipt.

This path needs a working prover, RPC access, gas and chain progress. It offers
neither free nor unconditional service, and no proof that an operator admitted
all requests. The immutable selected plan does not prove fairness before entry.
Source-checkpoint ordering is not authenticated wall-clock arrival ordering.

The current NFT activation additionally requires an activation payer who holds
an NFT in the configured collection; acknowledgement alone gives no ownership.
Use an existing holder's authorized seed funding. Unused deposits from another
sender remain that sender's recoverable money. When a vault is short of gas,
standalone `fund_gas` and the following recovery are two UPSs: the scanner
requires two fee budgets and reports existing pending funds plus the additional
amount separately. Inspect partial/overfunding rather than sending the total
again. Single-UPS admission maintenance still requires one budget.

#### Controlled-source proof calibration

The acceptance driver v3 supports `PSY_MARKET_BENCH_SOURCE_CHECKPOINT` only
for standalone **preflight**, to reproduce the normal warm proof's authenticated
source checkpoint before either proof is sent. `commit_batch` writes that
checkpoint, so equal arguments alone do not imply equal resulting state.
Calibration requires a materialized account, unchanged current own anchor,
matching key/nonce, valid checkpoint/registration, a fresh UPS-start and all
normal whole-proof, stack/session, fee and endpoint validation. The paired
acceptance compares the complete new user leaf and start/end hashes as well.

Normal workers strip this selector. The reviewed broadcast command rejects
artifacts marked `benchmarkSourceCheckpoint`; acceptance sends only the normal
prepared proof. This is an application guard, not a separate protocol/key
domain: fingerprints are unchanged and a trusted operator must preserve the
read-only separation. Source-setup time is reported, and one ordered warm/cold
pair is neither a latency SLO nor evidence of network TPS. See the review's
frozen manifests for the binary used by each stage; retain prior binaries and
never overwrite original preflights to add a calibration marker.

### Verify archived acceptance files

From the repository root, without a wallet or RPC connection:

```sh
python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-21-compact-candidate-v1/four-fresh-activations-v1
python3 executor/acceptance/test_verifyCompactArchive.py
```

If the original run is locally available, add
`--original-base /tmp/psy-market-candidate-live-20261021-v3` to compare each
decompressed file with its original bytes. The verifier is read-only and
rejects changed compressed/raw bytes, missing/unlisted/duplicate files, unsafe
paths and symlinks. It checks artifact integrity only; the separate pinned
full-UPS verifier, receipt checks and external release gates remain necessary.

### Optional single-cycle operator intent pin

`node executor/run.mjs executor.json once --expected-task reviewed-task.json`
performs the usual fresh scan, then compares every selected action field and
exact submission bytes with the reviewed task **before** proving/transmission.
Only a non-regressing local send window may differ. The file cannot supply an
action, bypass state/session/fee checks, or turn an idle scan into execution.
An interrupted/unknown attempt still requires journal reconciliation.

Explicit saved-proof recovery: `node executor/run.mjs executor.json resume
--task previously-planned-task.json`. The task must exactly match a durable
planned task with a saved proof in this vault's journal. Receipt reconciliation
runs first; an unknown transmission blocks it. It rechecks normal live state,
identity, dependencies, proof digest, full stack/session, fees and original
window. It never generates a replacement proof or advances that window.
An already included task returns idempotently without another transmission.

Recovery requests exactly two FEE_ESCROW units from the named Sponsor, matching
existing contract authorization. Each grant requires the exact amount, purpose,
nonce and pending cursor; mismatches stop for inspection. `recoveryGasUnits`
is rejected. Replenishment requires a new explicit Sponsor UPS after exhausting
the existing grant. Per-UPS fee caps and complete proof checks are unchanged.
This is not a gas-free or unconditional liveness guarantee.


## Opt-in four-member compact admission candidate

`admissionMode: "all-four-v1"` requires a freshly bound bulk policy and a newly
registered key/vault; existing single-admission policies are rejected in this
mode. Late binding:

    node batching/admission/build.mjs bind --build FROZEN_BUILD --market-id NEW_ID --admission-mode all-four-v1 --out FRESH_BOUND

The formal route waits for all four matching consents in its explicit plan,
then proposes one seven-call UPS. Every contract admission still checks its
owner, nonce, signed epoch/cutoff and terms. A partial queue uses the existing
single-entry operation. This mode does not promise global inclusion or hide
executor refusal; fixed-set timeout/recovery paths remain required.

All four synthetic complete UPSs and compact signature mutation gates passed.
Fresh live registration, maximum economic execution, ordinary claims and the
remaining network matrix are not yet accepted. See the latest production
candidate ledger and `bulk-four-full-ups-v1` / `bulk-four-signature-mutations-v1`.

### Optional phase observations

A compact admission configuration may set `"performanceMetrics": true`.
The **formal factory** then writes immutable per-operation observations under
`runtimeDirectory/performance/<network>/<vault>/`: scan, reconcile, current-state
and proof validation, proving, preparation and saved-proof submission. Existing
registration/root/nonce/window/stack/end-cap guards are unchanged. Watch mode
already keeps one pinned resident prover per adapter; each request still creates
fresh transaction state. A cached proof is reused only after journal validation.

Parent Node RSS/heap endpoints are **not** child peak memory. Darwin timed full
UPS comparison supports `PSY_PROFILE_RESOURCE_TIME=1`, records process peak RSS
(bytes), and verifies unchanged final state and fees across fixed40/compact.
No per-phase child RSS or network TPS may be inferred from those peaks. Absent
historical memory stays absent. Telemetry has no witness/call payloads and cannot
replace a financial result or cause another submit if disk logging fails;
`adapter.metricFailures` reports observation loss. Observation retention and disk
capacity are operator responsibilities; do not use missing metrics as zeros.

The compact formal factory also records `initialize` separately (ABI/policy,
dependency reads, sealed binary and key identity). It excludes the lazy
resident's circuit/session construction, which remains in first-proof startup.
`rpc-performance/<network>/<vault>/` contains opt-in physical read attempts:
queue wait, HTTP + response parsing, host, method and failure. Coalesced reads
produce one sample; retry attempts remain separate. No parameters, witnesses,
raw errors or URL credentials are logged. These intervals nest in adapter phase
walls; do not add them to those walls. They exclude receipt-service reads,
Rust SDK reads, proving and submission transport. A telemetry write failure
does not retry a successful read or alter a financial outcome.

### Persistent execution directories

Production CLI `once`, `watch`, `resume` and service CLI execution reject OS
temporary runtime paths, including symlinks to them, before adapter/RPC startup.
Use a persistent location for journals, proofs, exact requests and broadcasts.
The guard checks location, not filesystem durability, backups or multi-host
coordination. Direct embedding APIs still require persistent storage from the
host. Read-only scan/reconcile remain available for recovery inventory.
If original artifacts are missing, do not create replacement payments from chat
history. Current RPC state cannot reconstruct original signed requests, fee
receipts or lost ordinary QA wallet keys.

### Opt-in pre-admission bulk fallback

For `admissionMode:"all-four-v1"`, `bulkFallbackRemainingCheckpoints` (1..64)
may opt into existing single-entry authorization when an empty open queue is
within that many checkpoints of cutoff and only some of the four **explicit
plan hints** have matching authenticated consent. Four eligible hints still use
one bulk operation. Once any member is accepted, subsequent scans use the
existing single-entry route, and seal/commit must process the entire accepted
set. No accepted/frozen set is shrunk, and capacity remains four. Default is the
previous wait-for-all-four behavior. More single UPSs can cost more sponsor gas;
scans request explicit authorization, never auto-pay. This is source-checkpoint
scheduling, not a guaranteed actual-inclusion deadline or global fairness.
