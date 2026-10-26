# Two-pool composition actual acceptance — 2026-10-24

## Scope and identities

Same branch and fixed SDK manifest
`0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`.
No Node/SDK/old-contract change or original-evidence overwrite.
QA-A2483/QA-B2484:18 dec,1000issued each, administration renounced. Fresh AMMs
2485/vault 1012928 and2486/vault 718016. Fees testPSY9 dec, no existing pUSDT.
Success controller2491/vault 1445056; timeout2489/134336; partial2492/1756352.
Ordinary owner 1717440 realm 1, Sponsor 406720 realm 0: actual cross-realm sends/claims.

Two original unknown deployments remain quarantined/unfunded, not resent or
pronounced discarded. A distinct issuer's isolated QA FT deployment gives2484 via
exact content hash `ea8eaafd385df8425dd8e03010c47e8ea66c915d4a3304ddd3e1230613b7ad6f`.
Code/layout/issuer/issuance/two-pool trades verify. This accepts a usable independent
instance, not recovery of the old unknown receipt. Another ID mismatch was blocked
before funding; [investigation](DEPLOY_RECEIPT_ID_COLLISION_20261024.md).

## Three actual outcomes

| Scenario | Fills | Ordinary claim checkpoint | Principal received |
| --- | --- | --- | --- |
| Two-pool success | 2 | 371528 | Input4.611686018427387921 QA-A; final3.141711878267176122 QA-A |
| Hop-one admission timeout | 0 | 371903 | Original1 QA-A |
| Hop one filled, hop two cancelled | 1 | 372434 | Actual intermediate0.633097631070860774 QA-B |

Each claim also returns the declared one QA-B initialization atom and unused PSY.
Success input limbs[17,1] remain exact. Intermediate3.738416797288011079 QA-B yields
final above signed minimum3.110294759484504360 QA-A. Partial recovery returns actual
QA-B, cannot undo hop one at its price and does not satisfy the target QA-A intent.

Final checkpoint 372450: all controllers phase 99, spendable QA/native zero, no pending
bidirectional Outbox within the named nine accounts. No partial-recovery second
fill occurred. No historical hop-two consent is established by consent_sent=0,
complete nine UPS/nonce 9 and receipts, not by post-cleanup admission zero alone.

| Scenario | Budget PSY | Controller burn | Gross owner return | Net market service escrow |
| --- | ---: | ---: | ---: | ---: |
| Success | 20.002000000 | 8.000070000 | 10.001730000 | 2.000200000 |
| Zero-fill timeout | 20.002000000 | 7.000057000 | 13.001943000 | 0 |
| One-fill recovery | 20.002000000 | 9.000076000 | 10.001824000 | 1.000100000 |

Each budget equals the other three columns. Final ordinary claims separately burn
1.000006000/1.000006000/1.000004000 PSY; gross return is not net balance increase.
External Sponsor/ordinary/LP costs are separate, not controller budget or deposits
counted as burn. Fixed-checkpoint nine-account FT+Outbox totals1000 each. The98
receipts since constituent baseline burn98.000777000 PSY including bootstrap/LP/
Sponsor, not just three intents or whole-network conservation.

## Failures and recovery

1. Zero-fill admission proving missed original cutoff before a broadcastable request.
   No renewal of old consent: exact empty abort, owner cancel, sender-bound refund
   then claim. Terminal re-entry preserves financial file hashes/no second payment.
2. Partial path's hop-two refund confirmed372269, then start-compact-session hit
   actual realm 1 connection failure. Worker/supervisor stop with
   broadcastMayHaveBeenAttempted=false/automaticRetry=false; no request/intent/
   receipt/preflight.
3. Explicit resume checks seven original confirmed tasks/full intents, current
   owner/phase/nonce 7, no pending broadcast, same key/dependencies and new witness.
   Only subsequent claim/return proceeds; seven original result hashes unchanged.
   Confirmed372384/372426, ordinary claim372434; no repeat funding/hop/refund.
4. This specific resume is accepted, not automatic SDK reconnect, multi-host
   failover or automatic unknown-broadcast recovery.

## Independent proof and financial audits

Relative original paths below are archived by gzip/SHA manifests, without wallets,
keys or binaries. Integrity and cryptographic verification are distinct.

- public/INITIALIZED-LIVE-ACCEPTANCE-COMPLETE-v1.json: three terminal outcomes.
- public/COMPOSITION-RECOVERY-AUDIT-v1.json: nine accounts/Outbox/98 fees.
- public/COMPOSITION-TERMINAL-STATE-AUDIT-v1.json: final code/layout/reserves/remainders.
- public/SDK-SOURCE-CHECK-v5.json:1466 sources/locks/config/genesis match.
- composition-final-receipt-verification-v2/SUMMARY.json: **98/98 full UPS**, pinned
  end-cap key/common, exact request/nonce/end-leaf/fee; fee mutation rejects.
- public/COMPOSITION-OWNER-CLAIMS-AUDIT-v1.json: three actual owner historical
  endpoints, FT/native increases, sent/claimed cursors and fees.
- public/COMPOSITION-LIVE-PERFORMANCE-v1.json: per-UPS calls/stages/RPC/failures/fills/
  fees/resources/claim timings; unmeasured fields null.
- composition-final-regression-v6.log:20 targeted tests for task/payer/unique intent/
  original log directory/bounds, not substitutes for independent proof/claim audits.

Receipt aliases must map to exactly one original intent/full task/payer and request.
Historical included logs must share original intent directory. Ambiguity/tampering/
wrong payer/out-of-range requests reject without substitute transactions. Failed
v1 verifier artifacts remain; full recheck uses fresh v2 output.

## Performance of this run, without a control group

| Scenario | Controller full preflight range s | Intent→receipt/common range s | Ordinary process s | Process end→common s | First adapter→final claim min |
| --- | --- | --- | --- | --- | --- |
| Success | 99.512–151.558 | 92.567–198.437 | 141.804 | 157.151 | 164.565 |
| Zero-fill | 91.390–137.467 | 96.796–264.799 | 134.729 | 156.744 | 118.945 |
| One-fill recovery | 92.946–182.253 | 95.466–323.952 | 110.470 | 61.451 | 181.483 |

Preflight includes full proof/verify and possibly SDK witness/state reads, not pure
crypto CPU. Intent→common includes final checks/HTTP/polling, not server-only
finality. Ordinary process includes build/read/proof/verify/send. End-to-end includes
source/key checks, cutoff/Sponsor/failure/manual diagnosis/recovery, excludes earlier
SDK compilation/deploy/LP; not steady throughput/SLO. Nested stages are not summed.

First adapter source/IR/key/RPC205.494–228.126 s, key1.096–1.213 s, session41.590–46.865 s,
deduplicated by process first job; not complete cold build/warm speedup. Binary
cold compile unmeasured. Partial fund/open1 share UUID/PID with seven-call
preflights136.872/139.571 s but fresh states/nonces; different operations, not A/B.
Call proving34.898–81.645 s, recursion12.417–22.191 s, end-cap4.389–4.830 s, full verify
2.937–3.408 s. Three market settles each seven calls,144.694–162.168 s; one composition
member each, not max-capacity or fully parallel pools. State/quote/scan/isCurrent/
submit walls remain in originals; unavailable SDK sub-stages are not fabricated.
One admission-expiry/one controller-session-read failure retained, not extra fills
or replayed unknown requests.

Darwin arm64,10 logical CPUs/32 GiB. Two-second selected-wallet RSS max sum
11,550,539,776 bytes (~10.76 GiB), includes concurrent QA/shared pages, not all-process
instantaneous peak or stage memory. Original observer and closed summary retained.
No controlled network speedup, chain TPS or exact server finality conclusion.

## Limits and source entry points

Multi-UPS/multi-vault workflow, **not atomic cross-vault commit or original-price
rollback**. A→B→A only, not three-asset/native/NFT/arbitrary routing. Explicit second
asset one-atom initialization remains, not hidden prefunding or A-only onboarding.
Ordinary CLI claims are not browser acceptance. Finite deterministic queue is not
global inclusion/censorship resistance/future randomness. Local journal/restart
is not multi-host/power-loss takeover. Frozen local dependencies are not upstream
release/running-image/upgrade trust closure. Proof/RPC costs remain high; no
controlled old/new comparison or production conclusion.

[Evidence](../../executor/verification/2026-10-24-composition-final-live-v1/README.md):
12,797 files/116,096,142compressed bytes compare with originals.
[Manifest](../../executor/verification/2026-10-24-composition-final-live-v1/manifest.json),
[integrity](../../executor/verification/2026-10-24-composition-final-live-v1/INTEGRITY.json).
Sources: resumePartialRecovery.mjs, terminalStateAudit.mjs, receiptRequestLocator.mjs,
verifyReceiptBundle.mjs and livePerformance.mjs under composition/acceptance.
Exact source snapshots are archived. Base markets do not orchestrate the full route.

## Additional preserved source references

- [livePerformance.mjs](../../composition/acceptance/livePerformance.mjs)
- [receiptRequestLocator.mjs](../../composition/acceptance/receiptRequestLocator.mjs)
- [resumePartialRecovery.mjs](../../composition/acceptance/resumePartialRecovery.mjs)
- [terminalStateAudit.mjs](../../composition/acceptance/terminalStateAudit.mjs)
- [verifyReceiptBundle.mjs](../../composition/acceptance/verifyReceiptBundle.mjs)

Branch identity: `markets-batch-capacity-recovery-20261020`.
