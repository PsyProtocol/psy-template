# Paired market dependency, source and deadline readiness — 29 October 2026

## Scope and starting point

Continuation of `ed61047f` on `markets-batch-capacity-recovery-20261020`.
The worktree was clean and no financial/proving job was running. Root owns all
execution. SDK `c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274` and backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d` remain frozen. There are no Node,
dependency, old-contract, market-pricing or ordering changes. Original artifacts
and failed runs are retained. Deterministic mode and the offline-only gate remain.

## Application changes

- `source_inventory.rs` verifies complete sparse account enumeration relative to
  a pinned global user root. Each verified leaf path partitions a pending subtree
  into a leaf and disjoint siblings. Authenticated zero siblings need no extra
  request. Wrong paths, roots, indices, replay and incomplete enumeration reject.
  This replaces repeated binary-prefix discovery in the existing
  `final_state_capture` collector; source eligibility, funding and per-account
  checks are unchanged. The legacy traversal remains available for comparison.
- `LiveBinding::check_membership` binds the complete contract leaf, including
  deployer, code/layout/function roots, counts and height, to a contract-tree
  membership proof. This requires a separately pinned root; it does not supply
  finality, prove an RPC observation trustworthy, or freeze a future upgrade.
- `bind_native_artifact` reconstructs every captured native method and the complete
  function whitelist with the frozen SDK, verifies canonical layout endpoints
  and contract membership, and emits a fresh artifact. Selected-method ABI
  equivalence cannot substitute for full identity. It has no network/signing API.
- Native source verification exports the minimum eligible deadline from verified
  state. Book/NFT manifests no longer enter the legacy AMM permutation preparer;
  they retain their price/time and buyer-frontier semantics.
- `prepareFinalStateStream().planPairBudget()` obtains counts and deadlines from
  the sealed native verification result, not caller-selected members. Its v9
  estimate reserves full source coverage, repeated scans after individual removals,
  all member/recovery dispositions, terminal work and explicit claim fees. It
  cannot enable signing or broadcasting. Too-short deadlines, insufficient fees,
  missing source/dependency evidence or a fee cap below the profile bound reject
  planning readiness. No source window, key or sealed epoch is silently changed.

A lower discovery-request count is verified on identical synthetic source sets.
It does not reduce the four-account-per-coverage-UPS bound or establish an
end-to-end proving/confirmation speedup.

## Current network observations, bounded failures and final inventory

At pinned checkpoint **12428**, checkpoint-1 roots observed through realm0,
realm1 and coordinator agreed. These are RPC observations, not finality proofs.
The complete native code/layout/function leaf was reconstructed and its contract
membership verified under the observed checkpoint contract root. All ten native
methods are included. Seven tampering cases reject before an artifact/success
report is created: method omission, owner substitution, function-root substitution,
switched contract root, short path, bytecode arity and layout slot count.

The initial Python read stopped on TLS EOF after observing head 12381. A new
bounded collector preserved the pinned 12428 source and used its 128-request
allowance without completing the tree: 66 accounts were authenticated. A separate
512-request continuation reverified the exact saved prefix and original root,
then stopped at a TLS failure after 26 requests. That prefix authenticated 80 accounts with 144 proofs and was correctly marked
incomplete. A later bounded continuation reached 252 accounts/463 verified paths
and stopped at its 256 MiB capture budget. The final 256-read/600-second continuation
replayed the exact prefix and **completed all 312 nonzero account leaves with 575
membership proofs**, at the original checkpoint/root. It made 115 read requests
in 228.108 seconds; its explicitly permitted transport retries were unused.
Earlier stop records are preserved, never relabelled as complete. No failed
transport is treated as an order verdict.

An independent frozen-SDK `SimpleMerkleTree` reconstruction of those 312 leaves
matches the pinned user root. The legacy prefix walker yields exactly the same
set using **4103 logical discovery reads**, versus 575 leaf-path proofs. This is
an exact algorithmic/read-count comparison over the same reconstructed tree,
not two matched live RPC latency runs. Omissions, duplicates, zero/forged leaves,
an incomplete flag and a wrong pinned root all reject in the independent audit.
Final application v7 replays the complete original transcript and produces a
byte-identical inventory report. Market eligibility, finality and future-source
freshness remain separate requirements.

One native metadata request incorrectly targeted realm0 and returned method not
found. The frozen provider routes this API to coordinator. The corrected fresh
capture used that route and succeeded; no schema coercion or dependency change
was made. The original error is preserved.

The complete 312-account inventory requires **78 four-account coverage UPSs**,
before any fill, refund or ordinary claim. At the frozen base fee this alone has
a 78 test-PSY fee floor, without deployment/setup or state-write fees. The archived
planning scenario reserves 80 UPSs plus ordinary claims (83.008 model PSY), even
assuming zero eligible/recovery members. Its illustrative 80-PSY budget and C+32
window fail; it is not a funded plan or a live timing measurement. Actual new-market
eligibility is still unknown. A fresh epoch needs a fresh authenticated source;
this historical pinned inventory is not permission to sign later against old state.
Allocation cursor values are not occupancy counts. Time estimates need explicit
assumptions and cannot guarantee future checkpoint cadence or service.

## Checkpoint acceptance and cancellation precedence

Source excerpts and whole-file SHA256 are retained in
`FROZEN-ADMISSION-SOURCE-v1.json`. They describe the frozen export, not an attested
running service or a live rejection experiment.

1. The edge checks the submitting account, its exact starting leaf, non-future
   session checkpoint, historical checkpoint-tree prefix, proof inputs and proof.
2. Normal and deferred processor paths compare the submitting account's old leaf.
   This is separate from foreign-account read freshness. An initialized vault
   state advanced by a confirmed trade/refund conflicts with an older vault UPS.
3. A user-account cancellation visible at the signing checkpoint can select the
   existing authenticated refund path. A later foreign cancellation does not, by
   itself, establish that an already generated vault trade proof is rejected.
4. The business cancellation result is the confirmed vault disposition and actual
   asset ownership. A cancel request/ACK is not a refund receipt; a refund Outbox
   is not an ordinary-wallet claim. Competing/unknown originals retain exact
   identity and account locks until reconciled. Do not generate a replacement.
5. No generic fixed snapshot-age limit was found in the inspected paths. Contract
   expiry is evaluated at the signed session checkpoint. It is not evidence of
   inclusion-tip expiry or guaranteed ordering against a later foreign cancel.

The application can stop before broadcasting a stale plan, check fresh state,
coordinate one vault owner and reconcile the exact winner. It cannot force every
other public-SD-key executor or network admission path to use its preflight.
The existing UI already labels cancellation as awaiting exit confirmation and
local drafts as local cancellation; no optimistic chain-refund state was added.

## Remaining security deliverables and live boundary

The [admission requirements](../../batching/checkpoint-stream/admission-requirements.json)
now separate observed source behavior and implemented application mitigations.
Required external evidence remains specific:

- Realm/protocol: the actual enforced snapshot-age, foreign-state/cancellation
  and active dependency-version rules across edge and processor paths, with
  exact-request positive/negative evidence and unchanged-state/fee checks.
  A policy RPC declaration alone is insufficient.
- Deployment/security owners: authenticated upgrade authorization or reviewed
  immutable deployment semantics. The inspected handler compares a supplied
  numeric deployer to the stored deployer; its update request has no owner
  signature field. Middleware/proxy authorization is not established by this
  source review. No old contract was updated or probed for unauthorized access.
- Resource/release owners: identify the public proof/resource and service build
  that enforce those rules. Historical Merkle membership and a fixed verifier
  do not establish finality, currentness or unbiasable randomness.

Real deployment, trading, ordinary signed wallet claims, receipts, fees and
recovery acceptance are **not closed** in this continuation. New funded instances
remain zero. Full account enumeration is closed relative to the pinned observed
root; new-instance market eligibility and a fit deadline/funding plan are not.
The unfit C+32 budget and unresolved protocol/version enforcement must not be hidden by removing `live_authorization`
or by deploying a small unbound shortlist. No test PSY is spent by these checks.

The remaining deadline/capacity work is an **application candidate task**, not
something automatically assigned to Node: design a separately versioned finite
window and/or authenticated coverage aggregation, bind its budgets before opening,
and revalidate its contract, key and full UPS. Do not change the old window, key
or already sealed sets. Neither increasing a configuration number nor treating
an old checkpoint as perpetually fresh closes this work.

## Reproduction and measurements

Use the frozen-source materializer and application snapshot tool with
`cargo +nightly-2025-09-20 --release --offline --locked`, testnet magic
`1384803358401154921`, two Cargo/Rayon threads and the recorded binary hashes.
The source collector is explicitly read-only and writes fresh directories.
Resume preserves the original checkpoint/root/transcript; a changed chain/root,
missing route, failed path, transport failure or exhausted budget stops it.

The native full-dependency build took 14.587 seconds, with sampled process-family
RSS peak 457104 KiB. This is resource reconstruction, not a complete UPS or network
confirmation. Test/proof process times and lifetime RSS are recorded separately;
RSS includes shared pages and is not a physical peak. No matched deterministic
versus random, old versus new live throughput, p95 or production conclusion is
supported. Original failures and unconfigured legacy-fixture test attempts remain
visible alongside successful scoped regressions.


## Final verification matrix

| Evidence | Result | Scope |
| --- | --- | --- |
| Complete native dependency | All ten methods, code/layout/function roots and pinned membership pass; seven mutations reject | Observed native dependency; no finality/upgrade lock |
| Account inventory | 312 leaves, 575 verified paths; independent SDK root and legacy traversal match | Pinned checkpoint 12428, not transaction history or new-market eligibility |
| Full UPSs with captured native | Two Book UPSs pass fixed Endcap/common, complete stack/session/key/fee/state checks | Synthetic history: open and first coverage page; no fills or signed recipient claims |
| Executor source/budget route | Native verification, caller-count override rejection, restart identity and tamper rejection pass | Actual sealed native process and persistent journal; financial gate remains closed |
| Source collector regressions | Nine scoped source tests pass; three inventory and two dependency/domain unit tests pass | Includes complete/excluded accounts, omission, forged state, limits, U124 and cursors |
| JavaScript checkpoint regressions | 27 pass, two optional evidence tests skip; transport-only tests: three pass | Optional tests need their separate archived evidence inputs |
| Broader library attempt | 29 pass, three legacy-fixture tests fail for missing environment, five ignore | Those legacy wallet-profile fixtures are not validated here; modern batch ABI is not a substitute |
| Current-chain financial operations | Zero | No deployments, registrations, funds, trades, ordinary claims or fees |

The initial full-UPS trial stopped **before proving**: the test compared the
unseeded construction leaf (function root still zero) instead of the authenticated
source leaf. The corrected trial compares the entire authenticated native leaf;
it does not relax identity checks. Original failure, build and sources remain.
The budget route also exposed property-order-dependent plan hashes; canonical
key ordering now gives the same persisted plan after restart.

Full-UPS key fingerprint:
`80de0ebb5b045f739374f2fbcd06a17df44a91144af0552f97c80224cc310288`.
It is a distinct synthetic-instance test key, not a registered live vault/key.
NFT/AMM/Curve full UPSs using this new complete native fixture are not added by
this two-proof run; their earlier profile evidence is not relabelled.

| Measured operation | Wall time | Fee scope |
| --- | --- | --- |
| Captured-native Book open | 39.175 s | 1.000013 synthetic PSY |
| First four-account coverage | 48.261 s | 1.000005 synthetic PSY |
| Entire two-UPS process, including resource construction | 194.373 s | Zero real test-PSY spend |

One-second sampled process-family RSS peaked at 2632128 KiB for that process.
The two operations perform different work; their timings are not a matched
cold-versus-warm speedup. Very brief root-audit/replay processes were too short
for a meaningful 1-second RSS peak; their tiny sampled values are not presented
as memory requirements. Real confirmation, ordinary-wallet claim, real fees and
sustained throughput remain unmeasured. Nested stages are not summed.

Public evidence, exact requests, public sessions, fixed-verifier records, source
snapshots, failure logs, native resource hashes, read-only captures and restore
instructions: [evidence bundle](../../executor/verification/2026-10-29-pair-dependency-source-readiness-v1/README.md).
