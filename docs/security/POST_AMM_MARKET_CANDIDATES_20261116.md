# Isolated post-AMM market candidates — 16 November 2026

These changes were prepared in parallel while the root-owned AMM network journey ran. They do not authorize additional instances, budgets, proofs or financial operations. Current stag confirmation is blocked; the issuer's unknown nonce4 request must reconcile before reusing that signer.

## Orderbook

[Pure journey plan](../../executor/acceptance/coreBookJourneyPlan.mjs) and [host regressions](../../executor/acceptance/coreBookJourneyPlan.test.mjs) reuse the existing selected-order client, bound dependency policy and formal reader/journal. The plan requires two trading parties and a distinct sponsor account AND key, 18-decimal QA assets, one-unit whole-order matching, both output claims, unmatched carry, cancellation and full refund claims.

It declares **22 UPSs:15 ordinary +7 formal** as requirements, not spending authorization. Capacity remains four members/two matched pairs; the proposed workload is two members/one match. Every stage depends on preceding confirmation. Selected-set price/time priority is not whole-market completeness or censorship resistance. A new sponsor identity, market/key/vault and separately reviewed budget are required. Host6/6 pass and source peer review found no blocking semantic issue. No actual Book bytecode/complete UPS/network acceptance ran in this round.

## Finite Bonding Curve fixtures

[Checked helper](../../amm/u124/vm-tests/tests/support/finite_curve_fixture.rs) and [Rust test entry](../../amm/u124/vm-tests/tests/finite_curve_fixture.rs) add finite configuration/identity and budget validation without changing runtime pricing or existing fixtures. Example cap10 +liquidity10 with unit1e18 needs **20 inventory units +one activation atom** and **10.0045 quote units** for full cumulative purchases; these fit a100-unit per-asset envelope.

Checked U124/u128 arithmetic covers reverse sells, limit change and fixed-target graduation. Five Rust tests were added but **not compiled or executed**. An independent arithmetic calculation and source peer review are not VM/bytecode/UPS evidence. Existing generic proof fixtures still hardcode oversized inventory and need explicit finite-configuration wiring before any fresh Curve deployment. No old Curve11 or other contract is updated.

## NFT identity-buy candidate

[Opt-in source candidate](../../nft-marketplace/u124/identity-buy-candidate.mjs) and [candidate boundaries](../../nft-marketplace/u124/IDENTITY_BUY_CANDIDATE.md) replace unbound open_buy with a versioned identity-bound call. The intended same-UPS constraints cover collection, signing-buyer recipient, seller/listing nonce, price, deadline, full token Hash4 and metadata Hash4 before writes. Other methods/layout/priority/sale/refund source is preserved.

Seventeen calldata words fit the frozen SDK's source-level128-word limit. That is not successful compilation or proof acceptance. Full canonical Goldilocks Hash words require a dedicated reviewed encoder; the existing generic call()62-bit cap must not be reused unchanged. Peer review found a sparse-array validation defect. The helper now captures own data-descriptor words once and builds calldata from clean snapshots, rejecting holes/inherited slots/accessors and ignoring malicious iterators. Root reran seven host tests; no bytecode or proof claim follows.

Existing factory/client rejects the new ABI, so NFT purchase writes remain closed. Required follow-up: actual compiler/selector/foreign-read audit, new versioned factory/client/key/resources, adversarial full-field bytecode tests, complete UPS suite and separately budgeted real sale/refund/claim acceptance.

No UI expansion, dependency switch, Node edit, production market mechanism change, old-contract update or financial execution is included in these candidates. Source/host results are reported separately from actual network acceptance.
