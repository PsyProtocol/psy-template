# Psy Markets: current UI specification

The initial generated concept and `DESIGN-v1-superseded.md` are preserved as
superseded design history. The user rejected the invented Psi mark and Chinese
copy, and requested consistency with existing psy-dapp frontend resources.

The current source of truth is psy-dapp's **psy-editorial** product theme, shared
by the website, Bridge, Explorer and developer platform: white paper #ffffff,
black ink #000000, neutral #fafafa surfaces, #e5e5e5 rules, cobalt #1b55f5,
square controls, black primary actions with cobalt hover, and local Geist type.
This supersedes the older dark global theme and initial purple concept.

Official PsyLogo.svg and PsyIconSq.svg and the Geist Regular/Bold fonts are copied
unchanged from `psy-dapp/apps/site/public`. See BRAND-PROVENANCE-v2.json for exact
paths and SHA256. The shared product-theme token block is reused without pulling
unrelated website selectors into the workbench. The full official Psy wordmark
is paired with a separate Markets label; no generic Unicode Psi substitutes it.

All active interface copy is English, including metadata, labels, accessible
names, validation, order stages, recovery dialogs and wallet errors. Locale is
en-US and HTML lang is en. The network label is PSY testnet; no Ethereum network
identity is implied. Network, identity and balances remain explicitly unverified.

Keep the existing workbench layout: sidebar, header, framed swap form, open
route/timeline, native order table, responsive stacked mobile layout, and native
dialogs with keyboard boundaries. QA-A/QA-B initial badges are demo asset labels,
not invented PSY/pUSDT logos. Amber denotes offline/demo warnings; green denotes
local terminal states. Controls and cards follow square editorial geometry.

The unchanged functional boundaries from the original specification still apply:
BigInt U124 with two Felt limbs; PSY fees use 9 decimals; editable unsigned
recipient and fee budget; local draft minutes are not an on-chain deadline;
explicit intermediate claim before the second hop; actual remaining assets on
exit; original-identity reconciliation; no signing, chain submit or live claim.
Wallet connection alone cannot open the live gateway.

Validation: production build, domain/provider regressions and brand/English
regressions, plus IAB desktop/mobile checks of the actual wordmark, loaded fonts,
preview, validation, Orders, Assets and recovery copy. New screenshots supersede
the Chinese v1 archive; original screenshots remain unchanged.
