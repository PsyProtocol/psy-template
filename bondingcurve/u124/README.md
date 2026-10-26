# U124 Bonding Curve

Token A supplies U124 inventory, Token B supplies U124 quotes, and native PSY pays
fees separately. `lot_size`, prices, reserves, fills and graduation amounts use
two Felts; lots remain bounded by 1,000,000. Buys, sells, stale-quote refunds and
the fixed graduation destination retain their original semantics.

Token, issuer, destination and pricing parameters are fixed by the new build;
initialization cannot replace them. The original launch-token is not changed.
Entry points: `contract/src/main.psy.rs`, `client.mjs`.

See the [shared build, arithmetic, SD-key and evidence](../../amm/u124/README.md).
Fresh Curve **2436**, vault **1014848**, completed actual buy/sell, stale-quote
refund and graduation handoff tests with U124 assets 2431/2432. Existing Curve 66
was not updated.
