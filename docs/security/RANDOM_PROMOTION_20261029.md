# Random execution promotion: minimum frontier prerequisite

## Release decision

The user authorized promotion. This is an isolated-testnet target, on
`markets-batch-capacity-recovery-20261020`, based on `416332b6`. Mainnet-beta SDK
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274` and backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d` remain frozen. No Node, old contract,
existing instance, dependency, market pricing or matching rule is changed.

Do not enable v10 financial writes merely by changing `live_authorization`.
Its known sorted-prefix poisoning and repeated-restart fee griefing are real
promotion blockers. Existing producer seed influence and missing causal
seal-before-release/finality authentication are separate boundaries; this
milestone does not supply a qualified beacon.

At entry the worktree was clean and no financial/proving job was running. Root
owns all execution. This prerequisite declared zero deployments, registrations,
faucet requests, financial operations and live instances, at most ten new
component proofs, 24 negative attempts, 2,400 seconds per test and an 8 GiB
sampled process-family RSS stop. Original artifacts are retained.

## Implemented minimum frontier component

`random_minimum.rs` supplies host preparation, circuit targets and a standalone
fixed-resource proof circuit for a poison-resistant ordering frontier:

1. Consume source members in the original authenticated 56-bit index order.
   The membership path additionally proves every lower sibling subtree empty.
   An attacker cannot insert a later source member and leave an unfinishable
   canonical-source prefix. The exact processed prefix is reconstructible from
   the source and progress counter, without relying on private executor logs.
2. Insert each member into a 24-bit owner-indexed authenticated doubly linked
   list. Prove the new owner slot empty; prove adjacent predecessor/successor
   membership and reciprocal links; compare the unchanged full-hash rank on
   both sides; update those links and the new node sequentially under exact
   intermediate roots. Only the actual head/tail may use zero sentinels.
3. Require complete source consumption before extraction. The original root,
   count, seed, list root and exact progress remain bound. Extraction can read
   only the current authenticated head and append that same full member at the
   exact next queue position. Its successor becomes the next head. Final count
   requires a zero terminal successor.
4. There is no reset transition. In the component model, N accepted members
   require N insertions plus N extractions. Every successful transition advances
   one counter, so a valid unfinished prefix remains extendable. A completed
   queue equals the existing v10 full-hash permutation exactly.

List node hashes domain-separate the full source scope, seed, original index,
owner, nonce, full terms commitment and both links. Ranking reuses v10's four
canonical unsigned Goldilocks hash limbs, then owner, nonce and original index.
No local random value, time seed, hash truncation, pricing change or U124
arithmetic change is introduced. Orderbook/NFT priority is untouched.

The circuit's raw proving method is used in negative tests to bypass host
validation deliberately: a matching JSON declaration cannot substitute for the
actual circuit constraints. The coherent skipped-source test supplies valid
membership for a later original member and otherwise recomputes consistent new
roots/head/tail. The minimum constraint rejects it.

## Evidence and precise limits

The native loader independently rechecks the prior public synthetic source and
reviewed artifact digests before planning. Five members give ten verified
component proofs. The final formatted source verifies those same ten original
proofs and their exact public endpoints, without regenerating them. Both runs
reject seven cases: extra progress, seed replacement after insertion, a valid
non-head node, skipped successor, repeated extraction, extraction before source
completion and a coherent skipped original minimum. Fourteen total negative
attempts remain within the declared 24 bound. Reports distinguish proof creation
from saved-proof replay.

This is **not** a market authorization, native checkpoint-stat proof, SD-key
signature, Endcap/UPS, recursive aggregate, network receipt, ordinary-wallet claim
or new deployed key. Continuity of these component proofs is audited through
exact public before/after states; no recursive whole-chain certificate is
claimed. A future financial key must embed the targets and bind actual contract
continuity, calls and native seed authentication. Its current live gate stays off.

The 3.56-second original test and per-step component timings are not full UPS,
confirmation/arrival performance or a before/after market speedup. The original
process lasted 4.223 seconds with sampled family RSS 598,080 KiB. Final saved-proof
replay lasted 2.147 seconds with sampled family RSS 517,376 KiB. Separate release
builds lasted 54.852 / 52.865 seconds. RSS includes shared pages and is sampled,
not physical peak. Exact logs and all samples are in the evidence bundle.

Seven fresh read-only RPC calls succeeded. Sequential observations were realm0
15168, realm1 15168 and coordinator 15169; this one-checkpoint difference is not
represented as a simultaneous snapshot. Checkpoint-1 roots agreed, and the
observed full native code/layout/function identity remained the reviewed one.
These observations do not establish finality, upgrade authorization or deployment
readiness and do not send any financial request.

## Required integration before deployment

| Gate | Current status |
|---|---|
| Conditional complete-list construction and exact minimum extraction | Implemented; ten standalone proofs plus raw-circuit attack rejection |
| Existing v10 calls/keys | Unchanged constraints; new helper visibility does not activate them |
| New contract/key binding for every minimum transition | Pending; no replacement key is registered |
| Whole source, native seed, exact stack/session/sig_hash, nonce, fee and endpoints in one UPS | Must be revalidated under the replacement profile |
| Permissionless fee authorization | Must review epoch admission, empty-order epochs, maintenance and aggregate fee limits in contract/key; an Executor-local budget is insufficient |
| Fresh source, funding and deadline fit | Pending; an unfit S+256 epoch cannot be opened or truncated |
| New actual-instance resource matrix and owned exact broadcast/recovery driver | Pending |
| Real deployment, fills, ordinary claims and failure recovery | Not attempted; zero financial operations |

In particular, finite minimum transitions alone do not prove that every possible
OPEN/maintenance path has a sponsor-approved total fee budget. This broader
permissionless fee boundary needs an explicit key-level admission review and
rejection tests; it is not declared fixed by the component result. Do not put
an unbounded native float behind a public SD-key on the strength of an off-chain
Executor budget.

The next candidate must embed this frontier under actual contract state,
retain deterministic recovery/refund rules and one native seed, close fee
admission, then pass actual bytecode plus complete UPS testing before new isolated
instances are funded. No deployed market is modified to probe compatibility.
See [public evidence and reproduction](../../executor/verification/2026-10-29-random-minimum-promotion-v1/README.md).

Compatibility follow-up: the new application source reverified both original v10
key proofs with unchanged fingerprints and rejected six coherently changed
priority stacks/signature contexts. No CFC or Endcap was regenerated. Together
with the fourteen component negatives, twenty rejected attempts stay within the
24-attempt bound. This checks compatibility, not replacement-key readiness.
