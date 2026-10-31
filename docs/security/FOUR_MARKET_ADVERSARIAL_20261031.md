# Four-market preserved-bytecode adversarial review — 31 October 2026

This round starts from `52888d2727e183ba8f5ef6585fd61bd0e0e6b339` on
`markets-batch-capacity-recovery-20261020`. No financial or proving process was
active when inspected. Root remained the sole owner. The declared bounds were
16 public RPC reads, zero new source compilations, zero new proofs and zero
financial operations. All 16 reads were used; no registration, faucet request,
deployment, mint, payment or claim was added. The frozen SDK remains
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274` and backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. Node and original artifacts are unchanged.

## Reproduced defects and fixes

Two new tests failed against the starting builder with `Missing expected
exception`, then passed after the fixes. Both red and green logs are retained.

1. **Incomplete integrity inventory.** Binding iterated only over hash entries
   supplied by `BUILD.json`. Deleting a mandatory bytecode hash still allowed
   binding. The [manifest validator](../../batching/market-suite/manifest.mjs)
   now requires exactly 21 files, four market records and six frozen input
   roles. It cross-checks source/artifact records, copied dependency hashes,
   frozen versions, profiles, configuration/domain and offline readiness flags.
   Missing/extra paths and an incomplete-build marker reject before publication.
2. **Ambiguous actual functions.** Checking the first matching actual function
   allowed a duplicate FT transfer definition behind a valid ABI entry. The
   [builder](../../batching/market-suite/build.mjs) now rejects duplicate actual
   names/selectors in Native, both FTs and NFT. FT/NFT definitions must cover
   every ABI method exactly once, with matching selector and input/output arity,
   including non-settlement functions such as mint. Existing critical-method
   and frozen Native checks remain intact.

These are offline build-integrity defects. This evidence does not establish a
live fund exploit, nor assert that ABI matching proves business correctness.
Native has a layout-only ABI; no nonexistent Native method-table API was added.

The manifest is now hashed and parsed from the same captured bytes. All members
are loaded once, checked against that manifest, and consumed from the checked
snapshot during binding and cache copying. A caller may supply a reviewed
`buildManifestSha256` / CLI `--build-sha256`. Without it, the result explicitly
records `expectedBuildDigestMatched: false`. A self-consistent manifest or
matching optional pin does not establish compiler trust, network assignment,
key authorization, state freshness or full-UPS acceptance. All live flags stay
false. No transaction proof, witness, nonce, fee or state is cached here.

## Tests actually completed

The final runs contain **19 passing tests**, not 19 new financial acceptances:

| Run | Tests | Actual scope |
| --- | ---: | --- |
| New reproductions | 2 | Missing mandatory bytecode hash; duplicate actual transfer |
| New adversarial suite | 8 | Inventory/record tampering, failure marker and wrong pin, byte snapshots, complete dependency methods, all-four exact cache reuse, partial output recovery, two actual local bind processes, preserved original hashes |
| Existing focused regressions | 9 | Five actual-artifact/identity checks, three cache refusal cases and one real application import |

The adversarial cases include empty inventories, traversal entries, missing
markets/inputs, conflicting source/artifact/dependency hashes, false readiness,
duplicate Native/NFT functions, duplicate FT selectors, missing mint and changed
mint selector/input/output arity. These tests use preserved real compiler
outputs. They are not mocked financial execution or a new contract VM/UPS run.

Four exact source comparisons run **before** cache adoption so that this test
cannot silently fall through to a new compilation. All four reuse records have
`compilerInvoked: false`, and copied bytecode hashes equal the originals. The
compiler binaries are queried only for their network domain. Original manifest
and all 21 members remain byte-identical.

Two independently launched local Node processes race for one fresh output with
different market assignments. Exactly one publishes, the other fails. Every
published policy descriptor matches the winner, and every output hash matches
`BOUND.json`. A partial output cannot be overwritten; recovery creates a new
directory and leaves the partial file intact. This is **local offline binding
publication**, not live financial failover, a distributed lease or cross-machine
coordination. No broadcast or business-operation retry is involved.

Final Node version is `v24.22.1`. Whole test-run durations are approximately
4.644 s (adversarial), 0.315 s (reproductions), and 1.158 s (existing regressions).
They are test-run timings, with different work per run; they are not cold/warm
proof comparisons, memory measurements, confirmation latency or settlement TPS.
All preliminary failures and green runs are retained, not discarded as slow or
failed samples.

## Current-chain read failure is narrower, not resolved

At common checkpoint **26855**, both Realm heads agree and the checkpoint-1 root
still matches `919896e18690246e20307f68cf2e5725aee496755366bbafff88eccaea975f12`.
QA FT 8 code/layout/function endpoints still match its included deployment.
Issuer 223232 remains nonce **1**, with Native balance **998.999998 test PSY**.
These are public observations, not independently authenticated consensus finality.

| Query for contract 8 | Realm 0 | Realm 1 | Coordinator |
| --- | --- | --- | --- |
| Height at fixed checkpoint 26855 | `[31]`, `[31]`, later `[31]` | `[31]`, `[31]` | Not queried |
| Height at exact integer `9223372036854775807` | `[0]` | `[31]` | `[31]` |
| Issuer state leaf at checkpoint 26855 | Two `-32001` missing-height errors | Not routed here | Not queried |

The sentinel is encoded losslessly as an integer, not a rounded JavaScript
Number. In the frozen source, Realm state/proof reads populate their height
cache using **i64::MAX**, rather than the state request's fixed checkpoint.
Zero is rejected with the exact observed error. The ordinary height endpoint
passes through the supplied checkpoint. The DB wrapper maps an absent value to
zero. Thus fixed-checkpoint metadata success alone is insufficient readiness.

This is a source-based explanation consistent with the captured responses,
not attribution to a confirmed serving build or database fault. The frozen
Scylla checkpoint conversion clamps at i64::MAX; no signed-overflow diagnosis is
established. Serving instances, routing, cache and persisted rows require runtime
inspection. [The precise updated handoff](UPSTREAM_REALM_LATEST_HEIGHT_HANDOFF_20261031.json)
lists requested evidence and acceptance criteria without changing Node.

No application-supplied height, opposite-Realm state routing, zero substitution,
contract update, redeployment of QA FT 8 or new financial retry was used. The
normal fresh preflight and complete current-instance proof gates remain closed.

## Reproduction and evidence

The [public evidence pack](../../executor/verification/2026-10-31-four-market-adversarial-v1/README.md)
contains plans, raw read requests/responses, both reproductions, final logs,
commands/environment, changed source snapshots, exact reuse records, local
race output and interrupted-output evidence. Large negative clones are excluded
from publication. Original bytecode/configuration comes from the unchanged
[previous pack](../../executor/verification/2026-10-31-four-market-suite-v2/README.md).
The preserved local case is `four-market-adversarial-20261031-v1` under the
existing recovery evidence root. All outputs use fresh directories.

For the new adversarial tests, set `MARKET_SUITE_SAVED_BUILD` to the preserved
`registered-target-suite-v1` build, `MARKET_SUITE_SPEC` to the original
`registered-target-suite-spec.json` with reviewed sealed compiler paths, and
`MARKET_SUITE_ADVERSARIAL_OUT` to a **nonexistent** directory. Then run:

```sh
node --test --test-reporter=tap batching/market-suite/adversarial.test.mjs
```

Use another fresh output for `manifest-regression.test.mjs`; the two files each
own their output and must not share it concurrently. Existing review/reuse tests
retain their documented environment variables. Exact final invocations and
return codes are in `public/TEST-RUNS-final-v1.json` inside the pack. Restoring
public paths on another machine requires reviewed frozen compiler binaries; do
not copy their previous machine's path strings as trust or execute a sender.

## Remaining acceptance boundaries

The [preceding suite report](FOUR_MARKET_SUITE_20261031.md) remains the baseline
for source coverage, cross-page cursors, refunds and priority semantics. No
AMM/Curve quote, Book whole-order price/time priority or NFT unique-sale rule
changes in this round. Shared-state transitions remain ordered; proof
aggregation does not make same-pool settlement fully parallel. Random mode is
not enabled and finite authenticated source coverage is not global fairness.

Reliable Realm 0 state/proof metadata is still external. Actual QA B/collection
and market identities, fresh empty-vault/key setup, full actual-ID UPS, source
window/deadline/fee budgets, admission/cancel precedence, real fills/claims and
actual browser approval remain unverified. Existing parent financial ceilings
and spent faucet requests are unchanged. A full four-market deployment still
requires a separately bounded live plan; this offline test round grants none.
No current-chain market fill, ordinary market claim, UI payment or production
readiness is claimed.
