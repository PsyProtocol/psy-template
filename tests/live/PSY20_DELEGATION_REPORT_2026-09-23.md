# PSY-20 delegation staging verification — 2026-09-23

## Scope

Two registered staging users in different realms, `901120` (owner/issuer) and `1949696` (spender), tested the public PSY-20 v3 source. Contract **47** uses the revision before the local active-only spend guard was added. That deployed revision allowed `spend_delegation` when owner status was ACTIVE (1) **or** REVOKE_PENDING (2). Its isolated source, after normalizing the issuer constant, had SHA-256 `f81c87e5e40586e974e55bcd96180be6fef01017e3a1772c41bf05ef4476d5`. The current `token/src/main.psy.rs` permits only ACTIVE (1), so contract 47 is no longer an exact build of the current file.

The published local 0.1.1 CLI compiled the source but its deployment was rejected with `canonical layout verifier fingerprint mismatch`. A locally built CLI from the node source tree deployed the same contract. The node compares the submitted canonical-layout verifier fingerprint with its configured fingerprint in `psy_node_common/src/coordinator/edge/handler.rs` before checking the proof; this failure reflects toolchain/network mismatch, not a token assertion.

## Contract 47 results

| Check | Result |
| --- | --- |
| Metadata and mint 10,000 | Confirmed |
| Owner opens slot 0 for spender with 1,000 escrow | Confirmed |
| Spender spends 300 to owner Outbox; owner claims 300 | Both confirmed across realms |
| Owner requests revoke; spender closes version 1 | Both confirmed |
| Spender attempts another spend after close | Rejected by spender-local `closed` assertion |
| Owner immediately finalizes and refunds 700 | Confirmed at checkpoint 34355, with no 60-checkpoint wait |
| State proof at checkpoint 34357 | Owner balance 10,000; channel allocation 0/status CLOSED; spender ledger `spent = 300, closed = 1`; Outbox sent and claimed both 300 |

[Transaction evidence](evidence/2026-09-23/token-delegation-v3-final.json) and [state-tree proofs](evidence/2026-09-23/token-delegation-v3-final-state-proofs.json) contain contract IDs, checkpoint IDs, transaction hashes, queried offsets, and roots. They contain no private keys.

Contract **46** is an earlier revision with a 60-checkpoint wait. After the cutoff, its refund confirmed at checkpoint 34378. A state proof at checkpoint 34382 shows owner balance 10,000, allocation 0/status CLOSED, and spender `spent = 300, closed = 1`. Its [transactions](evidence/2026-09-23/token-delegation-v3.json), [pre-refund proofs](evidence/2026-09-23/token-delegation-v3-state-proofs.json), and [settled proofs](evidence/2026-09-23/token-delegation-v3-settled-state-proofs.json) are retained for comparison. Contract 46 is not evidence for the current immediate-refund rule.

## Historical spend after owner request

On contract 47 slot 1, Bob generated a spend trace against Alice's ACTIVE channel at checkpoint 34403. Alice's `request_revoke_delegation` confirmed at checkpoint 34418. Bob then proved and submitted that **already generated** trace; the same transaction hash confirmed at checkpoint 34424. Alice claimed 40, Bob closed the channel, and Alice recovered the remaining 60. A state proof at checkpoint 34590 shows Alice's balance 10,000, slot 1 CLOSED with zero allocation, Bob's ledger `spent = 40, closed = 1`, and cumulative sent/claimed totals 340.

This establishes that a pre-request trace can be submitted and confirmed after the request. Whether that is acceptable depends on the intended revocation rule. It does not by itself establish that a newly generated spend after the request succeeds. The [transaction record](evidence/2026-09-23/token-delegation-v3-historical-spend.json) and [final state proofs](evidence/2026-09-23/token-delegation-v3-historical-spend-state-proofs.json) contain the evidence; the private trace is not published.

## New spend initiated after owner request

On contract 47 slot 2, Alice opened 100 and her request confirmed at checkpoint **34617**. Only then did Bob invoke `spend_delegation` to generate a new trace, prove it, and submit it. The spend of 40 confirmed at checkpoint **34623**. Alice claimed 40, Bob closed, and Alice recovered 60 at checkpoint 34644. State proofs at checkpoint 34647 show Alice balance 10,000, slot 2 allocation 0/status CLOSED, Bob `spent = 40, closed = 1`, and cumulative Outbox sent/claimed totals 380. See [transactions](evidence/2026-09-23/token-delegation-v3-post-request-spend.json) and [state proofs](evidence/2026-09-23/token-delegation-v3-post-request-state-proofs.json).

This is a direct demonstration that contract 47 did **not** treat the owner's request as a spend cutoff, even for a newly initiated transaction. The active-only guard in contract 48 is verified separately below.

## Active-only guard on current contract 48

The current `token/src/main.psy.rs` was deployed as staging contract **48** with only `ISSUER_USER_ID` changed to `901120`. After normalizing that constant, the isolated deployed source and local source both have SHA-256 `9f56609190fc49887a226cd0e90233708c7e2723d27ca28a570f222036a43809`.

The ordinary lifecycle confirmed mint 10,000, open slot 0 for 1,000, spend/claim 300, owner request, spender close, and immediate refund of 700 at checkpoint 34735. A fresh post-close spend was rejected by the owner status assertion. [Flow transactions](evidence/2026-09-23/token-delegation-v3-active-guard-flow.json) record the sequence.

For the direct contrast, Alice opened slot 2 with 100 and her request confirmed at checkpoint **34749**. Bob then initiated a new spend of 40. Trace generation failed with `channel is not active`; no spend transaction was submitted. Bob closed slot 2 at checkpoint 34758, Alice finalized at 34770, and a state proof at 34772 shows owner balance 10,000, slot allocation 0/status CLOSED, Bob `spent = 0, closed = 1`, and cumulative sent/claimed totals still 300. See [negative-test record](evidence/2026-09-23/token-delegation-v3-active-guard-negative.json) and [final state proofs](evidence/2026-09-23/token-delegation-v3-active-guard-state-proofs.json).

The guard rejects a **fresh** post-request read. A second test on the exact same contract proves its limit: Bob generated a spend trace anchored at checkpoint **34798** while the slot was ACTIVE. Alice's request confirmed at **34807**. Bob then proved and submitted that saved trace, and the spend of 40 confirmed at **34815**. Alice claimed the 40 at 34823, Bob closed at 34830, and Alice recovered the remaining 60 at 34837. State proofs at checkpoint 35121 show owner balance 10,000, slot allocation 0/status CLOSED, Bob `spent = 40, closed = 1`, and cumulative sent/claimed totals 340. The [historical-spend record](evidence/2026-09-23/token-delegation-v3-active-guard-historical-spend.json) and [final state proofs](evidence/2026-09-23/token-delegation-v3-active-guard-historical-state-proofs.json) contain the evidence. The saved witness trace is not published.

**Finding:** A fresh post-request spend is blocked, but a pre-request proof submitted after the request still succeeds on the current contract. The owner cannot unilaterally revoke the delegated spending right at request confirmation. The cooperative close protects the refund accounting in this observed sequence, but it depends on Bob closing and does not meet ordinary allowance revocation semantics.

## Security boundary

These tests confirm the ordinary two-user cooperative lifecycle on both revisions, historical and newly initiated spends after the owner request on contract 47, and both a fresh-spend rejection and a historical-spend acceptance after the request on contract 48. They disprove unilateral `approve(..., 0)` behavior on the current artifact. An owner request only changes the owner's partition. Contract 48 rejects a fresh read of status 2, but historical cross-partition reads can still present status 1. A nullifier or zero allowance in the owner's partition would have the same stale-read problem.

Simultaneous in-flight transactions and independent node-side proof that a stale **caller** leaf is rejected remain open. The v3 source lacks the legacy private-note methods. Do not use this staging result as a mainnet safety claim. Unilateral cancellation requires a protocol change that checks authorization-sensitive remote reads against current state at the serialized commit point.
