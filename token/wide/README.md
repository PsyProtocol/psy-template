# Two-Felt public token (U124)

This independent public token was deployed as assets **2431/2432** and used in
actual settlement across the three U124 markets. Amounts use `[low, high]`:

```text
amount = low + high × 2^62
0 ≤ low, high < 2^62
maximum base-unit amount = 2^124 − 1
                         = 21267647932558653966460912964485513215
```

At 18 decimals the maximum is **21,267,647,932,558,653,966.460912964485513215 tokens**.
62-bit limbs bound addition/carry intermediates by `2^63−1`, below Goldilocks.
This is not uint128/uint256. Balances, supply, cumulative sends and allocations
all use two Felts.

## Implementation

- All 20 public methods remain: metadata, supply cap, mint, burn/settle,
  transfer/claim, batch transfers, original-payer refund and cooperative revocation.
- Balance, total_minted/supply, max_supply, burn_requested/settled, Outbox
  sent/claimed and delegation allocation/spent use two limbs.
- Explicit bit decomposition/weighted reconstruction enforce ranges. Carry comes
  from the 63-bit low sum; bitwise comparison determines borrow. The limbs are
  never combined into a single arithmetic Felt; no invoke_sync is used.
- Payer, issuer, version and cooperative-close checks remain. User IDs are 24-bit,
  channel indexes 4-bit and channel versions 62-bit.
- `arithmetic.mjs` parses/displays 0–18 decimals with BigInt; `callBuilder.mjs`
  covers the complete public ABI.

`set_metadata` retains public-token administration: the issuer can change metadata
until authority renunciation. Revocation still needs spender cooperation; it is
not unilateral. This public profile has no private-note methods. The separate
[private profile](private/README.md) retains public APIs and adds private transfer/
claim with a distinct height-32 layout. Deploy it freshly; do not overwrite this
profile's existing instances.

## Calls and precision

```js
import {parseUnits,losslessJson} from './arithmetic.mjs';
import {createTokenCallBuilder} from './callBuilder.mjs';

const token = createTokenCallBuilder(42); // Replace with a fresh deployment ID.
const amount = parseUnits('1000000000.123456789012345678',18);
const call = token.transfer(200,amount);
const wire = losslessJson(call); // Both limbs remain exact JSON integer literals.
```

62-bit limbs can exceed safe JavaScript Number range. Never convert limbs to
Number or parse large integers with ordinary JSON.parse before reserialization.
Rust u64 JSON inputs accept the exact integer text. Readers must retain integer
text or use BigInt-aware JSON. Wallet/SDK layers accepting only safe Numbers need
this encoding before sending large U124 values.

## Build and test

Run from repository root with adjacent SDK source and local Cargo dependencies.
Output directories must not exist. Issuer ID is explicit for each fresh build;
old token issuer configuration is not modified.

```sh
node token/wide/generate.mjs --check
npm run test:token-wide
npm run test:token-wide:vm
npm run build:token-wide -- /private/tmp/token-u124-new --issuer 1239104
```

`TOKEN_WIDE_COMPILER=/path/to/offline-compile` selects a frozen compiler binary,
whose arguments are `<source> <new-output-directory>`. The default is this
project's Rust wrapper. Issuer 5 in `src/main.psy.rs` is a local fixture; real builds
need the registered issuer. Build checks always return `deploymentReady: false`.

[Local verification](verification-2026-10-12/REPORT.md) uses only
`verification-2026-10-12/compiled-reviewed/` as its final fixture. Other attempts
remain diagnostic evidence.

## Deployment and compatibility

Fresh instances completed actual market settlement after the initial offline
checks; see [settlement evidence](../../amm/u124/deployments/staging-2026-10-12/continuation-2026-10-13/REPORT.md).
Layout/ABI are incompatible with single-Felt tokens. Use new IDs; migration of old
balances requires a separate design, never an in-place overwrite.

PSY 0/pUSDT 4, network fees, bridge and legacy consumers retain their current
interfaces. [U124 AMM/Orderbook/Curve](../../amm/u124/README.md) support full limbs
and wide-integer pricing with fresh-instance settlement. A chain-level native
migration would require coordination across precompiles, SDK, wallets, bridge
and existing consumers.

Arithmetic proofs/local VM checks do not establish full state CFC, UPS or actual
asset acceptance. Do not claim production readiness before those gates close.
