# Orderbook proof fix and staging verification — 2026-09-30

Network: Psy Sepolia staging. Amounts below are token base units. No psy-node source was changed.

## Final deployment

| Item | Verified value |
| --- | --- |
| Corrected orderbook contract | `64` |
| Deployment transaction | `0a90d3828b03f616d43c403bb512dc335f62d7079b665cd13331861ee3c1d2a0` |
| On-chain code root | `df01d777a26090b5de37249d84981ce8df978dee6b67ba0c386a778aa0e3bbf2` |
| On-chain state layout | 17 fields, root `bbef9ad2b2c993db2102e7d6bf239d6a1b0483cc47be2911224bb53497189fd3` |
| Canonical layout proof | Empty layout → 17 fields; independently verified with fingerprint `f2be754869220ac3bd68cfba16bbfdf50159cd667c3b445efb0adf807d175e9f` |
| SD-key escrow user | `591872` |
| SD-key fingerprint | `46e467428361d649f9113914fc5faa989af97d3c3a3de9e8bbd50b7e05d85dcf` |
| Escrow public key hash | `714cbdad1f620ec06c5fe45d943edce6d046458d63f71f65c02e1f25e76c5ad9` |

The prepared and submitted deployment requests are `/private/tmp/psy-orderbook-deploy64-prepared.json` and `/private/tmp/psy-orderbook-deploy64-submitted-request.json`. The prepared request passed `check_deploy_layout.mjs`; `/private/tmp/psy-layout-verify/target/release/psy-layout-verify` independently verified its serialized proof. Contract `64`'s chain leaf was read after inclusion and matched the table above. The chain had `next_contract_id=64` immediately before submission and `65` afterward.

## Proof error and fix

The original `cancel_order` and `close_order` used an `if` branch that contained a pUSDT state read. For a PSY order, the VM's unused pUSDT read witness conflicted with the function circuit's Merkle verification. The reproducible error was `Partition containing Wire(Wire { row: 631, column: 59 }) was set twice with different values: 0 != 16463394126558395459`; `close_order` hit the same class of error at row 420.

Cancellation and closing are now separate PSY and pUSDT methods. The PSY methods never read the seller's pUSDT partition. Using the real, already recorded contract `62` and `63` seller states, the corrected `cancel_psy_order` and `close_psy_order` CFC witnesses were generated locally and their base proofs verified before deploying the final revision. `cfc_probe` and `orderbook_wallet witness` provide a reproducible, non-submitting diagnostic path. The compiled-method regression test checks that the PSY paths contain no pUSDT state read.

## Confirmed real-asset tests on contract 64

| Operation | Transaction | Checkpoint | Result |
| --- | --- | ---: | --- |
| Open 1,000 pUSDT cancel test order | `20020e3c1f95e39e5f0c904f28fe11ad6dacee666648112a489613944924aa02` | 88063 | pUSDT seller `929792`, nonce 1; exact pUSDT payment and PSY fee escrow |
| Cancel pUSDT order | `4106bdaac5319d6296c5f4c7e2dbf6afe677b64a0829002c3b956c45db72007b` | ≤ 88106 | Full six-call stack first proved with `ORDERBOOK_PROVE_ONLY=1`; escrow nonce became 1; its token ledger shows 1,000 claimed and 1,000 returned only to the seller |
| Seller claims refund and closes | `72be92aa15ff59e89f0a38ed04182648ecbce6dcc1fae831d4c51e00e271d5c4` | 88118 | pUSDT received; order slot released |
| Open 1,000,000 PSY sell order | `27bbde3665d0bd708837dc144f1b206269d62638cad0f5719d86145990e7ff81` | 88128 | PSY seller `1454080`, nonce 1, min buy 1,000,000 pUSDT |
| Open 1,000,000 pUSDT sell order | `e42694ebcf6800ee0fa77ed81f906157aa4da7b9439f59559dca9033d7beba6a` | 88137 | pUSDT seller `929792`, nonce 2, min buy 1,000,000 PSY |
| Match both orders | `403408b43f5d41a056cac21a5f04fffde861ecaecb2c9645f83f48ad1ad61df5` | ≤ 88163 | Full six-call stack first proved without submission; escrow nonce cursors became 1 and 2; it transferred 1,000,000 pUSDT to the PSY seller and 1,001,100,000 PSY to the pUSDT seller, including return of the latter's PSY fee escrow |
| PSY seller claims pUSDT and closes | `7960598d35a1c9c54277c1c7241c8b154240a8f21915692b702e0e6da8eabc3d` | 88177 | 1,000,000 pUSDT claimed |
| pUSDT seller claims PSY and closes | `31fccc8410754a3aa3484f991280f657ec3e27635af8ea7ea89f33099315e1e7` | 88187 | 1,001,100,000 PSY claimed |

At checkpoint `88187`, both sellers' contract `64` `order_kind` values were `0`. Their token claim cursors recorded exactly `1,000,000` pUSDT and `1,001,100,000` PSY from escrow user `591872`; the PSY seller's pUSDT balance was `1,000,000`. The matcher burned `1,000,011,000` PSY base units as the automatic network fee.

A final read-only health check found staging at checkpoint `88201` with `next_contract_id=65`, so block production continued after deployment and the complete exchange.

## Earlier deployments

Contract `62` was the original orderbook test and remains historical. Contract `63` introduced the corrected PSY cancellation and confirmed a real 1,000-base-unit PSY refund. Its deployment transaction was `0e08b4492856ee97376f4d28299324540ae77be84a8cb76752c5b91c8c9ebc4a`; its cancellation transaction was `f8c231a92ab2b0c6a14a216044e986fbcc5fe5200ce0bff8e76c95c52013db28`, included by checkpoint `88006`. The original seller claimed that refund in `c699ec22d93fbed534a71e1b8d2073d44563d5fce655b96fcaf0f9cbe2552e6c` at checkpoint `88033`. Contract `63`'s old `close_order` still cannot prove for this PSY seller, so its order slot remains marked active even though its payment was claimed and refunded. Do not open new orders against `62` or `63`; contract `64` is the final tested deployment.

## Local verification

- `node --test orderbook/*.test.mjs`: 11 passed, including the compiled-method pUSDT-read regression check.
- `cargo test --offline --lib --target-dir ../../amm/sdkey-circuit/target` from `orderbook/sdkey-circuit`: 2 passed, covering valid and redirected/inflated SD-key stacks.
- Full PSY cancellation, pUSDT cancellation, and matching stacks were each proved with `ORDERBOOK_PROVE_ONLY=1` before signing and submitting the corresponding real-asset transaction.

Repository state at this verification: `psy-template` branch `main`, base commit `377f470`. The `orderbook/` directory is local and untracked; no push was made. No private key or recovery file is included in this report.
