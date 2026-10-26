# Psy Markets workspace

The existing React/Vite dApp provides AMM, two-pool composition, Orderbook,
Bonding Curve, NFT Market and order-center interfaces. It is a **clearly labelled
offline demo** with no live market submission, claim or cancellation service.
Connecting a wallet does not enable trading.

## Run

Use Node.js >=22.12 (validated with the existing Node.js 24.19.0) and npm:

```sh
cd dapp
npm ci --ignore-scripts
npm run build
npm run test:markets
npm run dev
```

Open http://127.0.0.1:5273. The development server binds to loopback, restricts
readable directories and denies `.secrets`, environment files, keystores and Git
contents. Do not expose it as a public trading service. `package-lock.json` pins
frontend dependencies; the chain Executor/Rust SDK has not been replaced.

## Implemented

- Single-pool AMM and the existing QA-A → QA-B → QA-A two-pool path: amounts,
  slippage, recipient, fee cap and local draft expiry previews.
- Direct reuse of `token/wide/arithmetic.mjs` and `amm/u124/client.mjs`: BigInt,
  full U124/two-Felt amounts, QA FT at 18 decimals and test PSY at 9 decimals.
  Small nonzero outputs are not displayed as zero.
- Order center, filters, exact amounts, staged demos, cancellation, original
  request reconciliation, final-output and actual-remainder claim demos.
- Intermediate Outbox must be claimed before the second hop. An exit after the
  first fill returns actual QA-B, without pretending to undo the original trade.
- Reload recovery, JSON export, desktop/mobile layouts, keyboard focus, native
  dialogs and reduced-motion support.

## Boundaries

Initial reserves, quotes, orders, transitions and pending amounts are local demo
data. QA-A/QA-B contract IDs reference existing QA instances; they are not runtime
identity authentication and are distinct from existing pUSDT. Demo paths do not
read verified balances or produce proofs, receipts, signing intents, chain nonces
or transaction hashes.

Minutes are local draft preferences, not checkpoint deadlines. Fee caps are user
budgets, not verified estimates for an entire route. Browser storage is not a
financial journal. Corruption preserves the original value and pauses autosave.
There is no financial coordination across browser tabs.

Live submission is disabled in this version, without an environment-variable
switch. The active UI has no signing/broadcast calls; the legacy TokenPanel is
not an application entry point. Future integration must use the formal
Executor/client adapters and verify network, user, nonce, expiry, contract/asset/
vault/SD-key identities, full call stack, sig_hash, fees and state endpoints.
Unknown broadcasts require original-request reconciliation. HTTP availability
and a connected wallet do not replace these gates.

The old npm SDK was used only for types and has been replaced by local browser
message-interface types, without introducing another SDK. React remains 18.3.1.
Frontend toolchain locking and server auditing are separate from chain SDK release.

## Structure

- `src/markets/domain.mjs`: demo drafts, transitions, exact amounts and closed live gate.
- `src/markets/SwapPanel.tsx`, `RoutePreview.tsx`: forms and execution-stage boundaries.
- `src/markets/OrderTable.tsx`, `OrderDialog.tsx`: order/recovery/claim demos.
- `src/markets/AssetsPanel.tsx`: separates unverified balances from demo pending outputs.
- `src/hooks/usePsy.ts`, `src/lib/psy.ts`: public wallet-account connection and cleanup.
- `design/2026-10-26`: design references and documented implementation deviations.

The historical [Token tutorial](LEGACY_TOKEN_DEMO.md) does not apply to this market
UI. Do not use its historical dependencies or deployment steps to probe old contracts.

## Brand and language

The UI and maintained project documentation use English. Logo, favicon and local
Geist fonts reuse the official psy-dapp assets. The shared `psy-editorial` theme
uses white, black, cobalt and square controls. Source hashes are recorded in
`design/2026-10-26/BRAND-PROVENANCE-v2.json`. The initial generated image,
Chinese copy and purple design remain superseded historical artifacts.

## Liquidity

Add liquidity previews two asset amounts, the exact deposit ratio, minimum LP
shares, owner ID and fee cap. It reuses `addShares` and full U124 checks rather
than a `min` approximation or an invented excess refund. LP shares are raw
internal units, without assumed FT decimals. The reserve fixture is explicitly
1:1. Remove liquidity reuses `withdraw`, raw shares, downward rounding, locked
minimum supply and owned-share bounds. Live deposits, empty-pool creation,
LP removal execution, signing and submission are not connected. The network label
is `Psy testnet`; the asset ticker remains PSY.

## Public read and planning layer

Live connection is read-only. Single-pool/add/remove-liquidity forms provide Prepare
RPC-based plan. Run `npm run gateway -- /absolute/path/to/durable-unsigned-plans`;
the UI uses a same-origin proxy to the loopback gateway on port 5274. It can read
the configured RPCs, check reviewed identities, prepare unsigned calls and look
up receipts by original end-user leaf. RPC values are observations, not state
proofs. Demo orders never become chain records.

Assets and Orders open the public read panel. A successful schema-2 RPC snapshot
renders a separate AMM account section with exact FT/native balances, vault
outputs requiring claims, unused deposits, raw LP ownership and order/queue
observations. There is no fallback to demo values. A consumed nonce does not
prove a fill, and a cancellation request does not prove a refund. Data expires
after 30 seconds; action planning always requests a fresh snapshot.

The account panel can prepare unsigned FT/native claims, admission, cancellation,
lawful release, sender-bound funding recovery enrollment and order closure.
Removal planning uses actual raw owned shares and minimums for both assets, with
no FT deposit. All actions stop at exact unsigned calls: financial submission
remains disabled. With configured RPCs returning HTTP 503, healthy account
rendering and actual on-chain actions remain unaccepted; model/HTTP fixture
tests are not chain acceptance.

`npm run test:gateway` exercises the shared client, gateway and future exact-wallet
transport seam. [Required wallet interfaces](../market-client/README.md) are still
missing: no accepted staged exact-proof/broadcast adapter or Executor control
interface is wired. Financial writes remain disabled, including after RPC recovery.

## Three-market pages and local drafts

`#orderbook`, `#curve` and `#nft` provide whole-order limit previews, integer-lot
Curve buys/sells and graduation progress, plus NFT browse/search/sort/purchase/
listing previews. The native mobile Market navigation selects all seven routes.

Orderbook exchanges complete counter-offers, without partial fills or maker-price
change refunds. Priority follows price, order checkpoint and owner. Curve reuses
`curveQuote`, rounds buy deposit caps up and sell minimums down; graduation does
not automatically create an AMM. NFT purchases bind fixture collection, token,
metadata, seller, listing nonce and full two-Felt price. Saving a listing does not
publish it.

New drafts use the separate `psy.markets.product-drafts.v1` store. Save, details,
filter, local cancel and export recompute and validate every field on reload.
Original AMM demo records are not migrated or overwritten. Draft states are only
`draft`/`cancelled`, never invented chain fills, claims or refunds. Corruption
preserves the original value and pauses autosave. Storage provides no
identity authentication, cross-tab financial coordination or financial journal.

All three pages use `local-fixture`; no contract/vault/key identity is assigned.
No new-market live gateway, proof, signature, Executor projection or financial
write is connected. Real integration still needs the wallet security interfaces,
authenticated state and end-to-end acceptance. See
[design notes](design/2026-10-26/THREE-MARKETS-v1.md) and
[verification](../executor/verification/2026-10-26-three-market-ui-v1/README.md).
