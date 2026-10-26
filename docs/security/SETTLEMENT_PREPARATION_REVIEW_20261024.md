# Settlement preparation review — 2026-10-24

Later [memory](PROVER_MEMORY_REVIEW_20261025.md),
[RPC/ordinary pair](RPC_ORDINARY_PERFORMANCE_REVIEW_20261025.md) and
[three-market live](THREE_MARKET_LIVE_PERFORMANCE_20261025.md) evidence supersede
historical pending states. Warm/client gains do not establish overall acceleration.

## Result and identity

Fee preparation/independent reads are integrated in formal adapters. Two actual
one-fill AMM batches, full two-pool route and ordinary claim completed; controller
phase 99 with zero FT/native balances. Six warm fee stages total **672.75→376.21 s,
44.08% reduction**, same machine/dependencies. No old network confirmation control:
not whole-route speedup, chain TPS or production readiness. Shared four-market
regressions are not actual performance acceptance for every market.

- Same branch; pre-optimization `efe3c9fad1605f23a8177ec3d0ea71826badb9cd`,1137hashed files.
- SDK manifest 0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425:
  1466 sources/four execution-verification binaries unchanged. Upstream migration separate.
- Original Node diff 002e35e0b13cb6c422fe3abf500ce6aa5241229264d85a3314f22b5e14b59a64
  unchanged; no old code/layout upgrade.
- Controller2495/key1092800 realm 1; ordinary1717440; Sponsor 406720.
- New orders/epochs in existing owned QA pools2485/vault 1012928,2486/vault 718016
  realm 0, not compatibility probing by update.
- QA FT-A2483/B2484:18 dec; test PSY 9 dec fees, no pUSDT.

## Changes and constraints

1. Advisory fee traces reduce two→one. Actual fee/modified slots/full stack/session/
   nonce/endpoints still pass full UPS/sealed driver. Mismatch stops; no automatic
   higher price or replacement payment.
2. Append-only advisory binds task/traceSHA/driver/SDK/intent. renewFeePreparation
   may renew an unsigned transport window only with identical business/calls and
   current eligibility. New tasks rebuild witness/proof; old guards/signatures/
   proofs do not receive new expiry. Unknown broadcast blocks new business.
3. Same-snapshot bounded independent dependency/key/metadata/controller reads.
   No balance/authority/nonce/proof cache across snapshots. Remove adjacent
   current() after successful isCurrent, retaining eligibility/final driver checks.
4. Compact adapters overlap registration/dependencies and exact-proof leaf/nonce/hash
   reads; failures drain all in-flight siblings.
5. Window selection only before freeze, capacity4. First128 checkpoints unchanged;
   second96 selected before start, historical replay verified. Readonly selection
   success does not establish universal adaptive routes or tail guarantees.
6. Observation failures cannot affect finance/resend. Stage RSS selects owned child
   processes, not unrelated wallets.

## Same-condition methodology

arm64 Mac/10 logical CPUs/32 GiB, RAYON_NUM_THREADS=2, same SDK/binaries/policies/
exact calls/start leaf/nonce. Fee ABBA shares resident resources but new sessions.
Network varies; small sample/no confidence interval/independent causal attribution.
44.08% is joint trace/read scheduling observation. Only candidate broadcasts.
First-open control proves an authenticated historical source; later baseline
reverifies the candidate's exact proof rather than duplicating generation. Those
verification times are not old proof-generation costs.

| Warm operation | Before s | After s | Application RPC before/after |
| --- | ---: | ---: | ---: |
| consent-1 | 109.21 | 52.69 | 66/66 |
| success-1 | 116.32 | 68.21 | 60/60 |
| open-2 | 128.13 | 71.65 | 42/42 |
| consent-2 | 108.10 | 55.69 | 68/68 |
| success-2 | 118.98 | 59.92 | 62/62 |
| return-final | 92.01 | 68.06 | 40/40 |
| Total | 672.75 | 376.21 | 338/338 |

Trace count 12→6. Two disjoint app-read spans178.83→104.82 s measure queue-to-last-
finish incl parsing, not SDK internal reads or sums of parallel RPC times.
Source confirms redundant pre-submit snapshot removal; no old actual broadcast
read-count control exists.

| Stage | Actual scope |
| --- | --- |
| Cold resources | First key1.077 s/session41.699 s inside first job, not added again. Binary compilation not remeasured. |
| Excluded cold controls | First fund baseline cold/candidate warm and resumed first-open cold historical calibration excluded from six warm jobs. |
| Candidate warm proofs | Six adapter prove walls91.64–124.69 s incl fresh checks; later baseline exact-proof verification is not paired reproof. |
| Two commits | Preflight104.451/105.111 s; recursion8.99/8.90, end-cap4.52/4.49, verify3.09/3.11, nested. |
| Two settles | Preflight132.416/135.421 s; calls74.37/73.71, recursion21.02/20.94, end-cap4.51/4.45, verify3.16/3.06. Seven calls/one fill each. |
| Controller submit | Intent→result25.38–35.94 s incl checks/verify/HTTP, not pure transport. |
| Controller confirmation | Result→indexed/common16.39–183.62 s incl index/poll/recovery, not server-only finality/control. |
| Final ordinary claim | Cold process→ACK124.305 s + common50.293 =174.598 s; checkpoint 374233. |
| Stage memory | Same-Executor wallet RSS maxima warm quote4.58/3.46 GiB, two-second sampling with resource/cache differences. No reduction ratio/true peak claim. Parent endpoints separate; whole observer~7.30 GiB includes other tools. |
| Fees | 28 confirmed UPS burn28.000228 testPSY, controller8.000070; remainder market/ordinary/Sponsor. Escrow is not counted again. Paired actual fees equal. |

Resumed v2 envelope07:07:16.960–09:29:27.200UTC (~142.17 min) includes intentional
controls/admission windows/multiple UPS; fund was earlier v1. Not normal optimized
latency or chain TPS.

## Actual fills and conservation

| Event | Checkpoint | Content hash |
| --- | ---: | --- |
| Pool1 settle | 373901 | `bf1c0e0215d55b22c633ee3a7c78a6a2e05781d905aa91bd7a77c0f6e98d9dee` |
| Pool2 settle | 374141 | `6b65426055d92e742eae32ae9ad2405386d834450af7ed654006c724d6088dcc` |
| Controller hop2 claim | 374196 | `4d08d02623a0ddac047fa46df7f851f66411cbce4e1cd7f51976723b8e329f37` |
| Final return Outbox | 374225 | `90df53cc5b6f83d3e2e9192aae1b9a0c41ad5f951445fb6a73b58ee9462017ef` |
| Ordinary claim | 374233 | `69958393a494c99e8a8b29ebd700ac3a34f5a941eabaabf7a8a15c34a4a29fc5` |

4.611686018427387921 QA-A→2.378634516813680904 QA-B→claimed1.531196339553268088 QA-A.
Existing pricing verifies reserves/input/output; difference is not lost funds,
profit or uniform clearing. One initialization QA-B atom returned.
Checkpoint374234 finite owned accounts/pools/controller conserve1000 each FT incl
Outbox/claim cursors; native difference equals28receipt burns. Controller balances
zero, queues/batches terminal, both outcomes filled. Intermediate B becomes
spendable only after claim UPS. **Cross-UPS workflow, not cross-vault atomicity.**

## Rejected calibration and safe resume

First-open proof sources differed in checkpoint; AMM writes ctx.checkpoint_id into
order_checkpoint, so end roots differed. Comparator rejected before open broadcast,
without normalization/ignoring roots. Readonly audit found only fund confirmed,
nonce 1, no open broadcast/pending. Corrected readonly historical source373680
matches full public core; sealed driver refuses historical-calibration broadcast.
Original fund reconciled, never resent. Advisory renewal5.90 s reuses VM trace,
not production proof; full fresh proof generated. v1/v2 sources/failures retained.

Second window selected before freeze. Helper loaded source reconstructed from edit
records, not falsely claimed prehashed. Current stricter implementation replays
373955 to reproduce plan. Actual admit374046<cutoff 374051; seal374080. Five-checkpoint
slack in one sample is not a general low-latency guarantee.

## Verification and remaining work

140 application regressions pass: four adapters, nonce/state/expiry/root/network/
key/fee changes, advisory/window/restart/unresolved/concurrency/observation/window
bounds. Mock IO is not cryptographic/live evidence or additive security counting.
32distinct full requests independently verify;28have actual receipts, remainder
readonly/rejected controls. Deduplicate by requestSHA. Fee mutation rejects.
Actual identities/nonces/endpoints/receipt stats/fees verify; calibration failed
before broadcasting, with no replacement operation.

[Summary](../../executor/verification/2026-10-24-settlement-preparation-live-v1/PERFORMANCE-SUMMARY.json),
[detail](../../executor/verification/2026-10-24-settlement-preparation-live-v1/PERFORMANCE.json),
[proofs](../../executor/verification/2026-10-24-settlement-preparation-live-v1/PROOF-VERIFICATION-SUMMARY.json),
[originals](../../executor/verification/2026-10-24-settlement-preparation-live-v1/manifest.json),
[regressions](../../executor/verification/2026-10-24-settlement-preparation-final-regressions-v1/manifest.json),
[rejected control](../../executor/verification/2026-10-24-preparation-rejected-calibration-v1/manifest.json).

```sh
python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-24-settlement-preparation-live-v1
```

Integrity is distinct from full UPS verification. Restore originals/build frozen
verifier then run verifyPreparationRun into fresh output. REPORTING-SOURCE versus
CANDIDATE-SOURCE-v1/v2 distinguish loaded financial source from postprocessing.
No keys/binaries in public archive.

Remaining full calls/recursion/end-cap/internal witness reads/multistage confirmations/
ordinary cold start dominate. No SDK sub-read instrumentation or cold binary control.
Joint trace/scheduling change has no isolated attribution. Two thin fills do not
establish max capacity/steady/all-market performance. First accepted window intact;
second only once under low load. No capacity expansion/Sponsor-UPS merge/multi-host
closure. Random off; scoped queue is not global censorship resistance. Upstream
release/running image/upgrade/network trust remain external; success does not
replace them or establish production readiness.

Branch identity: `markets-batch-capacity-recovery-20261020`.
