# Three market UI completion · 2026-10-26

Current official Psy assets and psy-editorial tokens remain unchanged. English UI,
white/black/cobalt, square controls and local Geist extend the existing shell.
Seven desktop destinations become one native mobile navigation select. This is
an incremental existing-product extension; no raster redesign or external assets.

- Orderbook: whole-order buy/sell offers, rational price/checkpoint/owner ranking,
  explicit complete-offer exchange, no partial fills or maker-price change refund.
- Curve: existing integer progressive quote, buy cap/sell minimum, bounded whole
  lots, function graph (not price history), separate graduation workflow.
- NFT: fixture gallery, search, price sorting, exact purchase identity/nonce and
  two-Felt price, owned-fixture listing preview; saved listing does not publish.
- AMM: add/remove tabs; proportional withdrawal previews use existing withdraw,
  raw LP shares, owned bound, locked minimum supply and down-rounded outputs.
- Shared draft module: strict canonical recomputation, immutable previews,
  bounded separate storage, details/filter/export/local cancel. These are
  unsigned local drafts with no contract/key/chain nonce or receipt assigned.

All write controls remain disabled. Local fixture amounts and demo ownership
are not wallet balances or escrow. Minutes are local preferences, not chain
checkpoint deadlines. No new market gateway transport or live Executor is wired.

Validation: 36 frontend tests and production build pass. IAB desktop 1505×1045,
mobile 390×844 and modal 375×812 checks cover forms, duplicate NFT draft,
wrong fixture owner, exact amounts, persistence, local cancellation, Back/deep
links, skip link and modal keyboard trap. Console has no warnings/errors.
Two initial QA text assertions mismatched multiline JSON and actual validation
wording; original results retained, actual UI assertions supersede them.
Screenshots preserve both initial and final views. No financial transaction,
proof, receipt, throughput or production claim is part of this milestone.
