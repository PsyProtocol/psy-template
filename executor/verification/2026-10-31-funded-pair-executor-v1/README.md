# Funded Book/NFT candidate: public evidence

Read [the implementation, failures, measurements and open gates](../../../docs/security/FUNDED_PAIR_CANDIDATE_20261031.md).

There are 28 unique complete **synthetic vault UPSs**: Book 11 normal plus two
alternative retention transitions; NFT 13 normal plus two alternatives. Seven
original Book requests are copied byte-for-byte only after exact independent
Endcap/key/stack/session/start/end-state verification and VM replay. Twenty-one
new complete UPSs are produced. The original seven proofs and failed second OPEN
are retained. Duplicate archived requests are not extra unique proofs or fills.

Book and NFT are separate worlds with different spending/public keys, even
though each fixture uses market 1000/vault 100. The test actor funding, owner
grant, ordinary order/cancel and recipient claim operations are **VM
prerequisites**, not signed ordinary-wallet UPSs or real transactions. Each
world has one synthetic match/sale, two terminal source members and one later
timeout refund. Retention forks preserve unmatched nonces and do not refund
them. The complete source has seven declared synthetic Native accounts. This
does not certify global off-chain order admission or censorship resistance.

Actual native identities match the complete proof keys; v14 Curve identity and
old AMM/Curve generated source stay unchanged. The dedicated native driver
rejects direct submit, and the legacy driver rejects the new pair profile.
These are actual binary checks. Formal journal/transport/lifecycle regressions
use explicit transport doubles and are not real extension/network acceptance.
No live read, deployment, registration, payment, fill, claim or UI write occurs.
Every fixture keeps `allow_broadcast: false`. Never register or fund these public
test identities or use their synthetic anchor as a release plan.

The [manifest](manifest.json) hashes every uncompressed and gzip member. It is
an integrity index, not a verifier. Source/current openings, requests, Endcaps,
public session projections, key proofs, generated artifacts, build/source pins,
all failed attempts, regression logs, timings and lifetime RSS samples are
included. Wallets, binaries, private keys, mnemonics and raw signing/CFC witnesses
are excluded. All originals remain in the local immutable case directory.

The separate [release-review annex](release-review-v1/manifest.json) adds final
host-only profile immutability and reviewed kind/profile rejection checks. Its
final regression has 94 passes/two existing skips. The original proof manifest
and its 91-pass host record remain unchanged; no key graph or proof is regenerated.

Important manifest `source` records:

- `public/PLAN*.json`: limits and explicit bounded corrections. Aggregate VM /
  proving processes remain below 2,400 seconds, with 28 unique positive UPSs,
  at most two new artifacts and three compiler attempts, and zero finance.
- `fixtures-v1/FAILURE.json`, compile logs, `public/CLOSED-vm-v*.json`:
  NFT field-selection failure and two incorrect acknowledgement sequences.
- `public/CLOSED-full-v1.json`, `public/ROOT-CAUSE-v1.json`, `full-v1/`:
  seven original proofs and stale previous-batch settlement-cursor rejection.
- `public/CLOSED-full-v2.json`, `full-v2/*-REPORT.json`, `public/METRICS-v1.json`:
  final conditional correctness, all 1,205 final RSS samples, exact replay and
  separate main/alternative fees. The process takes 1,243.226 seconds; RSS peak
  is 8,104,208 KiB, including shared pages, not physical footprint.
- `public/CLOCK-v1.json`: original host suspension; 22,960.407 wall seconds
  versus 565.112 monotonic seconds. It is not a usable performance comparison.
- `public/INDEPENDENT-v1.json`, `public/VERIFIER-PIN-v1.json`, `independent-v1/`:
  all 28 fixed-resource Endcaps/metadata verified and public-fee changes rejected.
  This checker does not independently establish the approved call stack.
- `public/CONSISTENCY-v1.json`: separate public graph/fee/source consistency.
- `public/FINAL-NATIVE-v9.json`, `public/NATIVE-BINARY-v9.json`,
  `runtime-fixture-v1/`: actual key identity and early no-RPC rejection checks.
- `public/regression-final-v1.log`: 91 scoped host passes, two existing skips;
  `public/native-guards-v10.log`: three pure native guards;
  `public/native-nft-metadata-v10.log`: actual collection/market metadata checks;
  `public/archive-boundary-v1.log`: secret-field and preservation checks.
- `public/build-tests-v8.log`: retained intermediate `QHashOut` regression
  compiler error; `application-v10` contains the corrected, tested source.

## Reproduction without financial operations

Verify/decompress each manifest member to an absent directory by its `source`
path. Never extract over source, wallets, runtime, prior artifacts or evidence.
Materialize the frozen unpatched mainnet-beta SDK using
`batching/dependencies/materialize_mainnet_beta.py`, then create a fresh
application with `prepare_mainnet_beta_application.py --source ... --out ...
--test-only`. Use `nightly-2025-09-20`, Cargo `--release --offline --locked`,
`PSY_NETWORK=testnet`, `PSY_MARKET_TESTNET_PROFILE=mainnet-beta-20261027-v1` and
`RAYON_NUM_THREADS=2`. Source and dependency pins are in the archived application
manifests and the repository's frozen dependency manifest.

Set `BATCH_BUILD=EXTRACTED/fixtures-v2`, `FUNDED_PAIR_OUT=ABSENT_OUTPUT` and
`FUNDED_PAIR_VM_ONLY=0`. Run test target `batch_lifecycle`, filter
`paired_funded_bootstrap_priority_and_refunds`, with
`--ignored --nocapture --test-threads=1`. To reproduce the exact bounded
continuation, set `FUNDED_PAIR_REPLAY=EXTRACTED/full-v1`: the seven saved requests
must pass fresh exact re-verification/replay before they advance the synthetic
state. This option is test-only and never broadcasts. Without it, all 28 would
be newly proved; predeclare that separate cost instead of calling it this run.

`verify_saved_ups` from the pinned source verifies each saved request with the
fixed verifier/common data. `verify-v1.py` records the exact bounded independent
check, including changed-fee rejection. Run
`node batching/checkpoint-stream/audit-funded-pair.mjs EXTRACTED/full-v2` for the
separate structural audit. Neither checksums, an Endcap alone, nor that audit
substitutes for approved-stack/session binding, consensus finality, receipts,
ordinary signed claims or real browser-wallet approval.

Deterministic ordering remains enabled. No unbiased randomness, same-pool full
parallelism, cross-vault atomicity, cross-machine coordination, matched speedup,
p95, chain TPS or production signoff is claimed. Real wallet wiring, instance
acceptance, source-window/budget fit and fee/treasury liveness remain open.
