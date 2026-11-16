# Stag checkpoint progress gate — 16 November 2026

RPC connectivity is available, but the observed chain has not advanced beyond checkpoint **150066**. Both configured realms and the coordinator reported that same checkpoint at 14:12 UTC; a common-checkpoint holdings observation at 14:15 UTC and exact request reconciliation at **14:20 UTC** remained at150066. The original request remained unresolved with no reported lookup error and no resubmission. These observations do not identify the server-side cause.

## Original pending request — do not replay

- Sender: ordinary QA issuer **1975680**, pending next nonce **4**; last observed included nonce **3**.
- Public key: `e06e6bf131dac176d0075dc1f6ee58803f56de4aad2b081cb8fe6a8a27bb72af`.
- End-user leaf identity: `40307bcc6b663ed77f5117b01c25980217d392f33b1af4318b8ea3d30536c352`.
- Local exact request SHA256: `8a4513153c855cb3fecdbfec43a6022d41833f69c6b4272823d4716762c5676b`. This is **not** an indexed transaction content hash.
- Source checkpoint150066; original transport validity150136.
- Purpose: authorize batch1 sponsorship for AMM58/vault570752 and transfer **2.0002 test PSY** to that vault's Outbox.
- One exact send received RPC result `ok`. The bounded receipt reconciliation ended unresolved. No replacement, re-sign, second send or nonce-consuming noop is authorized.
- Services inclusion/content hash remains unknown. Current old nonce/leaf at a stalled checkpoint does not establish rejection or discard.

The issuer is durably marked held in the protected case. No further financial operation or additional market deployment should use this signer until the original identity resolves. The transaction can still execute when block production resumes.

## Current acceptance and funds

Seven UPSs are actually confirmed: Native setup, QA issuance/claims, activation funding, new SD-key vault activation at149976, and liquidity submission at150002. The AMM has **zero confirmed swaps**, zero final swap-output claims, and no browser UI acceptance.

At the observed checkpoint150066, each QA asset remains conserved as **100 units with the issuer +80 with the trader +20 pending from trader to vault =200 issued**. Vault token balances and reserves are zero; the20-unit pair is still an Outbox deposit, not spendable vault liquidity or minted LP shares. Batch readiness is1, batch ID0; the trader's add-liquidity order is open. A return or further settlement requires new confirmed network operations; none is faked locally.

Known journey fees are **7.000046 test PSY**. The pending sponsor's projected fee is not counted as confirmed expense. QA FT, test PSY and existing pUSDT remain separate; no existing pUSDT was used.

## Diagnostic result and next gate

A new diagnostics-only application build using the same frozen SDK inspected the exact issuer context at150066: user1975680, materialized nonce3/next4, expected public key and starting hash, and authenticated raw membership all matched. It generated no business/UPS proof, signature, fees or broadcast. This proves the current inspected context is valid; it does not identify the prior uncaptured startup exception, exercise start-session proving, or confirm the pending request.

The application now emits separate safe categories for add-user, start-session and approved-session failures. No guard was deleted. The SDK's latest-block metadata can precede exact checkpoint proof publication; a proof-ready source/pinned-manager follow-up remains distinct from runtime verifier/finality attestation.

Operations should restore/check stag block production and inspect reception/queue/final disposition for the exact leaf/request identity above. Public endpoints:

- https://realm0-stg.psy-protocol.xyz
- https://realm1-stg.psy-protocol.xyz
- https://coordinator-stg.psy-protocol.xyz

No keys, mnemonics, recovery files or private signing witnesses are needed. This packet does not request a Node change. After progress resumes, reconcile the original receipt first; then require the same chain anchor, dependencies/key, nonce/state endpoints, fee and complete-proof gates before adopting the sponsor alias and continuing. Never assume an expired client window cancels a potentially received request.

[Compact public evidence](evidence/STAG_BLOCK_PROGRESS_20261116_v1.json) contains digests, typed observations and the proofless inspection projection. Raw originals remain protected locally. The SDK remains `01b8f2b0a077367a7b9879baba1a72aea8ab5510`; chain anchor is `81bac9934a1c18579519b5297c94c7e7d25cb53973ac67befefe8b7a86f96b5c`.

Post-AMM work is isolated source preparation only: [Book, finite Curve and NFT candidate status](POST_AMM_MARKET_CANDIDATES_20261116.md). Forty-five scoped host regressions pass; Curve Rust fixtures and Native diagnostic unit tests have not been executed. The diagnostics binary compiled and its single proofless live inspection passed.

Final read-only check at14:32 UTC still observed both realms at150066. Final source hardening suite:47host tests pass, no failures/skips; this does not change the seven confirmed network operations or pending sponsor status.
