# 2026-10-23 review and continuation

Reviewed baseline: `7c90fb7`, branch `markets-batch-capacity-recovery-20261020`.
Frozen SDK manifest SHA256: `0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`.
No SDK migration, Node edit, old-contract update probe or evidence replacement.

## Confirmed completed work

The four-market maximum/recovery/NFT competition archive was reverified against
its original files. Maximum: 4 members per market; fills 4/2/4/2; ordinary claims
included; exact native fee interval 32.000504 test PSY. Omitted-sender recovery:
21.000203 test PSY fees and principal returned. NFT: one sale, original accepted
set retained across timeout/refreeze, losing/cancelled orders refunded, ordinary
claims included, 25.000228 test PSY fees. Scheduled independent-journal loser
rejection is not simultaneous RPC admission. Do not repeat these completed runs.

## Findings and disposition

1. **P1: composition deployment fallback bypassed the fresh occurrence gate.**
   `liveTwoHop.mjs` caught the historical-index rejection and inferred allocation
   from `next_contract_id`, then registered/funded 2482 despite
   `servicesIndexedReceiptVerified:false`. Current leaf equality and an allocation
   counter do not prove the submitted request's authenticated occurrence. The
   script also reused the earlier deployment owner, reproducing the known alias.
   Financial execution is now removed from this entry; it is a read-only
   historical report reader. Original code remains at `93ad36f`; original artifacts
   remain unchanged. No replacement deployment or old-contract probe was made.
2. **P1 release gap: quote planners are not the requested authorized execution
   layer.** Existing route/book modules accept supplied reserves/addresses; they
   neither verify dependencies nor authorize funds. The historical run uses
   ordinary owner signatures for every step, without a dedicated composition
   contract/key or bounded delegated intent. Its successful sequential trade is
   evidence of market mechanics, not compositional authorization or recovery.
   Keep it explicitly historical; add a separately maintained intent/policy/
   workflow module before enabling delegated execution.
3. **P2: benchmark cold failure text overstates behavior.** An existing preserved
   cold failure is skippable, but a first `run()` failure still stops that attempt.
   Warm safety checks are not removed. The missing Curve cold sample must remain
   missing. Fix this measurement-only control flow with focused regression.
4. **Measurement gap:** prior cost reports contain no peak-memory measurement,
   one warm/cold pair and no service-wide controlled confirmation comparison.
   New timed full-UPS runs record Darwin process peak RSS; historical memory stays
   null. No statistical or network speedup is established by one pair.

The Node checkout remains at `5b7f4e1`; its pre-existing diff SHA256 remains
`002e35e0b13cb6c422fe3abf500ce6aa5241229264d85a3314f22b5e14b59a64`.

## Work continuing

- Executor: collect full-proof resource baseline, add optional phase observations
  to the formal adapter, inspect resident lifetime and exact-proof recovery.
- Composition: domain/identity/amount-bound intent, independent recovery state,
  then a dedicated controller and exact-stack session-bound key. Quote planners
  remain non-authorizing. No UI, new repository or market mechanism change.
- External gates in `MARKET_BATCH_EXTERNAL_GATES_20261021.md` remain open.
