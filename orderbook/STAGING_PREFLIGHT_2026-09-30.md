# Orderbook contract 63 staging preflight — 2026-09-30

No contract deployment, escrow registration, signed transaction, or asset transfer was submitted in this preflight.

## Chain and deployment artifact

- Psy Sepolia staging advanced from checkpoint `87717` to `87787` during the check. At both reads, `next_contract_id` was `63`.
- Contract `62` has a 17-field layout with root `bbef9ad2b2c993db2102e7d6bf239d6a1b0483cc47be2911224bb53497189fd3`.
- The prepared contract `63` deploy request at `/private/tmp/psy-orderbook-deploy63-command-preflight.json` passed `check_deploy_layout.mjs`: its layout proof endpoints are empty layout (0 fields) to the 17-field layout. The canonical layout proof was cryptographically checked separately with the canonical verifier and fingerprint `f2be754869220ac3bd68cfba16bbfdf50159cd667c3b445efb0adf807d175e9f`.
- The current compiled contract has five methods. The live contract `62` has one additional `debug_order` method, but its other five method entries, including `cancel_order` and `match_orders`, are byte-for-byte identical to those in the prepared `63` deploy request.

## Local checks

- `node --test orderbook/*.test.mjs`: 10 passed.
- `cargo test --offline --manifest-path orderbook/sdkey-circuit/Cargo.toml --lib` with the existing shared target directory: 2 passed.
- A complete six-call PSY cancellation stack was run against the live contract `62` with `ORDERBOOK_PROVE_ONLY=1`. This flag returns before SD-key signing and transaction submission. The first call, `cancel_order`, failed during function-circuit proving:

  ```text
  Partition containing Wire(Wire { row: 631, column: 59 }) was set twice
  with different values: 0 != 16463394126558395459
  ```

Because the failing method bytecode and layout are the same as the proposed `63` contract, this is a deployment gate failure for functional testing. The SD-key unit tests establish policy binding, but do not prove the orderbook contract method. No real-asset cancellation or matching test was attempted.

## Next step

Reproduce and fix the `cancel_order` function-circuit inconsistency in an isolated local test environment, then prove complete cancellation and matching stacks without submitting them. Rebuild the deployment artifact and its empty-to-new-layout proof from the corrected source. Recheck the live `next_contract_id` immediately before any staging deployment. Contract `63` requires a new SD-key escrow fingerprint and account; the existing escrow for contract `62` cannot be reused.
