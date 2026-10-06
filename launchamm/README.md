# Graduation-seeded launch AMM

The curve guard owns launch pricing, inventory and graduation. The AMM guard
owns reserves, LP shares and signed swap/add/remove intents. Each public SD-key
authorizes a complete UPS, including the fee burn. Ordinary wallets sign their
own intents and payments through MCP.

The AMM ABI preserves all 26 curve fields as a prefix. It authenticates the
source curve's graduated state, issuer, asset, target and exact outgoing
payments. Initial LP belongs to the fixed issuer, with 1,000 shares locked.
Source contract, source vault, issuer, token and trading scales are fixed in
the AMM fingerprint. `register_pair` predicts consecutive registration IDs,
then verifies both actual mappings. A race prevents funding.

## Units

Reserves and amounts are bounded trading units, up to 10,000,000. Transfers
use base units: `psyAmount * psyUnit` and `tokenAmount * tokenUnit`. The seed
must divide exactly. At the staging scales 1,000 nanoPSY and 1,000,000 token
base units per trading unit, graduation of 300,003,000 nanoPSY and 3,000,000,000
token base units becomes reserves 300,003 and 3,000. It mints 29,000 issuer LP
shares and locks 1,000. This does not manufacture PSY.

Every operation reserves 1,000,100,000 nanoPSY for its public execution. Actual
burn is 1 PSY plus bounded DA fees; the small unused allowance stays in the
vault. Swaps and LP adds can refund their paid assets to the original payer.
A funded LP removal can be cancelled without changing shares or reserves.

## Build and verification

From `psy-template`:

```sh
LAUNCH_AMM_OUTPUT_DIR=/tmp/new-launchamm-candidate npm run build:launchamm
npm run test:launchamm
cargo test --offline --release --manifest-path launchamm/sdkey-circuit/Cargo.toml --lib --test compiled_handoff --target-dir ../psy-node/target
cargo build --offline --release --manifest-path launchamm/sdkey-circuit/Cargo.toml --bins --target-dir ../psy-node/target
```

`contract/target` retains the first 14-method candidate. `contract/target-v2`
contains the 15-method candidate with LP removal cancellation. Tests explicitly
use v2. Deployment evidence is immutable in the dated deployment directory.

`deploymentGate.mjs` checks a prepared **new deployment** against independently
regenerated code/layout roots and the expected deployer. `review_deploy proof`
cryptographically verifies the canonical proof. `deployThroughMcp.mjs` runs as
the existing MCP deployment tool's child, under its wallet policy; it submits
the exact reviewed request once and saves its intent and receipt. It refuses
an already included identical deployment. No contract update is performed.

See [executor](../executor/README.md) for automatic settlement. The planner
settles one eligible UPS at a time, then reads fresh reserves. It waits on
slippage or missing funding and refunds eligible expired deposits. It uses
`invoke_deferred` and complete call stacks; `invoke_sync` is not required.
