# U124 Orderbook

Exact whole-order matching for two U124 tokens. Amounts, minimum returns and
cumulative Outbox cursors use `[low62, high62]`; native PSY pays fees only.
Original-payer cancellation, deadlines, nonces, limits and settlement races remain.

Entry points: `contract/src/main.psy.rs`, `client.mjs`. The SD-key fixes nine calls,
binds both counterparties and both asset amounts, and refunds only the payer.

See the [shared build, arithmetic, SD-key and evidence](../../amm/u124/README.md).
Fresh Orderbook **2435**, vault **1539136**, completed actual fills, refunds and
replay rejection with assets 2431/2432. Existing Orderbook 64 was not updated.
