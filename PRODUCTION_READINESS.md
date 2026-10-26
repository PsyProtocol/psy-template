# 2026-10-19: frozen driver, request evidence and UPS metadata binding

This milestone changes only the application repository, not Node, protocol circuits, six contract sources or registered SD-key policies. No deployment or broadcast occurred. Contract code/layout roots and fingerprints are unchanged.

- U124/NFT Market Executor configs require explicit `walletSha256` and execute an independently copied private driver with that reviewed digest. Replacing the installed binary does not alter the active driver. Changed copy contents or permissions stop proving/submission.
- Before RPC, JS/Rust check every explicit call selected by the policy branch: recipients, assets, methods and parameters. This closes the earlier application preflight that checked only the first market call on ordinary branches. Existing full-stack circuit constraints remain.
- After full UPS verification, the driver binds its four public inputs to the end-cap state transition/stats about to broadcast, checking consistency of new user leaf hash, user ID and checkpoint.
- The driver reports SHA 256 of the actual raw calls/guard files. Executor preflight, submit and recovery require identical digests. Old cached proofs cannot impersonate the new version; pending historical broadcasts remain readonly-reconcilable.
- NFT engineering acceptance evidence v2 checks full calls, reviewed driver hash, guard identity/all dependencies, sealed RPC config and request digests. Swapping two valid fill logs cannot fake operation coverage.

Full offline regressions: 237 JavaScript tests and 62 Rust VM/CFC/layout/SD-key/FT executions pass, zero failed/skipped; release driver build passes. The frozen new driver matches the previous fingerprint/publicKeyHash for four policies. Seven compiled artifacts (public/private FT, NFT, three markets, NFT Market) are byte-identical.

Digest reports still come from a trusted driver, not new protocol public inputs or an independently signed security audit. Node upgrade authorization, circuit-authenticated code roots and independent audit remain external boundaries; filling in hashes does not close them.

---

# 2026-10-19: pre-broadcast binding and historical-state regressions

Only psy-template application driver/Executor/tests changed. Node runtime, VM and protocol circuits did not; no deployment or broadcast occurred.

## Fixes

- U124 markets and NFT Market use `guarded-preflight` / `guarded-submit`. Binding files must cover every invoked contract: market, FT, NFT, PSY fees and configured bootstrap AMM, with no missing, duplicate or extra dependencies.
- Before proof, after UPS verification and before persisting broadcast intent, the Rust driver re-reads code/layout roots, tree height and vault registration and verifies the actual proving vault ID. Network, market, fingerprint and public SD-key public-key hash must match.
- Vault bindings persist; restart cannot silently accept changed roots. PSY roots establish a trusted-RPC baseline on first use; other roots come from explicit deployment config. A baseline change requires a new release review.
- Runtime changes to ABI, policy, market/RPC config or asset ABI stop proving/submission. New submissions reject driver output lacking guard verification; historical logs remain readonly-reconcilable.
- Immediate journal reconciliation now receives the exact independent run-log path. If the child persisted broadcast identity but stdout was lost, the parent can still find its precise receipt rather than unnecessarily remaining unresolved.
- Executor rejects contract IDs outside 24 bits and market/asset ID overlap.

## Added/strengthened acceptance

- Actual local HTTP RPC regressions check fresh root/height/registration reads and rejection on change.
- JavaScript tests cover all market/asset/PSY root changes, runtime config replacement, restart baseline changes, old-driver rejection and exact-log recovery.
- Public/private FT bytecode rejects duplicate historical send claims. After spender-local terminal close, historical remote ACTIVE authorization cannot spend again, and refunded escrow cannot refund twice.
- Actual three-market bytecode rejects replaying a committed refund from historical remote OPEN payer state; NFT bytecode rejects repeated historical-queue claims.
- The unified offline entry runs an independent public FT profile and production-height CFC builds for all eight close methods across three markets; public APIs are not tested only through the private FT compatibility surface.

Full offline results: 227 JavaScript tests and 60 Rust VM/CFC/layout/SD-key/FT executions pass, zero failed/skipped; Rust release driver builds. The 60 executions include separately running public-method tests in public/private FT profiles.

## Boundaries these results do not remove

These repeated root checks protect compliant trusted Executors at application level. RPC leaves are not independently authenticated here; upgrades may occur between check and broadcast, and arbitrary public executors need not perform the checks. Verified immutability or explicitly accepted upgrade governance remains required. The local Node upgrade authorization path still needs review: deployer-field equality is not holder authorization. See [upgrade review](docs/security/UPGRADE_AUTHORITY_REVIEW_20261019.md), a readonly source observation, not deployed-network attestation.

Historical-state tests execute actual bytecode with explicit mixed snapshots and current local caller state. They do not independently accept Node rejection of stale caller proofs. Delegation remains cooperative, not unilateral instant revocation. Independent audit, governance and production operations remain open; the suite is not uniformly production-ready.

---

# 2026-10-19: three fixture-test gaps closed

Three previously ignored tests now run in the same offline acceptance entry:

- `curve_bootstrap_advances_donor_cursor_and_allows_post_graduation_refund`: Curve bytecode checks rollback on insufficient graduation fee, cumulative cursors for two donors and post-graduation refund of a new order from an earlier buyer.
- `curve_bootstrap_binds_seed_recipient_method_minimum_deadline_nonce_and_fee_donor`: actual SD-key proofs accept graduation and reject recipient, method, minimum liquidity, deadline, nonce and donor tampering.
- `public_acceptance_payer_only_funds_fixed_markets_and_returns_to_fixed_funders`: actual SD-key proofs cover nine fixed test-payer branches and reject returning surplus to another account.

Preparation recompiles bootstrap Curve from current source and generates config, policy, samples and fixed-payer policy. Manifests freeze inputs/outputs. These tests no longer have `ignore`; missing fixtures fail. The unified entry rejects ignored Rust tests rather than treating skips as acceptance.

Testing found/fixed a missing `bounded_test_payer` type in policy prevalidation. Only that existing type was explicitly restored; call counts, ranges and witness checks remain. Valid-policy circuit constraints were not relaxed.

Offline results: 221 JavaScript tests and 44 actual VM/CFC/layout/SD-key/FT tests pass, zero contract skips. Bootstrap code/layout roots are explicit fixture placeholders; these tests do not authenticate code roots or submit updates.

These results close the three listed test gaps, not independent audit or contract-upgrade authorization. They do not establish production readiness.

---

# 2026-10-16 code security acceptance

This milestone assesses code/proof constraints. No Node change or on-chain deployment/update occurred. These regressions alone cannot certify all six contracts as production-grade.

## Added fixes and checks

- SD-key policy JSON validates market type, call count, branch, method/contract IDs, witness indexes and Goldilocks constants before circuit allocation. Malformed input returns errors instead of panics/noncanonical fields. Valid circuits/fingerprints remain unchanged.
- Actual AMM/Orderbook/Curve SD-key gadgets cover all branches and reject method substitution, caller impersonation, extra calls, payer changes, high-limb tampering, redirected recipients, wrong assets, call reordering and signature-digest changes.
- NFT/NFT Market bytecode covers all 128 receiving slots full, stable cursors/identity after failure, exact claims after freeing capacity, repeated claim/burn/settlement rejection, unauthorized mint and rollback after late checks.
- Public/private FT bytecode covers U124 carry/borrow/boundaries, supply conservation, duplicate claims, wrong amount/denomination proofs, atomic rollback at either private-tree capacity, delegation close and original-payer refunds.
- Related wallet work fixes normal checkpoint refresh invalidating previews, confirmation gates on exact-fee failure, single/two-Felt public calls/cumulative ledgers, hexadecimal address parsing and small-window layout.
- Related Services work separates live messages from historical replay, persists history progress separately and advances it only after complete scans, with actual PostgreSQL/Redis/local-WebSocket regressions.

## Reproducible offline verification

Freeze compatible release `compile`, `compile_private`, `compile_market` and `compile_nft_market` binaries in an external directory. Sources are in existing VM-test `src/bin/` paths. Build locked dependencies with `nightly-2025-09-20`; never reuse an old output directory.

```sh
node tests/security/prepare-six-contracts.mjs --compiler-bin /absolute/frozen/bin --out /absolute/new/artifacts
CARGO_TARGET_DIR=/absolute/isolated/rust-target node tests/security/run-six-contracts.mjs --artifacts /absolute/new/artifacts --out /absolute/new/results
```

Requires a supported Node.js, Rust toolchain and local Cargo cache. Scripts record source/compiler/output SHA 256 and run JavaScript, actual VM, CFC/layout and SD-key tests, exiting nonzero on failure. Offline evidence only, no broadcast. Bootstrap/test-payer fixtures run by default; any ignored Rust test fails acceptance. Actual network UPS and cross-machine availability are outside this entry.

## Remaining asset-safety boundaries

1. Fingerprints authenticate full calls, methods and parameters, but the current gadget does not authenticate contract code/layout roots. Executor checks constrain only compliant executors. Anyone can submit using a public key if its fingerprint passes, so replacement implementations under the same ID remain a real trust boundary. Production needs verified immutability or accepted upgrade governance; application code alone cannot remove it.
2. Cross-user reads may be historical. Refund/cancel/delegation safety depends on cumulative payer cursors and current caller state. Delegation close is cooperative, not unilateral instant freezing. Timeout also cannot safely recover an NFT already delivered to a permanently offline recipient.
3. Independent contract/cryptographic audit is required. Model-assisted code reviews and automatic regressions are not independent audit or end-to-end safety proofs for all six contracts.

Historical records below remain chronological; read earlier pending items alongside later evidence.

---

# Production acceptance boundaries

This repository does not claim mainnet production readiness. Deployment, regressions and testnet settlement are engineering evidence, not substitutes for independent audit, production operations or governance.

## Per-module review

| Module | Engineering evidence | Remaining release gates |
| --- | --- | --- |
| U124 FT | Two 62-bit limbs, 18 decimals, public bytecode and three-market trades; [private version](token/wide/private/README.md) | Independent audit, issuance/upgrade governance; actual browser private transfer/claim was verified on 2026-10-15 |
| NFT | Actual mint/transfer/claim; identity, metadata, FIFO and ownership-slot checks | Independent audit and issuance/upgrade governance |
| AMM / Orderbook / Curve | [Actual settlement/refund/claim-close, Curve AMM seeding and same-host crash recovery](executor/verification/2026-10-14-resume-01/REPORT.md) | Independent audit, on-chain capacity and fault acceptance |
| NFT Market | Independent initial layout, one-time activation, full UPS, fill/cancel refunds | Three-user competition/release results in the report; independent audit remains |
| Executor | Durable broadcast intent, exact receipt recovery, same-host shared-journal locks, root/public-identity checks | Availability, alert response and dedicated production-environment acceptance |

## Release requirements

1. Freeze source, ABI, policy, driver and code/layout roots with hashes; never overwrite original compile/proof outputs.
2. Independently verify empty-old-layout proofs for new deployment. Existing updates require separately checking on-chain old layout and proof endpoints; initial-deployment proofs cannot be reused.
3. Use the public SD-key public-key hash corresponding to the fingerprint. A registered ordinary-key account with similar state is not a public vault.
4. Broadcast the independently verified actual UPS once. Lost replies reconcile by durable leaf hash; a missing receipt does not authorize resending.
5. Verify actual claims, FT supply, NFT counts, identities and metadata, not just order flags or balance counters.
6. Independent reviewers must audit contracts, SD-key, application compiler adaptations and upgrade authorization. Fix findings and rerun affected checks.
7. Accept availability, on-chain capacity, fault/backup recovery and alert response in a dedicated environment with actual measurements.

## Upgrade authorization review is mandatory

Current policies constrain contract/method IDs, parameters and full calls; `can_read_state` remains disabled. Executors separately check code/layout roots. **Application checks do not freeze code on-chain through the fingerprint.**

If a deployer can replace an implementation under the same method IDs, that authority affects asset safety. Release must identify authority holders, controls and recovery, and assess immutable deployment or circuit-authenticated roots. Client rejection does not constrain arbitrary public executors. No Node change, unauthenticated-state bypass or existing layout update occurred.

## Concurrency and operating scope

Current support covers multiple processes on one host sharing one runtime directory. Chain nonce/anchors adjudicate competing proofs; durable journals govern submit/recovery. Local lock tests do not establish cross-machine leases or chain TPS.

The macOS login service depends on wakefulness, connectivity and the user session. It suits testnet use but is not a production availability guarantee. Server deployment needs platform driver, certificate trust, capacity and operations acceptance.

## Readonly NFT Market acceptance

`nft-marketplace/acceptance.mjs` re-queries receipts and checks frozen files, SD-key identity, actual claims and FT/NFT conservation. It requires three real participants and activation/fill/cancellation/losing-buyer refund evidence. It does not sign, transfer or retry submission.

```sh
npm run verify:nft-marketplace -- \
  --config /absolute/path/to/executor.json \
  --evidence /absolute/path/to/acceptance-evidence.json \
  --out /absolute/path/to/fresh-verification.json
```

On success it returns `engineeringAcceptanceVerified: true`, while `productionReady` remains `false`, listing audit/governance/operations gates. [Test fixtures](nft-marketplace/tests/acceptance.test.mjs) use explicit RPC/driver doubles, not actual chain evidence.

---

# Existing FT/NFT evidence and release gates (historical record)

# Production readiness gates

This repository is a reference implementation. Passing `npm test` proves local compilation, native single-user test cases, ABI shape, and JavaScript state-model behavior. It does not prove live multi-user settlement or mainnet safety.

## Completed in the local template

- Native test fixtures are generated from the legacy `.psy` sources. Harness-only replacements are explicit in `token/scripts/run_unit_test.mjs` and `nft/scripts/run_unit_test.mjs`. Both runners also compile the staging `.psy.rs` sources; the legacy unit assertions do not execute those sources.
- NFT v3 uses a full four-Felt `Hash` for token IDs and separate inbound-claim and outbound-ACK counters. Older deployments need a separate migration design.
- NFT v3 now stores collection name and base URI alongside its existing symbol and metadata hash. It also supports a one-time lifetime mint cap, owner-initiated burn, and issuer settlement of the monotonic burn counter into `total_supply`. A burn is reflected in the owner's balance immediately and in global supply only after settlement. These fields require a new deployment.
- Issuer configuration is limited to `1..16777215`, matching the Outbox index range.
- Standalone templates provide `deploy:checked`, which checks the selected wallet's first registered user ID against `ISSUER_USER_ID` on the configured network before rebuilding and deploying. Direct `psyup deploy` remains an unchecked escape hatch.
- PSY-20 delegation permits opening 16 escrow slots. Revocation is cooperative: a spender-local terminal close is required before the owner refunds unspent balance. An owner request cannot force a spender to stop or release funds. See [`token/README.md`](token/README.md).
- PSY-20 now stores name, URI, an optional immutable lifetime cap, lifetime minted amount, and outstanding supply. Holders burn locally; the fixed issuer settles each holder's monotonic burn counter to reduce outstanding supply. The issuer can also mint directly to a recipient's claimable Outbox. These fields require a fresh deployment; older contracts have a different storage layout.
- `tests/live/asset_queries.py` reads token and NFT state at one checkpoint using the deployed ABI. It can verify an NFT owner candidate by scanning that user's 128 slots, but it cannot discover the owner of an arbitrary ID without an external index. The RPC returns state proofs; the helper does not independently authenticate checkpoint headers.

## Staging evidence, 2026-09-23

- Two newly registered users in different realms completed a five-transaction PSY token transfer and claim round trip. Contract 0 balances were checked from node state proofs after each confirmation. This verifies the staging transaction path, not the NFT artifact.
- A recipient claim trace anchored at checkpoint 32362 was confirmed at 32388 after the sender's second transfer confirmed at 32382. The recipient's balance rose by the amount available at the old checkpoint, less execution cost. A fresh claim then collected the second transfer. **Staging does not require remote state reads to be fresh at submission.** The node does check the caller's current leaf; this experiment did not bypass that check.
- The legacy NFT `.psy` artifact could not be deployed to staging. A new `nft/src/main.psy.rs` artifact deployed as contract 44. Two users in different realms confirmed mint, A→B claim, B→A claim, ACK, four pending transfers, queue-full rejection, ACK recycling, and ring wraparound. State proofs show the five minted token IDs and metadata arrived unchanged, the issuer slots cleared, and balances matched. A later NFT claim trace anchored before the sender's second transfer was accepted after that transfer; a fresh claim collected the second NFT, with state proofs showing no duplicate in this sequence. The released 0.1.1 `psy_user_cli` executed claims and ACK. Direct `psyup deploy` still targets the legacy artifact; the staging IDE's v3 workflow has not been tested.
- A node-matched local CLI deployed PSY-20 v3 test contract 46. Two cross-realm users confirmed mint, channel opening, delegated spend, recipient claim, owner revocation request, spender close, and refund after the original 60-checkpoint wait. Its final state proof shows no locked escrow. Contract 46 is an earlier revision; the published local 0.1.1 CLI's deployment was rejected with `canonical layout verifier fingerprint mismatch`, showing toolchain and network compatibility remains a release gate.
- PSY-20 v3 revision deployed as staging contract 47. The same two users completed mint, open, spend, claim, request, close, and immediate refund. A further spend after close was rejected. State proofs at checkpoint 34357 show owner balance 10,000, channel status CLOSED and allocation 0, and spender ledger `spent = 300, closed = 1`. [Transactions](tests/live/evidence/2026-09-23/token-delegation-v3-final.json) and [state proofs](tests/live/evidence/2026-09-23/token-delegation-v3-final-state-proofs.json) record the result. A pre-request spend trace was confirmed after the request at checkpoint 34424; [historical-spend evidence](tests/live/evidence/2026-09-23/token-delegation-v3-historical-spend.json) and [final state proofs](tests/live/evidence/2026-09-23/token-delegation-v3-historical-spend-state-proofs.json) record that sequence. On the same earlier revision, a newly generated spend also confirmed after an owner request (request 34617, spend 34623).
- The current active-only source deployed as staging contract 48. Its ordinary two-user delegation flow, close, and immediate refund confirmed. For a separate slot, Alice's request confirmed at 34749; Bob's newly initiated spend was rejected by `channel is not active`, Bob closed, Alice recovered all 100, and state proofs at 34772 show owner balance 10,000, allocation 0, and Bob `spent = 0, closed = 1`. [Flow](tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-flow.json), [negative test](tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-negative.json), and [state proofs](tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-state-proofs.json) record the result. On contract 48, Bob's trace anchored at 34798, Alice's request confirmed at 34807, and Bob's saved trace still spent 40 at 34815. [Historical-spend record](tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-historical-spend.json) and [final state proofs](tests/live/evidence/2026-09-23/token-delegation-v3-active-guard-historical-state-proofs.json) confirm the remaining 60 was later refunded.

## Required before live value use

The new PSY-20 supply controls passed a two-user staging flow on public-only contract 49: `mint_to(600)` and claim, recipient burn of 200, issuer settlement, state proof of `total_minted = 600` and `total_supply = 400`, and rejection of a duplicate settlement and mint past the 1000 cap. See [evidence](tests/live/evidence/2026-09-24/token-supply-v3.json). The separate private v3 profile completed a two-user private note round trip on contract 53; see [evidence](tests/live/evidence/2026-09-25/token-private-v3.json).

The NFT cap and burn revision deployed as staging contract 57. Two users in different realms confirmed metadata initialization, `set_max_supply(2)`, mint, transfer, claim, recipient burn, and issuer settlement. At checkpoint 71169 the ABI-based reads show `total_minted = 1`, `total_supply = 0`, `max_supply = 2`, matching burn requested and settled counters of 1, and zero user balances. A repeated settlement was rejected. [Transaction and state evidence](tests/live/evidence/2026-09-28/nft-supply-v3.json) records the deployed source hash. The final name/base-URI revision deployed as contract 58 and passed live writes, ABI-based reads, text decoding, and non-issuer rejection. [Metadata evidence](tests/live/evidence/2026-09-28/nft-metadata-v3.json) records its source hash.

**PSY-20 release gate:** The ordinary two-user cooperative lifecycle passed on staging contracts 47 and 48. Contract 48 rejected a fresh post-request spend but **accepted a historical ACTIVE proof submitted after the request**. This is direct evidence that the active-only guard cannot provide unilateral allowance revocation. Test concurrent submissions and independent node-side stale-caller rejection. The private v3 source implements `private_transfer` and `private_claim`, and its two-user staging round trip passed; the default public v3 artifact still omits them. Keep the two deployment profiles explicit. Do not present `total_supply` as instantly synchronized with unprocessed burns. If unilateral revocation is a product requirement, implement current-state validation or atomic cross-partition settlement in the protocol before enabling that claim. Pin a CLI whose canonical-layout verifier matches staging.

1. **Real NFT adversarial tests:** The ordinary two-user round trip, four pending NFTs, fifth-send rejection, ring wraparound, and ACK recycling passed on staging with state-proof checks. Still exercise recipient-full slots, concurrent submissions, and deliberately stale NFT proofs.
2. **Historical read safety:** Staging accepted an NFT claim with a historical sender proof and a PSY-20 spend with a historical owner proof after the owner request. A second NFT trace with an old caller leaf was stopped by the client before submission, and the ordinary old-then-fresh sequence preserved NFT ownership. Independently verify node-side rejection of stale caller leaves, then test delegation spends against historical owner proofs after spender close. Do not equate cooperative close with unilateral revocation.
3. **Recipient liveness policy:** Specify whether transfer to an unregistered, inaccessible, or permanently inactive user may lock an NFT indefinitely. Add a protocol-safe recovery or cancellation path if that outcome is unacceptable; a timeout alone is insufficient without a proof-freshness rule.
4. **Account and capacity limits:** Confirm the chain's user ID range and product requirements against the 24-bit Outbox index, 128 active NFT slots per user, and four pending transfers per sender-recipient pair. Change the storage design before deployment if these limits are too small.
5. **Integration contract:** Connect the ABI-based query helper to wallets and an indexed owner-discovery service. Test four-Felt IDs, events, metadata resolution, and indexed candidates against live users. A standard global `ownerOf(token_id)` is unavailable from partition-local state alone.
6. **Shielded NFT flow:** The current private-note wallet exposes its `amount` as a public method input. Using the unique NFT local ID as that amount would link the transfer and claim. A private NFT transfer requires a circuit and wallet flow that hides the token identity while proving one owner debit and one recipient credit; do not present the PSY-20 note method as private NFT support.
7. **Release controls:** Align the IDE and `psyup deploy` with the 0.1.1 CLI's `.psy.rs` compiler and deployment artifact. Pin and verify the CI toolchain installer, run the CI workflow on a clean hosted runner, obtain independent contract and protocol review, and rehearse deployment and recovery on a non-production network.

Do not label a deployment production ready until these gates have evidence attached to the release candidate. Use `deploy:checked`; direct `psyup deploy` bypasses the template's wallet and issuer check.
