# Conditional deterministic settlement and exact-proof continuation — 31 October

## Release scope

This continues commit `0301893ca6946bf5fbdf54dac42130afde23f745` on
`markets-batch-capacity-recovery-20261020`. The same AMM/Curve v14 bytecode and
spending keys are used; no new market compilation, Node change, SDK change, old
contract update or financial operation occurs. Frozen SDK remains
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`.

Sixteen complete synthetic UPSs verify funding, full-source processing, 4+1
settlement and two alternative recovery branches. There are three simulated
fills and two terminal refunds per normal market path. Ordinary claims execute
actual VM bytecode. There are **zero real trades or ordinary-wallet UPSs**.

These are conditional transition tests: initial vault activation, pool/reserve
or Curve inventory initialization, ordinary order creation and funding are
explicit VM prerequisites. The zero-cap, nonzero-nonce initial fixture is not
shown reachable through a v14 first-use transaction. The separately accepted
[empty-vault bootstrap proofs](DETERMINISTIC_FUNDED_BOOTSTRAP_20261031.md) and
these initial states do not form a single proof chain. Neither this report nor
the synthetic checkpoint store proves new-vault-to-user-arrival acceptance.
That lifecycle integration remains open before promotion.

Root was the only proof owner. Declared bounds: two markets, at most 16 unique
positive complete UPSs, 2,100 proving seconds, two Rayon threads, 10 GiB sampled
process-family RSS stop, zero new market compilations, zero live reads and zero
financial operations. A failed run accepted one grant; the corrected run reused
that exact proof and generated 15 further UPSs. The saved-proof guard test
generates no CFC/key/Endcap proof. Financial ceilings and faucet counts are
unchanged. Original logs, source snapshots and failed artifacts are preserved.

## Corrected checkpoint sequencing

The first run completed the AMM funding UPS at checkpoint 100, then attempted
OPEN using its earlier source after the process advanced to checkpoint 101.
The real contract correctly rejected `fresh fixed source scope` before another
UPS was generated. The source-equals-execution-checkpoint rule is unchanged.

The [acceptance driver](../../amm/u124/vm-tests/tests/support/funded_stream_full_ups.rs)
now authenticates a fresh full source **after** funding, at checkpoint 101. The
new source's vault leaf equals the exact accepted grant endpoint, not merely a
larger checkpoint number. One eight-account source, five eligible members and
the original C+32 expiry remain fixed over all pages and recovery forks. Source
authentication is relative to the synthetic pinned root; this is not consensus
finality or a seal-before-random-publication certificate. No random mode is used.

The formal native v14 Executor signing/broadcast adapter is still not installed.
This driver correction must not be described as a live Executor release. The
existing public source-planning route explicitly refuses financial execution;
neither the legacy wallet CLI nor the JS evidence auditor authorizes v14 sends.

## Exact saved-proof reuse and failure isolation

The successful grant is not regenerated. The owned local test cohort re-verifies
its exact fixed-resource Endcap and metadata, key proof, compiled fingerprint,
full ordered calls/callers/input hashes/counts, signature-domain/session preimage,
registered key, starting identity/nonce/state, current checkpoint and history
root. VM replay independently reconstructs every final contract root and checks
the accepted endpoint before advancing.

This is an offline replay of an already owned synthetic cohort, **not** a generic
wallet approval implementation or receipt-recovery protocol. A separately valid
Endcap and a public JSON declaration are not accepted as evidence of a webpage's
approved stack. The original complete-UPS generator binds its key proof to the
actual SDK session. The separate saved-Endcap verifier only verifies that
Endcap's fixed-key/common-data proof and public metadata; it does not independently
reconstruct the user-approved stack. Real wallet release gates remain intact.

Four changed contexts (checkpoint, nonce, Native balance and registered key)
reject without state/leaf advancement. An existing publication directory also
rejects without advancing; output and verified state must persist before the
in-memory continuation commits. The exact positive replay passes. Partial output
is retained, and a fresh directory is required after failure. No send, automatic
resign, replacement transaction or account-hold release is implemented here.

## Actual test coverage

Each market has funding grant, OPEN, two COVER pages, two SETTLE pages, a timeout
tail fork and an unaccepted-source-abort fork. The normal state chain preserves
the grant endpoint through all five terminal dispositions. Timeout forks start
at the genuine pre-tail leaf; abort forks start at the post-OPEN leaf. They are
alternative synthetic histories, not additional accepted outcomes on one chain.

The compiled key rejects changed code/layout/function roots, checkpoint/chain
anchor, domain, nonce, stack order and fee. Settlement also rejects shifted
cursor, omitted member, payer substitution, changed amount and U124 overflow.
AMM swap inputs have both 62-bit limbs nonzero. Shared reserves/curve state update
in deterministic order; no uniform clearing price, sharding or invoke_sync is
introduced. Tokens plus Outboxes and Native balances plus Outboxes plus exact
burns conserve on normal, timeout and abort branches.

Five public-consistency tests pass: source contains the accepted funding leaf;
stale height/nonce rejects; caller/key/fee/nonce/random-context/U124 changes reject;
all source pages, 4+1 members, three fills, two refunds and fee totals reconcile.
They are not independent ZK verification. The first auditor assumed explicit
null optional fields and operation aliases rather than actual compiled CFC names;
both failed logs remain. It now accepts the serializer's omitted-or-null None
representation and counts the actual reviewed method names. Caller, limb, state
and fee checks are retained. An added checkpoint guard initially compared an SDK
Felt with u64; the actual typed API was corrected using the exact field value,
with its failed compiler log and snapshot preserved.

## Timings, memory and costs

| Measured interval | AMM seconds | Curve seconds |
| --- | ---: | ---: |
| Per-market cold resource construction, in one process | 102.190 | 96.739 |
| Grant | 3.007 exact replay | 36.957 new complete proof |
| OPEN | 37.513 | 36.695 |
| Two source pages | 96.692 | 96.727 |
| Four-member settlement page | 193.924 | 210.762 |
| One-member normal tail | 79.395 | 77.500 |
| Timeout tail fork | 83.600 | 83.589 |
| Unaccepted-source abort fork | 31.036 | 31.069 |

AMM's logical normal intervals total 410.531 s, including current replay checking
but excluding the original grant generation and cold resource construction.
Curve's normal intervals total 458.640 s. Original AMM grant generation belongs
to the failed first process; its timing remains in the original verification
row and the replay's `originalProofSeconds`. It is not erased or represented as
a three-second newly generated proof.

The successful process, including both cold builds and alternative forks, took
1,303.852 s; the failed first process took 146.597 s. The stricter saved-proof
guard/control process took 109.216 s. Application compilation intervals remain
separate in all four build logs. These are sequential offline workloads and
not a matched before/after experiment. No actual network waiting, confirmation,
ordinary claim latency, p95, steady TPS or general speedup is measured.

Normal synthetic burns are 6,000,110,000 Native base units for AMM and
6,000,104,000 for Curve. Both fit their separate synthetic 100 PSY lifetime caps.
Actual test PSY/pUSDT expenditure is zero; QA FT/NFT do not move on a network.

The successful process's sampled child and family-sum RSS peaks are both
5,933,872 KiB (~5.66 GiB). All 1,264 samples, from the first live observation
through the final live sample, are retained in JSONL with separate process
start/exit records. Nominal interval is one second; actual gaps are recorded.
RSS includes shared pages, can miss short peaks and is not unique
physical memory or host peak. The first run and guard have separate full sample
series. A single two-market process does not establish leak freedom or sustained
service memory behavior. No memory reclamation or new cache mode is enabled.

## Remaining release work

1. Connect actual bootstrap, initialization and continuous trading into one
   current-instance proof/receipt chain; the VM initial states above are not it.
2. Add the owned native v14 proof/signing adapter, bounded fee/admission plan,
   exact-request persistence and formal Executor integration before any live send.
3. Close unused fee-treasury exit and fee-cap/service liveness. Exhausted caps
   currently require the configured ordinary owner's fresh authorization;
   these tests do not establish an owner-independent forced refund path or a
   reserved worst-case budget for every admitted order.
4. Implement and validate deterministic Book/NFT fresh activation with their own
   semantics. Preserve whole-order price/time and NFT unique/buyer priority.
5. Establish real source-inventory/window/budget fit. Eight synthetic accounts
   do not prove feasibility for all current registered accounts or censorship
   resistance before inclusion.
6. Re-run fresh live identity/metadata/resource preflight. No network reads occur
   here; the last prior height-zero observation is historical, not a new outage
   or recovery measurement. Upgrade authority, snapshot-age and cancellation
   precedence remain enforced-protocol evidence requirements.
7. Install reviewed instance resources and complete real extension approval,
   precise broadcast/unknown reconciliation, confirmation and ordinary claim/
   refund, then the current-chain dual-pool recovery and continuous operation.

The wallet branch remains unchanged at `f6b3b81`; installed release resources and
real UI writes remain closed. Multiple UPSs are staged workflows, and same-host
tests are not cross-machine coordination. Random-source finality and causal
release certification remain open. This is reviewable candidate evidence,
**not completed production acceptance**.

See [public proofs, failures, complete RSS samples and reproduction](../../executor/verification/2026-10-31-deterministic-funded-continuation-v1/README.md).
