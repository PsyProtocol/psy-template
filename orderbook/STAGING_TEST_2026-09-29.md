# Orderbook staging verification — 2026-09-29

Network: Psy Sepolia staging. Token contract IDs: PSY `0`, pUSDT `4`.

## Deployment

| Item | Value |
| --- | --- |
| Orderbook contract ID | `62` |
| Deployment transaction | `dcbb7033c9c9f50b9fa9cdb084a4bc731db3cc7ab02fee3440a3d04aca8192a2` |
| Deployer user | `1454080` |
| SD-key escrow user | `1978368` |
| Escrow fingerprint | `5437dc310366aa7777f48e35945c188f8bc901cb063a9607a9033dc2a5f6c1d4` |
| Escrow public key hash | `cc03bdbe9bebeb4ffc3d69f2e95978ea12964cd99f40c828bf077fd0ed272d7b` |
| pUSDT seller user | `929792` |

The deployed contract was updated in place to make the owner opening path compatible with the prover and to avoid reading a PSY seller's uninitialized pUSDT partition. At the last confirmed read, contract `62` still had **14 state fields**, state layout root `2b8e491302cd3c68db18d829cb1b9c3b5325ef6f5e02368552686f88b547cbf3`, and code root `2f276da5b747ecced25bb322fe4ae22044130657a588159036df3da744e8ba5c`. The SD-key circuit and fingerprint were unchanged by all updates.

## Real asset setup

The official Psy faucet credited both test users with PSY. Claims on L2 were confirmed as `5d7eb216b3f619938d6a50543b77a709052aba9e06c2fa3542a09bb3e42250c1` (deployer, checkpoint 80955) and `2d8ee1a6cf0903695d2242189b911153b24502c5c33af74d8b66262f127c3be5` (pUSDT seller, checkpoint 80969).

The official test USDT faucet on Sepolia succeeded in transaction `0xba9b3f727112a9eb4acaf0fb14bebd47dc754e966ed490fdae4fe4727926b971`. Two approvals succeeded, followed by an L1-to-L2 bridge deposit of 2,000,000 base units of test USDT: `0x94c1d9dd0caefa2ee1748f1d55f3bef0447f82586b661a21b04dc80a4f5ac3d0`, deposit index 619. The pUSDT seller claimed that deposit on L2 in transaction `274c526fe50f1e2d0f47668f4814f08ec1ec2a6f46045d4143c6a48c5089e1df` at checkpoint 81082.

The Psy CLI's optional deposit-proof export failed **after** the L1 deposit succeeded. `sdkey-circuit/src/bin/deposit_proof.rs` reconstructed the claim proof from the official service proof and local deposit secrets. No second deposit was made.

## Order and test status

The deployer opened a PSY sell order for 1,000,000 base units, requesting at least 1,000,000 pUSDT base units, nonce 1, deadline checkpoint 82000. The same signed transaction sent 1,001,100,000 PSY base units to escrow, including the fee reserve. Transaction `5ea9afab1aba85ebe02040b1f696ee44d2a39f8f2cfbf784e6084785ee60ebc6` was confirmed at checkpoint 81070.

Local tests: 4 JavaScript tests and 2 Rust SD-key circuit tests pass, including attempts to redirect or inflate payouts. Live cancellation and matching are **not yet verified**. The first order's 1,001,100,000 PSY base-unit payment remains unclaimed in the seller's Outbox for escrow user `1978368`. The pUSDT seller's 2,000,000 pUSDT base units remain with that seller; no pUSDT order has been opened.

The secure cancellation stack failed during the first contract-call proof, before submission, in both the local and remote prover. The reproducible error was `Partition containing Wire(Wire { row: 631, column: 59 }) was set twice with different values: 0 != 16463394126558395459`. A diagnostic read-only method proved successfully when it checked all signed order fields, the pool nonce/payment cursors, and the exact PSY Outbox payment. A separate stack with `noop`, real `simple_claim`, and fee burn also proved without signing or submitting. Thus the failure is specific to the full guard's circuit; the diagnosis has not yet established which write or arithmetic constraint causes it.

Two proposed guard reductions were blocked by automatic approval review and **never deployed**: one removed order binding from cancellation, and one stopped advancing its consumed nonce. The review cited unauthorized transfer and replay risks. The latest confirmed on-chain guard retains the signed order, exact payment, and consumed nonce checks.

An append-only, 17-field version is present in the local source. It preserves all original fields and appends three new active cursors beyond the large token-compatible Outbox range. The final five-method update was submitted with the original 14-field ABI as `--old-abi-path`; its content hash is `ab3cb351a5a3c2461f0403cf683871cebccab0c668350b28d81aae666a351b0a`. The locally generated update command expects code root `603c78e99ba71cacd5892f8ff926f196a861a174df1bf1bd0e8d969587655810` and state layout root `bbef9ad2b2c993db2102e7d6bf239d6a1b0483cc47be2911224bb53497189fd3`. The on-chain leaf still showed the old 14-field layout at checkpoint `81463`; the staging checkpoint did not advance during subsequent reads. **Do not treat the local 17-field artifact as deployed until the chain leaf shows field count 17 and those new roots.** No cancellation or match should be submitted against the new artifact before that confirmation. A temporary read-only `debug_order` method remains in the latest confirmed staging code; it was removed from the final five-method update.

## Scope and limitations

This is an exact-fill orderbook with one active order per user and off-chain discovery/matching. There is no partial fill, on-chain enumeration, or production matcher service. The SD-key escrow public key is deliberately public; the registered fingerprint restricts the entire claim, transfer, and fee-burn stack. Any remaining fee reserve after the actual network burn remains in escrow.
