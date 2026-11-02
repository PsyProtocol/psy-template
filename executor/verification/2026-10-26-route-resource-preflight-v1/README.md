# Two-pool resource experiment: preparation only

**No new financial execution.** Four fresh common-checkpoint readiness attempts
exhausted bounded read retries with HTTP 503. Latest: 2026-10-26
03:50:22.295–03:50:40.854 UTC. No deployment, registration, setup transfer, new
intent funding, route fill or claim was performed. `PREPARED-READY-v1.json`
does not exist. Do not describe this archive as live acceptance or performance.

## Predeclared finite experiment

Two sequential rounds, baseline then candidate, each 28 actual UPSs, two AMM
fills and one final ordinary-wallet claim. Maximum 6 hours/round, 12 hours for
the pair; 35.0035 test PSY network-fee ceiling/round. The separately planned
40 test PSY U→Sponsor setup transfer **has not occurred** and is not fee burn.
QA FT 2483/2484 have 18 decimals; test PSY 0 has 9. No existing pUSDT is used.
Both cases have a new local unfunded publisher, not a registered controller.

Both variants retain the same SDK and selected native binaries, resident
ordinary signers, deterministic ordering, one admitted member per hop and
128-checkpoint cutoff leads. Only the candidate overlaps immutable controller
resource construction with the ordinary original funding request. That overlap
is opt-in; it is not an accepted acceleration or memory improvement.

Actual underlying stages remain separate confirmations: owner funding →
controller claim → pool order/admission → batch commit → settlement →
controller intermediate claim → second pool → final return → ordinary claim.
An Outbox is never spendable before its claim. Shared Sponsor and vault state
stay serial. Both in-flight funding/warmup tasks drain on either failure; a
successful funding is real even when warmup fails. No replacement payment.

Same pools and input volume do not imply identical reserves, nonces, quotes,
network scheduling or economic outputs across sequential rounds. The original
plans' `baselineCommit=ef57e457` denotes a reference base, not the uncommitted
harness runtime identity; [SOURCE-PROVENANCE-v1.json](SOURCE-PROVENANCE-v1.json)
clarifies without changing those originals. `review-*` source snapshots are
review inputs, not evidence that a financial worker executed them. The actual
runner freezes separate execution closures before any financial work.

## Implemented gates

- Prepared pair binds plans, native releases, network, SDK, fresh distinct
  controller/key/vault, source/artifact/policy, registry and setup records.
  An arbitrary ready flag, replaced observer binary or network is rejected.
- Preparation CLI is read-only and requires already confirmed controller setup,
  no spendable controller assets, an unstarted controller, fully consumed old
  sponsorship and already claimed Sponsor funds. Every actual transaction
  still rechecks live identities, dependencies, nonce, fees and state endpoints.
- One exclusive finite pair runner owns samplers and sequential financial jobs.
  It starts full-process-tree observation first and independently audits every
  exact full UPS, receipt/stat/fee endpoint, nonce/root chain, conservation and
  ordinary claim before the next round. Unknown results stop, never resend.
- Shared ordinary and market resources stay pinned and explicitly close after
  the round; only immutable resources persist between jobs. New witnesses,
  nonce, fees and signature context remain per-job. Existing grants cannot be
  overwritten by another sponsorship payment.

## Local evidence and limits

Latest focused regressions: 58 passed. Integrated Executor/composition suite:
342 passed, no failures or skips. These counts overlap; do not add them or call
them native proof/network acceptance. Failed clock test and subsequent fix remain
here; the earlier warmup failure remains in the [prior archive](../2026-10-26-scan-scheduling-review-v1/README.md).
JS syntax checks passed for 17 changed
files. Existing SDK manifest and all 1,466 SDK/72 frozen app source hashes,
configuration, selected ordinary/market binaries and pre-existing Node diff
hash were checked unchanged.

[manifest.json](manifest.json) contains 420 exact records (1,729,079 raw bytes):
all four readiness failures, available original stderr logs, public plans and
release pins, review source closures and local regression logs. The first
failure is explicitly a tool-output summary, not fabricated raw stderr.
All original records were compared byte-for-byte. [PRIVACY-CHECK.json](PRIVACY-CHECK.json)
scanned all 448 records across this and the compilation archive against the
actual local QA private values; zero matches. Wallets/binaries are excluded.

## Resume in order

After a fresh read-only preflight succeeds, separately complete and confirm new
controller/key registration and the explicit original setup transfer/claim.
Any unknown original setup result must be reconciled before proceeding. Then:

```sh
node composition/acceptance/prepareMeasuredRoutePair.mjs PAIR COMPOSITION_RELEASE TOOL_RELEASE vN
node composition/acceptance/runMeasuredRoutePair.mjs PAIR COMPOSITION_RELEASE TOOL_RELEASE PINNED_UPS_VERIFIER
```

Use existing absolute paths and the frozen staging profile, never new dependencies
or experimental compilation outputs. `vN` must be unused. The first command
does not perform the preceding setup. No performance report is issued until
both full audits, lifecycle samples, actual fees and terminal claims close.
Missing stage measurements stay null; nested/parallel phase walls are not added.

Continuous local financial soak/fault acceptance and Book→AMM extension remain
pending their preceding gates. No cross-machine, cross-vault atomicity, global
fairness, throughput, memory-reduction or production-readiness claim follows.
