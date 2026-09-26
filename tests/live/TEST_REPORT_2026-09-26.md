# PSY-20 / PSY-721 staging test report — 2026-09-26

## Test setup

Two disposable, registered staging users in different realms (`135168` and
`1183744`) exercised the contracts on the `sepolia` staging network. The
wallet keys and private note proofs remain outside the repository. The v3 CLI
was built in a temporary directory from the local `psy-node` source; the
`psy-node` working tree was not changed.

The complete local `npm test` suite passed twice: **2 native suites and 7 E2E
suites**. Both public and private PSY-20 v3 sources compiled after the fix.
Local lifecycle E2E cases are simulations; the staging results below are
actual transactions and state-tree reads.

## PSY-721 — contract 54

After replacing only `ISSUER_USER_ID` with the test issuer, the deployed source
matches the repository's `nft/src/main.psy.rs` byte-for-byte. Normalized
SHA-256: `5120f1144a0d6e4389b0214b2c8de388e336d5ae25757f20563742ecdff21303`.

| Scenario | Result |
| --- | --- |
| Metadata, sequential mint `local_id=1..8`, Alice→Bob, Bob→Alice, Alice→Bob | Confirmed across realms |
| Four pending Alice→Bob transfers, followed by a fifth | Fifth rejected with `FIFO outbox queue full` |
| Bob claims one, Alice ACKs, then the fifth is retried | Fifth confirmed; remaining claims and final ACK confirmed |
| Final ownership and FIFO proof | At checkpoint `59434`: Alice balance 0, Bob balance 8, `total_minted=8`, sent/claimed/ACKed all 9; Bob slots 0–7 active |
| Old Bob claim trace, anchored at `59400`, submitted after Alice's second transfer at `59415` | Old claim confirmed at `59420`; fresh claim confirmed at `59427` |
| Nonsequential mint, unauthorized mint/metadata/renounce, self-transfer, no ownership, no pending claim, invalid recipient, renounce then mint/metadata | Rejected as expected |
| `sender=2²⁴` claim | CLI rejected unknown realm 16 before contract execution; this does **not** prove the on-chain bound assertion |
| Renounce state proof | Authority 0, renounced flag 1, minted count still 8 |

Evidence: [round trip](evidence/2026-09-26/nft-20260926.json),
[capacity](evidence/2026-09-26/evidence-v3-capacity.json),
[historical trace](evidence/2026-09-26/evidence-v3-stale-nft.json),
[rejections](evidence/2026-09-26/nft-negative-20260926.json),
[six-token state proof](evidence/2026-09-26/nft-state-6.json),
[eight-token state proof](evidence/2026-09-26/nft-state-8.json), and
[renounce proof](evidence/2026-09-26/nft-renounce-state.json).

## PSY-20 — prior deployment 55 and fixed deployment 56

Contract 55 used the private v3 source before this test's delegation fix.
Its normalized source SHA-256 was
`c36013cf9d8fcfb7c0edfb902f97f2e78ba304b9cad173f394eb5a7ba562cc72`.
Its private note transfer and claim confirmed across realms. A 20-step matrix
also confirmed public transfer/claim, both batch sizes, burn settlement,
delegation open/spend/claim/request/close/refund, and appropriate negative
paths. At checkpoint `59243`, state proofs showed Alice balance 720, Bob
balance 250, `total_minted=1000`, `total_supply=970`, 30 burned and settled,
and the delegated slot closed with 75 spent. These are regression results for
the **older** source, not evidence that the fix works.

A second opening of slot 0 exposed a real v3 source bug: after version 1 had
spent 75 and closed, version 2 spent 25 but the spender ledger recorded **100**
at checkpoint `59258`. The v3 compiler did not conditionally merge an
assignment to the local `spent` variable inside an `if` branch. Both
`token/src/main.psy.rs` and `token/src/main.private.psy.rs` now derive the
current version's amount as `ledger.spent * same_version.to_felt()` in spend
and close paths.

Contract 56 was deployed from the corrected private v3 source. After
normalizing only the issuer constant, its source matches the repository file;
SHA-256: `8fdd8ae54ae0edede8928cd93a234663ff194905700cd787c9923a04eee4083b`.
Metadata and extended metadata, a one-time `max_supply=1000`, mint 1000,
and rejection of minting the 1001st token all passed. A 100-token private note
transfer and claim confirmed; proofs showed Alice 900, Bob 100,
`total_supply=1000`, `max_supply=1000`, and note count 1. Replaying the same
note was rejected before submission with `nullifier already claimed`.

On contract 56, slot 0 was opened for 200, spent 75, claimed, requested for
revoke, cooperatively closed, and refunded 125. The same slot was then opened
as version 2 for 100, spent 25, claimed, closed, and refunded 75. The spender
ledger proof immediately after the second spend at checkpoint `59586` showed
**25**, not the old contract's 100. Final proofs at checkpoint `59611` showed
Alice 900, Bob 100, `total_supply=1000`, channel version 2/status CLOSED,
allocation 0, and spender version 2/spent 25/closed 1. This verifies the fix
against a newly deployed contract, including both the spend and close paths.

Evidence for contract 55: [private flow](evidence/2026-09-26/token-private-v3-20260926-evidence.json),
[20-step matrix](evidence/2026-09-26/token-matrix-20260926.json), and
[bug reproduction](evidence/2026-09-26/token-reopen-20260926.json).
Evidence for contract 56: [private flow, cap, and replay rejection](evidence/2026-09-26/token-private-v3-fixed-20260926-evidence.json)
and [two-version delegation and state proofs](evidence/2026-09-26/token-reopen-56.json).

## Remaining protocol boundary

The staging node accepted a PSY-721 recipient claim trace using an older
sender state after the sender had advanced. This is safe in the observed NFT
FIFO sequence because the claimant's own nonce advances and the ACK protects
slot reuse. It is **not** proof that authorization-sensitive historical reads
are fresh. Earlier [delegation testing](PSY20_DELEGATION_REPORT_2026-09-23.md)
showed a spend proof generated before an owner revoke request could confirm
after that request. The current cooperative-close model protects the observed
refund accounting but does not provide unilateral, immediate allowance
revocation. Concurrent conflicting submissions and independent protocol
freshness enforcement remain unverified. These staging tests are not a
mainnet readiness claim.
