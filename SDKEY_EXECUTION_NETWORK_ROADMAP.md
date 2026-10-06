# SD-key automated execution network roadmap

Status: the first executor prototype is implemented under `executor/`.
It scans configured ordinary AMM, launch-AMM and orderbook users, builds guarded UPS tasks,
serializes one vault, and reconciles broadcasts through historical leaves and
included receipts. Distributed operation and user discovery are still planned.
See [executor/README.md](executor/README.md) and
[the 2026-10-05 staging report](launchamm/STAGING_TEST_2026-10-05.md).
Graduation, seeding, LP add/remove, bidirectional launch-token swaps, refunds
and funded LP removal cancellation passed on staging. All 54 user endcaps
matched included receipts; native balances, token supply and LP shares
conserved. A competing local executor was blocked, and a second user's
payment during preflight caused a safe rescan before both tasks completed.

## Goal and trust boundary

Any operator can observe eligible signed intents, construct a complete UPS call stack, prove it, and submit it. The registered SD-key fingerprint and contract guards authorize spending. An operator's server or private key must never be the sole authority to move pool or escrow assets. The network should support AMM settlements, orderbook matches and cancellations, bonding-curve settlements and refunds, then reusable task types.

## Milestones

| Stage | Deliverable | Acceptance gate |
| --- | --- | --- |
| 0. Exchange hardening | AMM order lifecycle and layout-safe update preflight; orderbook read-only state matcher | Candidate source and ABI pinned; old/new layout and method IDs checked; adversarial proof tests; no update request until chain old layout is independently verified |
| 1. Single executor | Watch configured users, build eligible call stacks, prove, submit, reconcile receipts, and restart safely | A repeated or crashed run cannot knowingly resubmit the same intent; exact payout and refund paths work for multiple users on staging |
| 2. Permissionless task feed | Index open orders and expose proofs/checkpoint with deterministic task IDs | Independent operators derive the same task ID from chain state and safely reject stale snapshots |
| 3. Multiple executors | Shared claim/lease or optimistic competing submission with bounded fee loss, backoff, and finality tracking | Two operators race the same task on staging; at most one settlement succeeds; loser stops without redirected payout or double spend |
| 4. Economics and operations | Explicit bounty/fee escrow, operator accounting, metrics, alerting, and policy-version rollout | Measured fees are covered by the authorized escrow; stuck tasks alert; policy upgrades use a reviewed layout/proof gate |

## Shared task record

Use `(network, contract_id, contract_code_root, policy_fingerprint, action, user IDs, nonces, checkpoint)` as task identity. Persist a state machine such as `observed → eligible → proving → submitted → finalized` plus `stale`, `failed`, and `needs-review`. Persist the transaction hash and pre-submit snapshot. A timeout alone must not authorize a blind retry: first check inclusion and current consumed nonce/claim cursors.

## Execution rules

- Read all authenticated state from one checkpoint and recheck immediately before submission. The contract and fingerprint still enforce recipient, amount, call order, fee burn, and replay protection.
- Keep tasks independent by user/nonce or pool cursor. Batch only when the circuit, contract, and fee model explicitly authorize the combined stack. Do not use one public SD-key user as a centralized mutable queue.
- Define who pays proof and network costs before raising the AMM's current `10,000,000` base-unit cap. The present AMM fee escrow is much larger than useful trade size.
- Verify old chain layout against the update proof before updating an existing contract. A new deployment needs an empty → new layout proof, a fresh contract ID check, and a new policy fingerprint registration when the contract ID is bound into the circuit.
- Do not assume `invoke_sync`. The existing exchange flows rely on an authorized atomic multicall and authenticated prior state.

## Immediate next work

1. Complete real PSY/pUSDT exchange and full-order matching tests through MCP
   wallets. Test funding is now received: Bob claimed 1,000 pUSDT and distributed
   1 pUSDT each to Alice and Charlie. New ordinary AMM contract 1758 and public
   vault 499200 are deployed and verified with initial LP; Orderbook 64 has completed
   two opposite-direction matches. Further ordinary-wallet payments await explicit
   authorization to add those vaults to the existing recipient policies. The separate launch market uses token 1494. Keep the immutable
   deployment proof gate and do not update contract 62.
   See [pUSDT funding and test requirements](PUSDT_TEST_FUNDING.md) for the
   receiving wallet, MCP limitations, separate AMM deployment requirements,
   and the acceptance checklist. See [the current pUSDT test report](amm/STAGING_PUSDT_TEST_2026-10-05.md)
   for included results and outstanding checks.
2. Test two machines racing the same task, abrupt process failure, unresolved
   broadcast recovery and operator costs. The Oct 5 tests cover same-machine
   exclusion and live task selection changes, not a cross-machine chain race.
3. Add indexed user discovery, distributed leases and explicit operator
   economics after those measurements. Orderbook partial fills need a separate
   custody and per-fill fee design; the current adapter matches full orders.
