# Two-hop AMM route

This module plans one A→B→C path across two existing AMM pools. It does not
deploy a contract, submit a transaction, or change Node.

`planExactRoute` quotes each hop with `swapQuote`, the same 0.30% floor the
U124 AMM contract checks. The second hop's input is the first hop's output.
The plan is rejected when that final floor is below the caller's minimum, the
intermediate asset does not match, a market is reused, or a hop floors to zero.

The plan is not atomic. Each hop is an existing AMM order, settlement and
claim. The intermediate asset is claimed before the next order is opened.
Orderbook, curve and NFT are not components of this path, and `invoke_sync`
is not used.
