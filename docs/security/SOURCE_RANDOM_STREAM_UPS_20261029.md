# Complete-source producer-seeded continuous execution

## Scope and version boundary

This continuation starts at application `67476da2c0b791d6bd7522aea8a6df236c2c4a81`
on `markets-batch-capacity-recovery-20261020`. The SDK stays mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. There are no Node/SDK changes,
old-contract updates, replacement branches, new market semantics or invoke_sync.

A new, undeployed AMM/Curve policy version **10** has profile
`source-covered-producer-random-stream-v1`. It does not replace deterministic
v5 or diagram bounded-batch v4 keys. Orderbook price/time priority and NFT buyer
priority remain unchanged. Old evidence and failed output directories are retained.

“Complete source” means every nonzero account in the authenticated account tree
at source S is classified, and all eligible final market orders in that finite
scope enter one manifest. An account's overwritten historical orders and every
raw transaction in a block are not reconstructed. This does not prove global
admission completeness, censorship resistance or comprehensive MEV resistance.

## Protocol and actual constraints

```text
source S, fixed chain/market/vault/key/epoch/window
  -> OPEN and authenticated coverage of every source account
  -> accepted complete source manifest, phase 2
  -> native checkpoint-stat draw D = S + 1
  -> complete random ordering pages, four members per page
  -> complete permutation certified, phase 3
  -> ordered settlement pages, at most four dispositions per page
  -> terminal state, all accepted authorizations consumed
  -> ordinary recipient claims its Outboxes separately
```

The new candidate fixes its window to **S + 256** in compiled code and the key.
Changing the policy alone cannot change this bound. A larger window requires a
separate candidate, key, full proof and acceptance. Source coverage is still
four accounts per UPS. Page capacity is not a total-epoch four-order limit.

The rank is Poseidon over a distinct rank tag, the complete 41-field source
scope including the full manifest, D, all four seed limbs, the original 56-bit
source index, owner, nonce and full terms commitment. Compare all four canonical
unsigned Goldilocks hash limbs lexicographically, then owner, nonce and original
index. Tie rules are deterministic. No local entropy enters this rule.

Every ordering row consumes an original member/path exactly once and appends
that same member at the current queue cursor. Pages carry the remaining-source
root, ordered-queue root, cursor and last full ranking key. A four-member page
or the terminal remainder is required. Terminal count must equal accepted count,
and the source remainder must equal the authenticated empty tree before trading.
Across pages the contract context additionally binds D, seed and refund-only mode.
An explicit installed flag distinguishes a legitimate all-zero seed from no seed.

The ordering entry's actual compiled CFC reads `GetCheckpointStats(D)` and checks
the seed. It does not accept an Executor's asserted seed as its authority. The
SD-key binds the full logical 40-call stack, actual compact invocation sequence,
caller, parameter values, source/current dependency identities, history and chain
anchor, current contract membership, nonce, signature/session context, exact fee
and public state endpoints. Input claims remain in ascending owner order; market
pricing and payouts follow the random queue. Shared reserves/supply are updated
sequentially. Full U124 amounts, existing rounding and overflow constraints remain.

| Boundary | Actual guarantee |
|---|---|
| One page UPS | Atomic updates to the signing vault's market/native/FT contract states and Outboxes; exact ordered calls and final user leaf are verified. |
| Whole accepted epoch | One immutable set and one seed, with complete ordering before trading; multiple page UPSs are not one atomic transaction. |
| Recipient balance | A payout/refund Outbox is pending until the recipient separately claims it. |
| Shared pool | Reserve/supply transitions are sequential in queue order; proof aggregation does not make same-pool pricing parallel. |
| Local competitors | A persistent local plan lock and immutable binding; not cross-machine ownership or forced service. |
| Fairness | Full disposition and one order within the authenticated finite source; no global admission/censorship or unbiased-producer guarantee. |

## Recovery and limitations

Once opened, source abort/reseal is disabled in both new bytecode and key. All
accounts must finish classification and all accepted members need disposition.
The queue cannot be replaced after seeing a seed. Already completed pricing is
never reversed at the original price.

- Before a seed is installed, expiry allows a declared **refund-only** exit over
  the original source manifest. It is not deterministic trading or another draw.
- After partial ordering, expiry allows a **same-seed refund-only rebuild**. It
  resets ordering progress, retains the original manifest and seed, reconstructs
  the one permutation and refunds every member. No new random draw is authorized.
- After ordering is complete, the remaining queue can be refunded on expiry with
  the original context. A completed first settlement page is not repeated.
- Source-time/current cancellations or invalid funding select existing refund
  branches. Confirmed dispositions and asset ownership, not cancellation ACKs,
  determine the result. Ordinary claim is a separate operation.

An individually sorted prefix is not proof that it contains the global minimum:
a malicious prefix can skip a smaller member and become unfinishable. Trading
stays blocked until the complete permutation is certified. The timeout rebuild
provides an asset-exit path, but repeated hostile prefixes can consume fees or
obstruct service. Per-page global-minimum certification or an atomic recursive
whole-permutation installation is not implemented. Application fee/attempt bounds
must stop repeated recovery rather than promise permissionless forced service.
An executor can still withhold service after learning an unfavorable result and
let the fixed epoch expire into refunds. The code does not impose a bond,
penalty or guaranteed executor availability. Refunds consume the accepted
authorizations instead of silently requeueing them with another seed; users may
subsequently make a new, explicit intent. This is a service/bias boundary, not a
completed anti-withholding protocol.

The native producer may influence or withhold its checkpoint statistic. Inclusion
under a history root is not external finality, unbiasedness or unpredictability.
An OPEN signed at S and fixed D=S+1 do not prove actual commitment inclusion before
the producer learned D. Frozen admission accepts historical contexts in ways
that do not establish that chronology. Qualified future-beacon mode remains off.
No signature, Merkle proof or local log is represented as closing those gaps.

Cancellation/expiry is checked at signed context. Application fresh-state guards
cannot force every other SD-key executor or network path to respect inclusion-tip
foreign-account cancellation. See the frozen-source admission analysis in
[paired readiness](PAIR_LIVE_READINESS_20261029.md).

## Executor integration and public planning recovery

`executor/randomSourceStream.mjs` calls the owned, sealed native
`random_stream_plan` binary. The native planner independently checks reviewed
artifact digests, complete source membership and one exact D opening under the
same pinned history root, then prepares coverage, ordering and the final queue.
It has no signing, RPC or broadcast command. The public input does not contain
an operator-selected seed or alternative draw checkpoint.

The persistent namespace binds network, chain anchor, market, vault and epoch.
It deliberately excludes seed/root/key/binary hashes: selecting different values
for the same epoch conflicts rather than creates another namespace. Inputs,
reviewed artifact copies, native binary and all output files are digest-bound.
A journal and local ownership lock protect preparation. Interrupted native
planning is replayed from the same pinned inputs into a fresh directory; original
partial output is retained and compared. Conflicting partial files fail closed.
This is not replaying, resigning or resending a financial transaction.

**A live v10 source-stream spending driver is not installed.** This public
preparation route always rejects spending. Existing v4 thin-batch runtime is not
a substitute for v10 complete-source admission, keys and exact requests. This is
an application integration deliverable, not an RPC outage or a missing Node API.

Before any new live instance: implement the owned native spending/preflight path
using the existing exact-request/receipt journal; bind reviewed actual deployed
asset/market/key identities, a fresh chain anchor and current state; independently
verify fixed-resource Endcap plus actual key/session/call binding; reserve fees,
refunds and claims; then persist exact broadcast intent before one send. Unknown
outcomes must retain original request identity and account ownership. No old
request is replayed after a chain reset and no old contract is updated to probe it.

The conservative budget derives all counts/deadlines from the native plan. It
reserves source coverage, every ordering/settlement page, excluded recovery,
three separate ordinary claims per member (native plus both FTs), and at least
one full ordering repair. Repeated adversarial repairs are outside the finite
reserve and require stopping. Initial setup, asset funding, upgrade authorization
and finality checks are separate. The historical 312-account/5-member illustrative
case needs 78 coverage UPSs and a 100-UPS reserve (100.01 model test PSY), so an
80-PSY budget fails. This is not a current-chain funding/timing measurement.
The S+256 candidate is not a claim that complete current-network coverage can
trade before expiry. Its time model is conditional on explicit proving/cadence
assumptions, not an enforced runtime or future-cadence guarantee. A fresh full
inventory and measured deadline/funding fit remain mandatory. An unfit epoch
must not be opened for trading; extending a window or aggregating coverage is
separate candidate/proof work, not a configuration bypass.

## Evidence status

Use the [public bundle](../../executor/verification/2026-10-29-source-random-stream-v1/README.md)
for final run outcomes, all retained failures, exact bytecode/key/source/binary
pins and reproduction commands. Evidence levels are explicitly separate:

1. Generator/coordination tests do not authenticate native proofs.
2. Native complete-source/Merkle planning authenticates synthetic history inputs,
   not finality or a complete spending UPS.
3. Historical checkpoint-stat CFC verification authenticates the actual historical
   read, not a complete UPS or network confirmation.
4. Full synthetic UPS verifies actual bytecode, key, signature/call context,
   Endcap and exported state against VM results. It is not a network receipt.
5. Recipient claim bytecode and synthetic conservation are not ordinary-wallet
   signed-UPS acceptance or actual wallet arrival.
6. Live deployment, network trades, signed recipient claims and live recovery
   remain unverified for v10. No financial operation occurred in this milestone.

RPC read-only checks succeeded on realm0/realm1/coordinator and observed matching
checkpoint-1 roots plus the expected full native identity. Those observations do
not authorize deployment or authenticate finality/upgrade enforcement.

There is no matched deterministic/random end-to-end performance control yet.
Offline UPS timings include real CFC/recursive/Endcap verification work, but not
submission, confirmation or ordinary-wallet arrival. Preserve cold construction,
all slow/failing runs and protocol waiting separately. RSS is sampled over the
process family, can include shared pages and is not physical-footprint peak.
No p95, chain TPS, general acceleration or production-readiness conclusion follows.

## Final acceptance results

All **32** final complete UPSs passed (16 per market). Six accepted prototype
prefixes are retained separately: 38 total accepted complete UPSs stay within
the declared 40 cap. One historical CFC probe passed. Ten targeted JS checks,
seven actual native input rejections, both actual native preparation routes and
the exact native planning-crash recovery passed. Four saved new/legacy key
proofs reverified, and twelve coherent alternative priority/duplicate/omission
signature contexts rejected without new CFC/Endcap proofs. Legacy deterministic
policy byte equality and exact original key identities are preserved.

| Offline measurement | AMM | Bonding Curve |
|---|---:|---:|
| Cold CM/key/source resource construction | 114.829 s | 106.495 s |
| Normal seven complete UPS intervals, excluding above cold construction | 540.215 s | 526.612 s |
| Synthetic normal native fee, 9 decimals | 7.000128 PSY | 7.000114 PSY |
| Normal synthetic VM trades / eligible members | 3 / 5 | 3 / 5 |
| Full final UPSs, including recovery forks | 16 | 16 |
| Network trades / signed ordinary-wallet claims | 0 / 0 | 0 / 0 |

The final 32-UPS process took **3,165.231 s**, including both cold builds,
all fork tests, VM claims and audit work inside that process. Its one-second
sampled family RSS peak was **1,622,832 KiB**; this excludes separate compiler,
prototype, CFC probe and replay processes, whose full logs/RSS are also retained.
Nested CFC/key/Endcap timings must not be summed on top of whole UPS intervals.
This is one synthetic acceptance run, not a matched deterministic/random control,
real network fee charge, confirmation latency, ordinary-wallet arrival or TPS.

Live promotion is still blocked by the application items above, especially
poisoned-prefix/fee griefing, a missing owned v10 spending driver and actual
whole-source deadline/funding fit. Honest recovery proofs do not close the
hostile-service boundary. Prefer a separately proved atomic full-permutation
installation (or per-page minimum certificate) before enabling financial writes;
that is application candidate work, not an excuse to substitute weaker entropy.
