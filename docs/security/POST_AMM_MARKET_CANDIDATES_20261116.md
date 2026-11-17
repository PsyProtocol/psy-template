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

Seventeen calldata words fit the frozen SDK's source-level128-word limit. That is not successful compilation or proof acceptance. Full canonical Goldilocks Hash words require a dedicated reviewed encoder; the existing generic call()62-bit cap must not be reused unchanged. Peer review found a sparse-array validation defect. The helper now captures own data-descriptor words once and builds calldata from clean snapshots, rejecting holes/inherited slots/accessors and ignoring malicious iterators. Root reran nine NFT host tests, including scalar/Hash snapshots and Proxy/accessor rejection without invoking traps; no bytecode or proof claim follows. The current helper is Node-only; browser integration needs its own reviewed trusted-data boundary.

Existing factory/client rejects the new ABI, so NFT purchase writes remain closed. Required follow-up: actual compiler/selector/foreign-read audit, new versioned factory/client/key/resources, adversarial full-field bytecode tests, complete UPS suite and separately budgeted real sale/refund/claim acceptance.

No UI expansion, dependency switch, Node edit, production market mechanism change, old-contract update or financial execution is included in these candidates. Source/host results are reported separately from actual network acceptance.

## Qwen source-only continuation — 17 November 2026

An external `qwen4-max` task via the existing Qwen API and Aider completed in419.289seconds against an isolated public-source copy of9a38a40. Its allowlist contained only `executor/acceptance/coreBookJourneyPlan.mjs` and its test. There were no unexpected edits or financial operations. The harness ran the original candidate's nine host tests successfully.

Root review accepted two candidate corrections: detach selected/retained owner arrays across stages, and use BigInt cancel directions consistently with amount/call fields. Qwen's third finding was inaccurate: the existing `user()`/`integer()` path already rejects non-BigInt market IDs. The reviewed copy removes that redundant guard while retaining rejection coverage. Against the original source, the two new defect regressions fail and the existing type-rejection regression passes; the reviewed copy passes all nine host tests.

Status: **reviewed isolated candidate only; not merged, committed, pushed, deployed or network-accepted**. Main source remains unchanged. Full bytecode, SD-key, complete UPS, network trade, refunds and ordinary-wallet claims remain unverified for this candidate. The issuer's unknown nonce4 broadcast remains held; no replay, replacement, signing, faucet, proving or financial execution occurred. Aider emitted a shutdown summarizer warning after applying edits; its main task and the independent host test command exited0. This warning is retained in the raw external-task log, not treated as proof of continued autonomous operation.

[Compact reviewed evidence](evidence/QWEN_BOOK_SOURCE_REVIEW_20261117_v1.json) records the accepted/rejected findings, test results and reviewed file hashes. Raw Qwen chat/logs and reviewed source remain outside Git in the uniquely named `psy-qwen-market-continuation-20261117-v1` task directory. This was one completed bounded task, not an ongoing four-market execution loop.

## Root-reviewed Book integration — 17 November 2026

Following the isolated-candidate review recorded above, root manually integrated the two accepted changes into the current source branch. The inaccurate market-ID finding was excluded; existing rejection remains covered. No Qwen artifact was overwritten. The focused journey, client and builder host suites pass21/21 (0failed), including both new regressions that fail on the original source. Owner-array independence prevents one stage's review metadata from mutating another stage; BigInt side metadata now matches ordinary call amounts and direction comparisons. This does not make returned plan objects globally immutable or replace submission-time reconstruction.

[Integration evidence](evidence/QWEN_BOOK_SOURCE_INTEGRATION_20261117_v1.json) records the exact test command, counts and source digests. These are source/host corrections only: no Book bytecode, SD-key, full UPS, deployment, network trade, refund or ordinary-wallet claim is accepted here. Financial execution remains held; no broadcast, replay, replacement or funding action occurred. The earlier “isolated candidate only” paragraph records the preceding review state and is retained as history.
