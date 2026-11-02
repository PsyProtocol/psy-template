# RPC recovery follow-up, 2026-10-26

**Not recovered; zero new financial operations.** The original full fresh
preflight v5 failed at common-checkpoint acquisition with HTTP 503, from
06:22:30.340 to 06:22:48.829 UTC. Existing pair plans, budgets, assets, SDK,
selected native binaries and original evidence remain unchanged. No controller
deployment/registration, setup funding, settlement or wallet claim started.

Three separately predeclared diagnostic rounds queried only the existing
configured realm0/realm1 head methods and coordinator contract-leaf read for
owned QA pool 2485. These are reads, not old-contract upgrades or financial
compatibility probes. Each endpoint gets one explicit fetch per round, no
application retry or followed redirect. This is not evidence about physical
TCP connection attempts or RPC-internal work.

| Round UTC | realm0 | realm1 | coordinator |
| --- | --- | --- | --- |
| 06:25:40.616–06:25:49.638 | HTTP 503 | HTTP 503 | HTTP 503 |
| 06:27:13.240–06:27:17.176 | HTTP 503 | HTTP 503 | HTTP 503 |
| 06:28:31.811–06:28:36.869 | transport error | transport error | HTTP 503 |

The seven HTTP responses had `Server: Caddy` and empty bodies. Two other reads
failed with `TypeError: fetch failed`; their HTTP status is null, not a timeout
or a claimed server rejection. We cannot infer a Node crash, actual backend
version or operational root cause from this. The 92.624/78.571 second round
spacing meets the declared 60-second minimum. These intervals and read timings
are not settlement performance, confirmation time, proving cost or throughput.

The [read-only diagnostic](../../acceptance/networkReadinessProbe.mjs) records
exact requests, bounded raw bodies, status, selected non-credential headers,
config hash and per-endpoint outcomes. Even an all-readable result has
`financialAuthorization=false`. Only the original complete fresh preflight,
and then all original transaction guards, can permit further financial work.
Unsupported methods, extra parameters, URL credentials, malformed envelopes,
RPC errors, redirects, oversized responses and transport failure cannot pass.
No wallets or signing keys are loaded by the diagnostic.

Four local diagnostic regressions passed. An additional post-measurement
hardening validates endpoint roles/IDs before constructing output filenames or
performing any request. The three actual rounds used the preserved
`diagnostic-v1` source closure; current code and its four passing regressions
are separately archived in [tool-hardening-v2](tool-hardening-v2/manifest.json).
Do not pretend the later code produced earlier observations. No repeated live
probe was used to select a more favorable result.

[manifest.json](manifest.json) contains 151 original records, including v5 full
preflight failure/source closure, all nine diagnostic requests/raw responses,
plans, outcomes, local tests and integrity records. [The 11-record hardening
archive](tool-hardening-v2/manifest.json) is separate. Both were compared against
their exact original bytes. No wallet, private key, recovery file or executable
is included. Local SDK source hashes (1,466), frozen configuration, selected
native binaries and pre-existing Node diff hash were checked unchanged.

An active **thread heartbeat every 15 minutes** continues this authorized task.
Unchanged outages stay quiet. It must check existing process ownership and
original requests before doing anything; no overlapping financial worker,
unknown-broadcast replacement, SDK switch or new branch. Recovery must pass
fresh gates before the existing finite/budgeted pair. Only after full double
route proof/receipt/conservation/claim and performance closure may it proceed
to continuous local fault acceptance, then the independent Book→AMM path.
Notifications are limited to recovery, closed milestones, new actionable
blockers or decisions. No new live performance or production conclusion.

```sh
python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-26-rpc-recovery-followup-v1
python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-26-rpc-recovery-followup-v1/tool-hardening-v2
```
