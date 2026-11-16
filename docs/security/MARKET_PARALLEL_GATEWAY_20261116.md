# Reviewed parallel market continuation — 16 November 2026

## Configuration evaluated and actually used

The referenced configuration conversation was read through its original setup
and real programming trial. This run reused its existing short path:

```text
oh-my-pi 18.2.10 coordinator
  -> three parallel task workers: CurveCore, BookCore, NftCore
  -> local Magpie gateway
  -> Cursor auto
Codex root: independent review, AMM evidence audit and final integration
```

The isolated profile remains `magpie-cursor-test`; default/task/smol roles all
use `magpie/cursor/auto`. This is not differentiated model routing. The gateway
list and actual request records confirm the path, but `auto` does not identify
the underlying model. No CLIProxyAPI layer, model change, global profile edit,
SDK migration, Node edit or new Git branch was introduced.

Workers used a fresh tracked-source snapshot of `a1a15dc3`, without `.git`,
wallet state, signer files or raw financial archives. Each owned an explicit
nonoverlapping file list. The root reviewed their changes before copying any
accepted patch into the existing branch. Source isolation by task instructions
is not an operating-system sandbox. A file comparison found only six assigned
tracked files changed and three new worker reports; no tracked file was removed.

The coordinator received a 14-minute limit, with an external 16-minute ceiling,
three task workers, a 140-request observation ceiling, 2 GiB sampled process-family
RSS ceiling and 2 GiB disk floor. Financial operations, proving, deployment and
native builds were excluded from these workers. A separate root-owned native
unit build had its own one-command, five-minute, zero-fee limit.

## Review decisions and actual code changes

1. **Rejected all proposed cross-namespace vault restrictions.** The workers
   treated equality between a user-account number and a contract number as a
   conflict. SDK state storage has separate `user_id` and `contract_id` axes.
   Actual contracts require distinct owner/vault *accounts*, not distinct
   numbers across these namespaces. Their proposed Curve/Book/NFT restrictions
   were not merged. The root removed the pre-existing equivalent restriction
   in the [Book builder](../../orderbook/u124/core-build.mjs) and added positive
   namespace regressions for all three clients. Real account-role restrictions
   remain intact. More refusals do not automatically mean more security.
2. **Accepted the reviewed NFT early ABI checks.** The
   [unsigned NFT planner](../../nft-marketplace/coreClient.mjs) now checks the
   reviewed method selectors, arities, outputs, external mutability and method
   uniqueness. Matching names alone, duplicate names and selector aliases reject.
   This is early input validation, not deployed code/layout/key authentication.
   Same-UPS NFT source identity is still required and unaccepted.
3. **Retained the SDK's supported Native shorthand.** Ordinary SDK input uses
   contract ID, method name and inputs, then resolves the actual function from
   authenticated contract code. Adding a host `method_id` is not a replacement
   for that process. The proposed extra Native field was not merged.
4. **Added ordinary startup diagnostics.** The
   [ordinary client](../../amm/u124/vm-tests/src/bin/isolated_wallet.rs) now
   preserves a public-only error projection when session startup fails. The
   [projection](../../amm/u124/vm-tests/src/ordinary_diagnostics.rs) recognizes
   the exact bounded checkpoint-proof-not-ready error without exposing private
   context, raw suffixes or witnesses. It grants no retry/sign/broadcast authority.
   The earlier generic sponsor startup failure remains unexplained; this change
   cannot retroactively diagnose it. The code compiles in the frozen release
   unit target; no replacement wallet executable was installed or used on-chain.

## Independent validation and limits

[Compact evidence index](evidence/market-parallel-gateway-20261116.json)
records raw archive hashes and distinguishes all acceptance levels:

- **98 host/mock checks pass**, no skips. They exercise production helpers,
  builders, call encoding and existing journal/recovery coordination. They do
  not generate native proofs or transact.
- **7 Rust diagnostic tests pass**, with five unrelated tests filtered. Build
  and lockfiles are unchanged; the selected mainnet-beta SDK remains
  `01b8f2b0a077367a7b9879baba1a72aea8ab5510`, client `70580700`.
- New NFT ABI and Book builder regressions fail against preserved pre-change
  helpers and pass after integration. Two initial root test-fixture errors
  (missing buy flag/cancellation ABI) are retained separately; they were corrected
  without weakening production checks.
- **Nine already-confirmed UPSs independently reverify** using the pinned
  existing complete-proof verifier. Receipt/core fees, per-account nonce sequence
  and linked state endpoints agree. This checks complete Endcap/core metadata;
  approved stack/session evidence remains separately grounded in original
  native execution and SD-key constraints. It is not new network confirmation,
  arbitrary approved-stack attestation or consensus finality.

## Actual AMM state and next financial gate

The prior run completed QA issuance, ordinary QA claims, new-vault activation,
LP submission and LP commit/settlement, then confirmed the swap order opening.
It stopped at the next sponsor's ordinary session startup, before that sponsor
created request/preflight/intent artifacts. The nine confirmed UPSs cost
**9.000097 test PSY**. They are historical transactions, not nine new transactions
in this run. No swap settlement or final ordinary market-output claim is claimed.
Assets 49/50 are newly issued QA FT, distinct from existing pUSDT and test PSY.

A new read-only check at common checkpoint **146907** matched the old
checkpoint-one instance anchor, Native/QA49/QA50/AMM51 metadata and all three
owned account identities. AMM vault **1182848** remains initialized after LP batch
1. This does not install or qualify runtime proving/finality resources. The
original order deadline **108620** has passed and the old case's wall budget is
expired. Do not resume its success-only script or resend an old request. The
next bounded financial phase must recheck exact current funding/order state,
dispose/refund the original expired order and reconcile ordinary claims before
opening another intent. Any fresh phase remains within the remaining cumulative
fee/asset ceilings and retains unique financial ownership.

An additional bounded pending-funding read collector failed locally while
serializing fractional timing through the strict amount serializer. No durable
pending-funding observation is accepted from it, and it was not rerun inside the
40-read envelope. The original collector and new failure record remain intact.
Its next version must project public amounts as strings and timing as integer
milliseconds before attempting another bounded observation.

## Measured orchestration result

| Metric | Observed result |
| --- | --- |
| Coordinator/workers wall time | 534.826 seconds |
| Sampled process-family RSS peak | 461,584 KiB; shared pages included, not physical peak |
| Completed worker reports | Three; not three automatically accepted patches |
| Usage window | 122 requests: 121 HTTP 200, one HTTP 499 |
| Reported input/output tokens | 901,350 / 17,097 |
| Reported cache-read tokens | 2,247,296; not added to input as a disjoint metric |
| Prices / underlying model | Unavailable / only `auto` identified |
| New financial operations / new proofs | Zero / zero |

The usage window may include other activity on the same gateway/account. The
supervisor's last intermediate delta was 121; the final before/after projection
contains 122 rows. Token metrics and HTTP success do not establish useful work,
quota savings or equivalent model quality. There is no same-task single-agent
control or matched performance experiment.

The first task call had empty arguments and was repaired before all three
workers spawned. The restricted coordinator omitted `hub`, causing coordination
churn. Future bounded runs should explicitly include `hub` in their per-run tool
list and provide compact complete task arguments immediately; global defaults
stay unchanged. This proposed configuration improvement was not benchmarked.

Raw source snapshots, gateway/session logs, worker reports, unit logs and proof
verification outputs stay outside Git in `market-parallel-omp-20261116-v1`.
Only reviewed code, tests and compact public evidence are pushed.

Curve/Book/NFT formal native/Executor dispatch, fresh dedicated-key full UPSs,
current network fills/refunds/ordinary final claims, real browser approval,
qualified randomness and global order completeness remain separate open gates.
This round does not establish production readiness or trading throughput.
