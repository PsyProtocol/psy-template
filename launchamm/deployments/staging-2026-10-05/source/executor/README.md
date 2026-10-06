# Public SD-key executor prototype

```sh
node executor/run.mjs /absolute/path/to/config.json scan
node executor/run.mjs /absolute/path/to/config.json once
node executor/run.mjs /absolute/path/to/config.json watch
node executor/run.mjs /absolute/path/to/config.json reconcile
```

`scan` is read-only. `once` executes one eligible task. `watch` continuously
scans explicitly configured users, serializes each vault and reconciles prior
broadcasts before making another submission. SIGINT/SIGTERM stop between tasks.
The service uses only the intentionally public SD-key wallet drivers.

Config includes `kind` (`launchamm` or `orderbook`), `network`, `contractId`,
`vaultId`, `publicKeyHash`, `fingerprint`, `codeRoot`, `layoutRoot`, `rpcConfig`,
`wallet`, `abi`, `users`, and `runtimeDirectory`. Orderbook also needs `cli`.
Launch AMM also needs `pool` (the fixed pool config), `driverConfig`, and may
include `launch` to automatically seed after graduation and issuer fee funding.
Do not put ordinary wallet keys or recovery paths into this configuration.

The adapter checks deployed roots, registration and the locally rebuilt policy
fingerprint. A task is checked before and after proving. Durable journal files
record the task and broadcast intent before submission. A returned leaf is
matched to a historical user leaf and an included content-hash receipt. A
timeout or absent indexer record leaves the task unresolved and blocks the
vault. The next run reconciles recorded outcomes; it never assumes that a lost
response means the transaction failed.

Public RPC and Orderbook CLI reads retry explicit transport failures at most
three times. Proof-only driver preflights also retry explicit network read
failures before any signing. The watch loop waits and rescans after exhausted retries;
submission never uses this retry helper. State fields are fetched in groups
of at most four reads at the same checkpoint.
When revalidation selects a different task or finds the original task stale,
watch mode skips its broadcast and scans again instead of exiting.

The `proved` journal record retains the proof-only preflight's call file and
driver arguments. Restarting can reuse that preflight after revalidation.
The submission driver still builds its proof against current chain state;
this record is not a serialized submission proof.

One shared runtime directory coordinates processes on one machine. Separate
machines rely on chain guards, nonces and claim cursors. Distributed leases,
user discovery and incentive economics remain later network stages. A crash
can leave `executor.lock`; an operator must verify that its PID is no longer
running before removing it, then run `reconcile`. If the process died before
recording the deterministic leaf, operator reconciliation is required. The
service deliberately stops rather than guessing whether it can rebroadcast.

The old orderbook runner's ledger is separate. Do not switch to this runner
while that ledger has an unresolved attempt. The current orderbook supports
full matching; partial fills are not implemented.
