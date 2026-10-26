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


## Phase 2: liquidity editing controls

Example 1:1 deposit linking uses exact BigInt token units and rejects unknown
example pool IDs. Its independent preference survives reload. It is never used
for RPC reserves. Both maximum-wallet-balance buttons remain disabled without
verified balances. Removal explicitly selects an example position; 25/50/75/Max
shortcuts floor raw integer shares, while verified-wallet position selection
remains unavailable. No LP ownership, wallet balance or live quote is invented.

46 frontend tests and the production build pass. Five browser checks cover exact
linking, manual preference restoration, raw-share percentages and disabled live
balance/position controls. [Phase 2 evidence](phase2/manifest.json).


## Phase 3: field-specific error recovery

Shared local validation identifies amount/fee precision, positive quantities,
owner/recipient IDs, example ratios, raw shares and whole lots. Preview submits
focus the first invalid control in document order. An alert summary links to
specific controls, with aria-invalid and real description targets; correction
preserves unrelated values. Reset clears stale validation. NFT purchase/listing
settings share the same mechanism. Original preview/domain and live planning
checks remain; these usability checks are not an authoritative contract check.

49 frontend tests, production build and 11 browser checks pass, covering all six
forms, error links, exact corrected previews, reset and mobile focus/reflow.
No screen-reader conformance, live RPC/UPS or financial acceptance is inferred.
[Phase 3 evidence](phase3/manifest.json).
