# pUSDT funding and integration acceptance

Historical funding: on October 5, 2026, the user sent **1,000 pUSDT** from user
90112 to Bob 1283072, included at 160793. Bob's MCP claim confirmed at 160813.
Bob sent one pUSDT each to Alice/Charlie, who separately claimed through MCP.

## Assets and baseline

No additional transfer was needed for that round. Bob: Psy-01283072, user 1283072,
Psy Sepolia staging. pUSDT is contract **4**, six decimals (1,000,000 atoms/token).
Native PSY is **0**, nine decimals.

Public sends need sender Psy user ID and receipt; Bob uses `claim_all` with sender
and `token: "USDT"`. Send inclusion and spendable receipt are separate. Private
sends require MCP recipient details/note delivery and a separate claim receipt.

At baseline **160847**: Alice 1882112 held one pUSDT, Bob held 998, Charlie 861696
held one. No pending assets between them and the Orderbook vault. Ordinary writes
used MCP in included-receipt order.

## Faucet/bridge boundary

Installed `claim_faucet` issued only test PSY with no token selector. The bridge
UI's EVM pUSDT faucet calls `TokenFaucetManager.claim(token)`, then Router bridging,
relayer proof and a Psy claim. MCP deposit requires an owner-configured L1 signer;
`PSY_MCP_L1_KEY` and temporary L1 metadata were absent. There was no direct MCP
pUSDT faucet method. A public Psy faucet endpoint would need separate verification.

Never send keys, mnemonics or recovery files through chat. L1 signers belong in
the owner-controlled wallet service. No old-wallet keys or restricted token-4 mint
were used.

## Market boundaries

| Instance | Historical boundary/action |
| --- | --- |
| Launch AMM 1503 / vault 773632 | Fingerprint fixes token 1494, Curve 66 and source vault; claim/transfer ABI. Preserve; replacing token ID with 4 is invalid. |
| Old AMM 59 / vault 1347584 | Nine-method deployment. New local lifecycle candidate was not proof of deployed state; use independently verified 1758/499200 for this round. |
| New AMM 1758 / vault 499200 | 22 fields, 14 methods, close/overwrite guards and expired paid-LP-removal cancellation; independent compile/layout proof/deployment/roots/registration completed, two-vault policy authorization applied, multiuser swap/LP/refund/conservation accepted. |
| Orderbook 64 / vault 591872 | Existing PSY/pUSDT whole-order/refund instance; recheck roots/fingerprint, then use new orders/nonces. |

pUSDT 4 uses simple_claim/simple_transfer, unlike token 1494. Verify ABI, decimals,
full calls/fingerprint, not just config IDs. Local candidate source is not chain
state. Initial deployments require independent code/layout recomputation, ABI,
empty→new canonical proof, durable intent, one broadcast and post-inclusion roots.
Do not use/update 62/63; retain original artifacts/hash lists.

## Historical acceptance sequence

October 5 completed claims, deployment, two Book pairs and AMM initialization.
October 9 completed remaining cases after explicit authorization to add only the
two vault recipients. [Final follow-up](amm/STAGING_PUSDT_TEST_2026-10-09.md).
Cross-machine competition remained separate.

1. Claim through MCP, retain included receipts/balances/pending, fix a common baseline.
2. Alice PSY/Bob pUSDT whole pair on Book 64, claim/close, reverse direction, then
   expiry refunds in each asset only to the original payer.
3. Each Book order pays principal/fee escrow **1,000,100,000 nanoPSY**; amount cap
   **10,000,000 base units**. Equal atomic counts do not mean equal token values.
4. Independently compile/prove/deploy/register AMM before initial LP, bidirectional
   swaps, add/remove, both refunds, close/reopen and paid-removal cancellation.
5. At least three ordinary MCP wallets, duplicate tasks, changing state and unknown
   broadcasts: no duplicate payment or third-party output.
6. All orders closed/broadcasts resolved. PSY plus pending plus actual burns must
   match baseline; pUSDT plus pending conserves; LP supply equals holders+locked.

Archive source, artifacts, layout proof, exact requests/receipts/calls/baselines
and hashes separately. The [54 October-5 launch trades](launchamm/STAGING_TEST_2026-10-05.md)
used token 1494, not pUSDT.

## Evidence and outcome

- [MCP balances/wallet observations](launchamm/deployments/pusdt-funding-check-2026-10-05/).
- Readonly source checks: sibling MCP private_tools.rs, claims_tools.rs, l1.rs;
  installed listTools separately checked. Bridge FaucetPage.tsx supplied L1 flow.
- [Deployment](amm/DEPLOYMENT_READINESS_2026-09-28.md),
  [lifecycle candidate](amm/STAGING_LIFECYCLE_CANDIDATE_2026-09-30.md),
  [Book amount/fee/calls](orderbook/operationCalls.mjs).

Earlier zero-balance observations remain historical. Funding came from the user,
not minting or ordinary-key access. The 58 follow-up UserEndcaps all matched
included receipts; orders, pending assets and unresolved broadcasts cleared.
pUSDT and PSY-plus-burns conserved. MCP/client work completed, but five historical
policy diagnostics still blocked switching the installed service at that point;
see [interface review](MCP_PAYMENT_POLICY_REVIEW_2026-10-09.md).
