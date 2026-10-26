# NFT Marketplace v3

Fixed-price market comprising a contract, public SD-key and existing Executor.
It binds one NFT v3 collection and one U124 payment FT, using `[low62, high62]`.
Native PSY pays fees only. NFT assets, original markets and psy-node are unchanged.

## Activation and wallet preparation

Registration alone does not materialize user/NFT/FT state or make foreign reads
provable.

1. An initiator holding NFT state and payment FT sends exactly **1.0001 PSY** and
   **one FT base unit** to the fresh vault (`activationFundingCalls`).
2. At `pool == 0`, Executor proposes `activate`. One fixed UPS claims native fee,
   ACKs initiator NFT state, claims FT, checks one-time activation, returns the FT
   seed to that same wallet, pads noops and burns fees. Failure rejects the whole
   UPS, without partial execution.
3. Activation sets existing `pool = ctx.user_id` and two funding cursors, with no
   new fields. Repeat activation, excess seed, wrong fee and used vaults reject.
   The initiator separately claims the returned FT atom.
4. List only after confirmation. Buyer `purchaseCalls` first invokes
   `NFT.acknowledge(seller)` to establish NFT state, then opens/pays the buy order.

Use `verifiedListingCalls`/`verifiedPurchaseCalls`: they verify market/asset code
and layout, registration, exact fingerprint and public-key hash derived from
public SD-key values, rejecting inactive vaults. Order fields cannot override
verified assets/vaults. Low-level `listingCalls`/`purchaseCalls` encode only and do
not establish network trust.

The NFT Executor profile requires driver `identity <policy.json>`, checking both
fingerprint and public-key hash. An ordinary-key wallet cannot impersonate a
verified public vault by faking an activation marker. Legacy market interfaces
remain compatible.

## Trading and refunds

1. Seller signs `open_listing` in their partition. The contract reads all four
   token-ID/metadata Felts and records price, deadline, nonce and next FIFO index.
   Seller funds fee escrow and transfers that exact NFT. `listingCalls` combines
   this in one user UPS, first ACKing earlier claimed deliveries.
2. Buyer signs `open_buy`, binding seller, listing nonce and price, then pays FT
   and fee escrow. `purchaseCalls` combines these in one user UPS.
3. Anyone can settle via public SD-key. Ten fixed vault calls guard orders, claim
   both fees, buyer FT and seller NFT, ACK buyer deliveries, send NFT to buyer/FT
   to seller, refund seller fee and burn actual network fees.
4. Buyer calls `NFT.claim(slot, vault)`; seller calls `FT.claim(vault)` and native
   `simple_claim(vault)` for fee return. Vault UPS atomically creates both outputs;
   it does not synchronously write buyer ownership. Claims remain separate.
5. `request_cancel` requires user authorization. Observers cannot refund an active
   unexpired order arbitrarily. After expiry anyone may execute fingerprint-bound
   refunds, always to the original seller/buyer.
6. A buyer can refund after cancellation, expiry or a cancelled/consumed/replaced
   listing. Under/overpayment returns the actual unclaimed FT delta, not a fictitious
   listed-price amount.
7. Fee-only funding has dedicated refunds. Entirely unfunded orders may
   `abandon_unfunded`; settled orders without extra pending deposits may
   `close_listing`/`close_buy`, then reopen with a higher nonce.

Both parties supply a fresh **1.0001 PSY** fee deposit. Seller's deposit returns in
full on sale; buyer's pays settlement burn. Refunds use that payer's fee deposit.
Burn must be 1–1.0001 PSY in multiples of 1000 nanoPSY; actual driver fees outside
the range reject broadcast. Small unused surplus stays in the vault, with no
arbitrary withdrawal branch.

## Concurrency and queues

- One active order per user. Nonces and vault consumed cursors prevent duplicate
  fill/refund. One listing has one winning buyer; losing buyers can refund.
- Seller→vault transfer must be exactly the next single FIFO item, matching all
  token-ID and metadata Felts.
- Vault scratch slot 0 is claimed and sent in the same settlement, holding no NFT
  between settlements.
- Vault ACKs recipient claims before sending. Four still-unclaimed deliveries
  reject the whole settlement, without charging for a missing NFT output.
- Without further trading, the recipient can fund a separate fee for
  `ack_delivery`, which cannot consume unsettled-order fees.
- Existing 128 ownership slots/four-item FIFO remain. Buyer needs a free slot;
  refund recipients also must claim. There is no forced recipient-partition claim.

## Sources

| File | Purpose |
| --- | --- |
| `generate.mjs`, `contract/src/main.psy.rs` | 14-method contract; IDs 41/42 are local fixtures |
| `policy.mjs` | Six bound branches, ten calls and fixed NFT scratch slot |
| `client.mjs` | User order/funding calls and BigInt |
| `reader.mjs` | Single-checkpoint scan and fill/refund/ACK plans |
| `abi.mjs`, `build.mjs` | ABI checks, foreign heights, fresh output and provenance |
| `../amm/u124/vm-tests/src/nft_market.rs` | Application pass: NFT height 30, FT/market 31, PSY 32 |
| `../executor/u124Adapter.mjs` | Durable submit, receipt checks and unknown-result protection |

## Build and verify

Prepare NFT v3/U124 FT artifacts and a compatible SDK:

```sh
cargo +nightly-2025-09-20 build --offline --locked --release \
  --manifest-path amm/u124/vm-tests/Cargo.toml \
  --bin compile_nft_market --bin market_wallet_verified
```

Config contains actual IDs, e.g. `{ "nftId": 41, "tokenId": 42 }`. Output must be new:

```sh
npm run build:nft-marketplace -- \
  --config config.json --market-id 1000 --out /tmp/nft-market-fresh/market \
  --compiler /path/to/compile_nft_market \
  --nft /path/to/nft/compilation_artifact.json \
  --token /path/to/token/compilation_artifact.json
node nft-marketplace/samples.mjs \
  /tmp/nft-market-fresh/market/policy.json \
  /tmp/nft-market-fresh/market/policy-samples.json
npm run test:nft-marketplace
NFT_MARKET_BUILD=/tmp/nft-market-fresh TOKEN_WIDE_ARTIFACT=/path/to/token/compilation_artifact.json \
  node --test nft-marketplace/tests/*.test.mjs
NFT_MARKET_BUILD=/tmp/nft-market-fresh TOKEN_WIDE_ARTIFACT=/path/to/token/compilation_artifact.json \
  cargo +nightly-2025-09-20 test --offline --locked --release \
  --manifest-path amm/u124/vm-tests/Cargo.toml \
  --lib --test nft_market --test nft_sdkey --test nft_layout -- --test-threads=1
```

Rust fixtures use NFT 41, FT 42, Market 1000, issuer 5.
`NFT_MARKET_BUILD/nft/compilation_artifact.json` must be matching NFT v3 bytecode;
actual mint/transfer/claim initializes test assets. Signing examples prove policy,
not real order funding.

## Executor configuration

Use existing `executor/run.mjs config.json scan|once|watch|reconcile` or service:

```json
{
  "kind": "nftmarket",
  "profile": "nft-v3-u124",
  "network": "staging",
  "contractId": 1000,
  "vaultId": 100,
  "publicKeyHash": "<registered lowercase 64-hex hash>",
  "fingerprint": "<compiled lowercase 64-hex fingerprint>",
  "codeRoot": "<market code root>",
  "layoutRoot": "<market layout root>",
  "abi": "market/compiled/abi.json",
  "driverConfig": "market/config.json",
  "policy": "market/policy.json",
  "wallet": "/path/to/market_wallet_verified",
  "rpcConfig": "/path/to/rpc.json",
  "runtimeDirectory": "/path/to/new-runtime",
  "users": [200, 201],
  "collection": {
    "contractId": 41, "codeRoot": "<NFT code root>",
    "layoutRoot": "<NFT layout root>", "abi": "nft/abi.json"
  },
  "paymentToken": {
    "contractId": 42, "codeRoot": "<FT code root>",
    "layoutRoot": "<FT layout root>", "abi": "token/abi.json"
  }
}
```

Placeholders reject validation. Startup/pre-execution binds network, all three
code/layout roots, heights, registration and fingerprint. Discovery scans explicit
users and sellers referenced by buy orders, not the whole chain.

## Acceptance boundaries

Fixed-price sales/refunds only: no auctions, bids, royalties, platform fees,
multi-collection routing or private NFT trades. Arbitrary direct NFT deposits
without orders are unsupported; extra NFTs break exact FIFO constraints. Use
combined calls. Exact fee deltas are required; post-settlement deposits may block
close. Finish an order before funding the next.

Use **new contract IDs and SD-keys**, never raw compiler output or legacy layout
updates. ABI/VM/policy proofs and CFC builds do not establish authenticated full
UPS, actual acceptance or independent audit. Deployment-ready stays false until
that instance's full preflight and receipts close.

## v2 results and initial-deployment preflight

Vault `results[user]` records last order nonce/outcome/counterparty/quote/full NFT
ID/metadata and FT/NFT/PSY output cursors. `readOrderStatus` distinguishes sold,
purchased, nft-refunded, payment-refunded and fee-only refund at one checkpoint,
reporting claims separately. New cancellation cannot attach to an old outcome.
Overwritten results return `historical-result`, not fabricated detail; durable
history needs indexing.

Cancellation is a request: historical remote proofs are allowed, so a prepared
sale can beat a confirmed request. Cancellation completes only after a confirmed
vault refund changes current caller state/consumed cursor. A first-confirmed sale
means cancellation lost. Expiry constrains proving checkpoint, not instant
invalidation of every old proof. Executor reads current state and prioritizes
cancel/expiry refunds.

Four-Felt IDs/metadata use Hash fields, retaining 17 Felts while fitting the
16-node type-DAG limit. Compiler checks canonical layouts before writing outputs;
existing contracts are not upgraded.

```sh
cargo +nightly-2025-09-20 build --offline --locked --release \
  --manifest-path amm/u124/vm-tests/Cargo.toml --bin preflight_nft_initial
node nft-marketplace/preflight.mjs --bundle /path/to/fresh-market \
  --deployer <public-deployer-hash> --verifier /path/to/preflight_nft_initial \
  --out /path/to/new-initial-review
node nft-marketplace/status-cli.mjs /path/to/executor-config.json <user-id> [nonce]
```

Preflight binds source/config/artifact/ABI/verifier hash/public deployer. It proves
old layout empty with zero fields/slots and exact new code/layout. It has no update
mode or submission. NFT height 30 and FT/market 31 share the verification library;
SDK tests reject seven root/count/code/owner/height/proof mutations.

### Read roots and write order

v2 moved local writes after validation so self-account foreign asset reads precede
market writes; those CFC reads bind entry user-contract roots. Actual listing
still conflicted after reordering, so this was not established as the root-cause
fix. VM correctness/CFC construction do not replace authenticated-state proofs.
Artifact gate rejects later self-foreign reads after local writes; scalar-array
indexes are normalized to scalar operations.

Initial deployment deduplication may use function-circuit whitelist: changed
bytecode with the same fingerprint may return an existing ID. Verify actual
code/layout roots after deployment; a marker ID alone does not identify new code.
No old deployment/proof is overwritten.

## Historical v2 acceptance: 2026-10-14

NFT 2447, U124 FT 2448 (18 decimals), Market 2451/vault 1755712 deployed/registered;
initial layout 0→22, roots and receipts match. An ordinary noop confirmed.
**Actual sale failed:** MCP listing CFC failed before broadcast. No listing or
NFT/FT/fee deposit reached the vault. Reordering/noop did not resolve it; full
fill/refund UPS acceptance stayed false. See [original report](verification/2026-10-14-continuation-01/REPORT.md).
Registration alone does not make that vault accepted custody.

## v3 root cause and verification

Readonly `nft_cfc_probe` builds witnesses without signing/broadcast. Old inactive
vault 1755712 has a zero remote leaf, while the SDK default user hash includes
`15152617885907939637`, reproducing the original failure. Activation on fresh
2452/vault 1256000 allowed the same actual-state listing CFC to verify.

`analyze <witness.json> <fresh-report>` checks remote user-leaf hashes and upper/
lower roots. Original failures/v2 artifacts remain. [v3 sales, refunds and buyer
competition](verification/2026-10-14-production-01/REPORT.md) are separate evidence.

## Release acceptance and HTTPS

`npm run verify:nft-marketplace -- --config ... --evidence ... --out ...` readonly
rechecks receipts, release hashes, public identity, actual claims, conservation,
NFT IDs/metadata. Output must be new. It requires three real participants, two
sales, one NFT refund and two FT refunds with independently verified broadcast
logs. `tests/acceptance.test.mjs` fixtures are explicit doubles, not live evidence.

Evidence version 2 requires reviewed `walletSha256`, a `guardFile` for every
sdkOperation, release coverage for RPC/guards and complete policy-branch calls.
Reports bind exact raw `callsSha256`/`guardSha256`. Old logs cannot be made accepted
by filling in hashes retrospectively; matching-version drivers must produce new
evidence. Historical reports stay intact. JSON is trusted-driver output, not an
independently signed audit.

Application reqwest HTTPS support retains certificate/hostname checks. Drivers
must support identity, not fingerprint alone. This build change does not edit
Node/MCP. Engineering acceptance never automatically sets productionReady true;
see [audit/upgrade/root/availability gates](../PRODUCTION_READINESS.md).
