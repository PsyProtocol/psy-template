# NFT seller client integration — 11 November 2026

The v21 ordinary seller helper uses the current Native ABI and preserves
acknowledgement, listing, fee funding and exact NFT-slot transfer order.
Reviewed-artifact tests reject wrong policy, market, assets, Native protocol,
zero/overflow price, invalid slot and nonce/deadline substitutions. These calls
do not authenticate code/layout or wallet approval by matching an ABI.

The first grouped host run has 34 passes and one fixture-configuration failure
in a separate module. Only that module is rerun with the frozen artifact and
passes five checks. The failure log and samples remain unchanged outside Git.
Formal adapter tests use explicit transport doubles, not network payments.

No NFT proof, deployment, financial send or wallet modification occurs here.
Existing 15 vault UPSs and one separate ordinary buyer UPS remain historical
synthetic evidence. Ordinary seller/full final claims, connected network
settlement and browser approval remain open. Node/SDK are unchanged.

RESULTS.json contains only source/artifact/log hashes and scoped results.
No proof dumps, SDK copies, keys, mnemonics or signing witnesses are published.
