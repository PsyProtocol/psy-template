# AMM multi-round test report (2026-09-29)

## Executed

- `node --test psy-template/amm/*.test.mjs`: 19/19 passed.
- `cargo test --manifest-path psy-template/amm/sdkey-circuit/Cargo.toml --lib`: 2/2 passed. The proof test accepts a refund to its payer and rejects a redirected recipient, an inserted transfer, and an excessive fee burn.
- The new deterministic model tests ran 50 rounds with four simultaneously open payer orders per round: 150 swaps and 50 unclaimed-payment refunds. They checked cumulative claim deltas, exact refund recipients, replay rejection, constant-product monotonicity, and vault accounting after every operation.
- Another 20 LP add/remove cycles checked shares, the permanent 1,000-share lock, pending payouts, and accounting.
- The reference SD-key policy accepted all nine transaction branches across ten rounds and rejected each attempted output transfer to an unrelated recipient.
- Staging chain remained reachable; its latest checkpoint read during this run was 80631. No signed transaction was submitted in this run.

## Findings and limits

1. The deployed AMM contract currently permits a payer to replace an unresolved order in that payer's partition. `open_swap`, `open_add`, and `open_remove` check only `nonce > self.order_nonce` before overwriting the order fields. If payment for the old order has already been sent, subsequent pool settlement/refund refers to the new order and may be unable to account for that old payment. The model refuses competing orders, but that safety rule is **not** present in the deployed contract. This requires a contract design change and redeployment before claiming same-payer concurrency safety.
2. The executable pool model previously allowed a non-proportional LP add with an unused-token refund. The deployed `add_liquidity` method rejects it with `deposit ratio mismatch`. The model and its test now match the deployed exact-ratio rule.
3. These are deterministic local model and policy tests, not 200 live chain transactions. The prior Alice/Bob signing fixture under `/private/tmp` had been cleared, and the available Psy keystores are encrypted. We could not safely submit another real PSY/pUSDT cycle with those identities in this run. The 2026-09-28 deployment report contains the earlier successful real-asset end-to-end cycle.
