# Explicit refundable initialization and initial live recovery evidence

This fresh archive preserves 51 public files, 5,280,428 compressed bytes. Original
paths and exact hashes are in manifest.json. No secrets, wallet recovery files
or executable binaries. Source stays on the existing market recovery branch;
SDK manifest 0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425.

## Fixed financial integration gap

A brand-new execution account lacks the other FT state tree. The existing base
market Executor refuses absent roots; its check is retained. Financial intent
v2 explicitly declares one refundable atomic unit of the other asset. Owner
funding binds it atomically. The first dedicated controller UPS sender-bound
cancels it back, checking zero spendable other-asset balance and exact refund.
Its state tree becomes authenticated, without providing swap liquidity. Final
ordinary claims include that separate refund. A-only onboarding without this
initialization still requires another reviewed capability; no SDK/Node change.

The first actual complete synthetic UPS is independently verified by the pinned
end-cap verifier. INITIALIZATION-EXPORT.json checks exported Merkle deltas:
absent root -> nonzero root; balance [0,0]; claim cursor 1; owner refund Outbox 1.
The new eight-step success controller sequence passes, including source/layout,
full stack/session, derived fees, linked endpoints and exported deltas. Base
market and ordinary owner actions in this fixture are VM-only, not live fills.

Total synthetic test wall 497.85 s; cold circuit build 124.514 s; eight full
controller stages sum 334.938 s, fee sum 8.000070 test PSY, excluding separately
funded market escrows and VM-only external gas. Concurrent work occurred. No
matched before/after comparison, chain TPS or speedup claim. Later six-refund
and two-cancel UPSs are separate supplemental artifacts, not files in this
first snapshot. Current code also has explicit terminal initialization claims,
versioned owner authorization, restart/receipt recovery and new-instance runners.

64 client regressions pass at this checkpoint, alongside seven actual-bytecode
VM tests and all 18 key templates / 18 negative stack/session/fee/initialization
cases. New later logs are kept separately without replacing this snapshot.

## Real network evidence and boundaries

- Seven bootstrap UPSs independently verify, and an actual fee mutation rejects.
- Fixed-snapshot audit: 1000 QA-A and QA-B each, including all internal pending
  Outboxes, with exactly 7.000038 test PSY of new fees; existing pUSDT unused.
- First LP epoch expired with zero admitted orders. Two empty-epoch aborts are
  included at checkpoint 370965. Same orders/principal are preserved for fresh
  consent, rather than changing any accepted/frozen collection.
- A same-checkpoint initial deployment receipt-ID discrepancy was caught before
  funding. Both API receipts identify 2489 although actual code/deployer metadata
  occupies 2489 and 2490. Raw observations and one bounded independent serial
  deployment plan are retained. No wrong-ID acceptance or original resend.

Actual controller success/owner claims/failed second-hop refund are still live
acceptance prerequisites. Registration, source closure or these synthetic proofs
alone do not establish that result. Original 2487/2488 remain unfunded/retired.
The selected later instances are 2491/1445056 and 2489/134336, with their final
registration evidence to follow. External runtime/upgrade authorization, SDK
upstream release, global inclusion/fairness and randomness remain separate.

All 1466 frozen SDK source hashes and Cargo.lock match. Existing unrelated Node
worktree diff hash is unchanged. Verify this archive with verifyCompactArchive.py;
that command checks artifact integrity, not cryptographic or production readiness.
