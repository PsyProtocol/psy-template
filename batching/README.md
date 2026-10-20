# Market batch preflight

This directory currently contains **offline preflight tooling only**. No batch
market contract, batch SD-key, or automatic broadcast adapter is implemented.

- [Preflight findings, Chinese](../docs/security/MARKET_BATCH_PREFLIGHT_20261020.md)
- [Concrete V2 implementation plan, Chinese](../docs/design/MARKET_BATCH_V2.md)
- `preflight.mjs`: source hashes, current exact policy sizes, proposed call budgets.
- `../amm/u124/vm-tests/tests/batch_preflight.rs`: actual dynamic-input SD-key
  proofs + two recursive minifiers for 9/10/16/17/32 introspection slots.

Reproduce using explicit dependency and previously prepared artifact directories.
Outputs must be fresh files. None of these commands contacts an RPC or broadcasts.

```sh
node --test batching/preflight.test.mjs
BATCH_PREFLIGHT_RESULT=/absolute/fresh/sdkey-cost.json \
CARGO_TARGET_DIR=/absolute/build-cache \
cargo +nightly-2025-09-20 test --offline --locked --release \
  --manifest-path amm/u124/vm-tests/Cargo.toml --test batch_preflight -- --nocapture
node batching/preflight.mjs \
  --node /absolute/psy-node \
  --artifacts /absolute/prepared-six-contracts \
  --proof /absolute/fresh/sdkey-cost.json \
  --out /absolute/fresh/preflight.json
```

Use the existing `tests/security/prepare-six-contracts.mjs` to create fresh
artifacts if necessary. A successful synthetic authorization proof does **not**
establish market batch correctness, full UPS admission, or throughput. These
fields intentionally remain false/null in the report. Executor-selected random
numbers are not used for market ordering.
