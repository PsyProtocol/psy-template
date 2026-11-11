# Explicit initialization of new NFT collection accounts

`account-initialization.mjs` creates a **new collection candidate** from the
reviewed canonical NFT source. It preserves every old compiled method, ABI
field, authenticated layout entry, NFT identifier and FIFO structure. It adds
only `account_version` at slot `603980958` and the zero-argument
`prepare_account` method. The method accepts versions zero or one and writes
one; it cannot mint, burn, transfer, change authority or advance a queue cursor.

This gives an account with no owned NFTs a real, authenticated collection state
before another contract reads its empty balance or FIFO words. It addresses
the frozen SDK's absent-root/zero-only export boundary without fake balances,
fabricated historical roots, temporary NFT loans or weaker market checks.
Repeating preparation is idempotent for a supported account version.

It is not an update or migration of an existing collection. Existing assets
and v19 policies retain their original identities and startup gate. The v21
market route requires a new reviewed collection, new key and new vault. A
matching method name or ABI alone is insufficient: code, layout, function root
and instance-specific resources still have to match.

The build entry point is `batching/checkpoint-stream/nft-bootstrap-build.mjs`:

```text
node batching/checkpoint-stream/nft-bootstrap-build.mjs \
  REVIEWED_CURRENT_FIXTURES nft/src/main.psy.rs \
  FROZEN_COMPILE_QA_NFT COMPILER_SHA256 FRESH_OUTPUT
```

It first recompiles the original collection and requires byte-for-byte equality
with the reviewed original artifact. It then compiles and validates the new
collection, preserves the original market bytecode, and generates a distinct
v21 policy. Outputs never authorize broadcasting by themselves.

The explicit buyer helper `nftAccountBuyCalls` prepares the collection account,
opens the original NFT purchase intent and funds its fee/payment. The market's
existing sent-versus-claimed deposit, listing, price and nonce checks remain.
Preparation does not acknowledge older claimed outgoing NFT queues; ordinary
collection acknowledgement remains available for that housekeeping. The legacy
buyer helper keeps its previous acknowledgement behavior by default.

The v21 seller helper `nftAccountListingCalls` requires the same explicit
reviewed profile/market/asset configuration and current Native ABI. It preserves
acknowledgement of the seller's older claimed deliveries, opens the listing,
funds the exact Native escrow and transfers the owned NFT slot in order. It does
not replace acknowledgement with preparation or add a token loan. Full U124
prices and slot/nonce/deadline bounds are checked before constructing calls.
These helpers construct calls only; matching ABI is not identity authentication,
wallet approval, a complete proof or a network receipt.

Synthetic full UPSs, network confirmation, ordinary signatures, approved wallet
call-stack verification and browser acceptance are separate evidence gates.
See the dated team review entry for the acceptance status of this candidate.
