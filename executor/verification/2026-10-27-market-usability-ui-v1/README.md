# Market usability improvements, 2026-10-27

The user authorized sequential improvements to editing persistence, liquidity
controls, field feedback and market-position presentation. The RPC heartbeat
remains deleted. No financial task or background acceptance is started.

## Phase 1: unsubmitted form persistence

Independent versioned editing records preserve Swap, liquidity add/remove/mode,
Orderbook, Curve and NFT inputs across navigation/reload. Shape, scope, version,
string length and enum allowlists are validated. Unknown fields (including nonce,
quote, balance, proof or credential fields) reject. Invalid storage preserves the
original and pauses autosave. No restored preference submits an order or becomes
a fresh quote, identity, nonce or financial authorization. Another tab's storage
change pauses writes; this is editing protection, not financial coordination.

44 frontend tests and the production build pass. Eight browser checks
confirm exact restored amounts, owner, withdrawal mode and preferences across all
market pages, including full reload and cross-tab conflict/reload recovery. Model tests cover corrupt/oversized and
wrong-scope/unsafe records; browser corruption was not injected. Later phases
will add further recovery/keyboard/mobile evidence. No keys, wallet files or
new financial operation are present. Original evidence is retained.

Sources: [editing codec](../../../dapp/src/markets/editingDrafts.mjs),
[hook](../../../dapp/src/hooks/useEditingForm.ts),
[regressions](../../../dapp/tests/editing-drafts.test.mjs).

[Phase 1 original evidence](phase1/manifest.json).
