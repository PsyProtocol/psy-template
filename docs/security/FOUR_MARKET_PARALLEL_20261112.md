# Four-market parallel continuation — 12 November 2026

## Ownership and preserved scope

The root and three market agents used all four available concurrent slots.
The root alone owns financial/proof execution; the other agents perform isolated
source work, light host checks and peer review. This reduces serial engineering
work without overlapping account ownership or starting competing provers.
No measured speedup or cross-machine coordination is claimed.

The same branch and frozen mainnet-beta SDK `01b8f2b`/client `70580700` remain.
No Node, wallet repository, old contract, pricing or matching rule is changed.
Selected-order deterministic batches do not prove whole-market inclusion. No
global account scan or new market mechanism is introduced.

## Implemented and reviewed

| Component | Changes | Remaining acceptance |
| --- | --- | --- |
| AMM | Formal core journey, hash-bound adoption of already included preparation, exact one-send key registration, public-only diagnostics and bounded pre-call checkpoint-proof readiness recovery. | Current vault activation, LP, swap, output claim and cancellation/refund journey remains running/incomplete. Browser/UI remains unaccepted. |
| Curve | [Fresh builder](../../bondingcurve/u124/core-build.mjs) and [ordinary client](../../bondingcurve/u124/coreClient.mjs) pin the fixed release/domain/chain/config, actual issuer/graduation recipient roles and U124 bounds. Compiler API/domain, foreign-read audit and ordinary method arities are checked. | New compiled bytecode/key complete UPSs, formal native/Executor profile dispatch and current-chain lifecycle. Host fake compilation is not native compilation. |
| Book | [Fresh builder](../../orderbook/u124/core-build.mjs) and [ordinary client](../../orderbook/u124/coreClient.mjs) preserve whole-order terms, both limbs and exact deterministic configuration. Raw artifact bytes are preserved. Intended vault metadata is not advertised as cryptographic binding. | Native/Executor dispatch and current-instance compilation, key, complete UPSs, matching/refund/ordinary claims. Priority is within the authenticated selected scope, not all market orders. |
| NFT | [Unsigned plans](../../nft-marketplace/coreClient.mjs) validate observed NFT words, listing nonce/price, delivery capacity, FIFO claims, fees and deterministic config. | Caller observations are untrusted. A future native/wallet consumer must compare expected NFT identity against the exact UPS source. Selected-order bootstrap/key/Executor integration remains closed. |

Independent reviews identified and fixed Book client domain/config validation,
Curve compiler-interface/domain/audit and missing ordinary-ABI checks, and NFT
deterministic/config guards. Existing contract and SD-key settlement constraints
remain authoritative; unsigned helpers are not a substitute for those constraints.

NFT listing/claim ABI does not carry expected identity words. Returning
`sourceIdentityCheckRequired: true` does not itself implement that check. The
zero-argument cancel method targets the owner's active order when executed; it
cannot be represented as cancellation of a signed specific nonce.

## Validation and current network result

[Compact checks and source index](evidence/four-market-parallel-20261112.json)
records two disjoint host cohorts: **80/80** and **12/12**, no skips or failures.
They cover candidate builders/clients, formal mock recovery, wrong identity,
stale windows, materialized-proof readiness, preserved frozen refunds, unknown
broadcast handling and bounded retries. They do not generate native proofs or
perform network payments. Native diagnostic unit and build evidence remains in
the separate [AMM registration report](AMM_CORE_REGISTRATION_20261112.md).

AMM **51**, assets **49/50**, vault **1182848** are the only selected current
instance. Issuer setup, initial ordinary claims and activation funding are
confirmed. The first vault attempt stopped before calls because a user-tree
proof was unavailable; its later availability is recorded, without claiming
consensus finality. The root's versioned continuation preserves all old inputs,
failures and confirmed requests. No old payment or unknown broadcast is retried.

The continuing real journey uses its original one-vault/two-actor, 60 test-PSY,
40 complete-UPS, wall-time and memory limits. The registration/diagnostic/build
history remains outside source Git. Only compact public summaries and hashes are
committed; no private signer, witness, proof blob, SDK tree or executable is added.

## Next gates

1. Finish the single owned AMM journey and independently audit its complete
   UPSs, receipts, fees, terminal orders, actual refunds and asset conservation.
2. Integrate the reviewed selected-order Curve/Book/NFT interfaces into native
   and formal Executor dispatch, one bounded case at a time. Validate actual
   bytecode, dedicated key and full UPS before registration/funding.
3. Keep browser writes and qualified random ordering closed until their distinct
   binding/source/finality and real acceptance requirements are satisfied.

Historical synthetic proof cohorts and earlier-chain fills remain evidence for
their original scope. Neither this test count nor a local improvement establishes
current UI usability, throughput or production readiness.
