# NFT seller client continuation — 11 November 2026

NFT Market remains part of the four-market core delivery. The new
`nftAccountListingCalls` helper complements the reviewed v21 ordinary buyer
helper, using the frozen mainnet-beta SDK
`01b8f2b0a077367a7b9879baba1a72aea8ab5510` and current Native `transfer` ABI.

The seller's approved call sequence acknowledges older claimed NFT deliveries,
opens the exact listing, funds the fixed Native escrow and transfers the owned
NFT slot to the selected vault. Full U124 prices, slot range, positive nonce and
deadline bounds are validated. Explicit v21 policy, market, asset configuration
and Native interface are required. Preparation does not replace acknowledgement
or introduce a token loan. The existing fixed price, FIFO/metadata, buyer
priority, unique sale and original-recipient refund rules do not change.

The helper constructs calls only. It does not authenticate contract identity from
ABI, claim wallet approval, validate a complete proof or enable broadcasting.
Actual code/layout/function roots, collection/key/vault identity, exact SDK stack,
session/sig_hash, nonce, state, expiry and fee gates remain the responsibility of
the native policy/Executor and wallet approval interfaces.

Reviewed-artifact policy tests and formal adapter refusal/recovery tests pass
34 checks. A separate legacy-client module initially fails because its
`BATCH_BUILD` fixture was omitted. Only that module is rerun against the frozen
fixture and passes five checks. There are no unresolved failures in this scoped
cohort. Formal adapter tests use explicit transport doubles; they are not real
network or browser payment evidence. The preserved configuration failure is not
deleted or presented as a passing run.

The earlier [NFT v21 acceptance](NFT_ACCOUNT_BOOTSTRAP_20261104.md) still consists
of fifteen conditional vault UPSs and one **separate** ordinary buyer UPS. Those
proofs are not regenerated or spliced into a seller-to-final-claim history.
Connected ordinary seller/final-claim complete UPSs, fresh-instance registration,
real unique sale/refund and ordinary/browser claiming remain open.

There are no Node, SDK, old-contract or wallet changes, and no financial action.
See [compact source/artifact/test evidence](../../executor/verification/2026-11-11-nft-client-v1/README.md).
Raw logs remain in `psy-market-recovery-20261023/markets-core-acceptance-20261111-v1`;
Git contains only small English reports and public hash inventories.
