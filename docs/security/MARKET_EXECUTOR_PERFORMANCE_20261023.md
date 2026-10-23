# Executor measurement ledger — 2026-10-23

Frozen SDK manifest `0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`;
same frozen full-UPS test binary `87b8147a…648d533`; same host, fixtures, four
members/market, 12 economic fills/profile, two processes with two Rayon threads
each. Fixed40 ran first, compact second, one sample each. Host load/cache/order
bias is uncontrolled; JavaScript review/edit/tests and one read-only RPC scan
ran during proving. No other intentional financial proof job or submission.
No SDK migration. This **remeasures the existing compact optimization**; it
must not be attributed as an algorithmic gain from this round's telemetry code.

## Full synthetic proof observations

| Market | Cold build fixed / compact (s) | Warm commit+settle fixed / compact (s) | Observed ratio | Process peak RSS fixed / compact (MiB) |
| --- | ---: | ---: | ---: | ---: |
| AMM | 116.811 / 103.409 | 598.817 / 180.490 | 3.318 | 1303.3 / 1805.1 |
| Orderbook | 93.675 / 82.503 | 602.971 / 182.722 | 3.300 | 1059.6 / 1936.2 |
| Curve | 100.786 / 98.369 | 579.990 / 205.737 | 2.819 | 1699.6 / 1811.0 |
| NFT Market | 101.975 / 100.040 | 577.546 / 194.755 | 2.966 | 1781.1 / 1875.5 |

Warm intervals are complete mathematically verified commitment and settlement
UPSs: stack, signature-session context, public endpoints and exported deltas.
Every pair agrees on final contract state, modified slots and burn amounts.
Compact physical calls: commitment 3; settlement AMM/Book 19, Curve 23, NFT 21,
including burn. Canonical noops are absent. Fixed40 noop steps cost 185–211 s
per market; compact end-cap prove+verify still costs 83–96 s combined. Call
steps include recursive work; a separate compression-only cost is not isolated.

Cold build is **circuit construction**, not Cargo/SDK download/build. Timed
process wall includes that build and both proofs: fixed40 682–718 s, compact
267–306 s. Two-process group wall: 1401.120 s / 592.164 s. Do not add overlapping
process peaks or call group proof rate network TPS.

`/usr/bin/time -l` maximum resident set size is bytes on Darwin. The table uses
2^20 bytes per MiB. Raw logs also retain Darwin's different `peak memory
footprint` counter; it is not silently substituted for RSS. **Measured compact
RSS is higher in this run.** No memory reduction or increased safe concurrency
is established. Keep existing bounded concurrency; more memory samples are
needed before a resource-budget change. Single samples do not establish a
statistical speedup or a cold-build improvement.

Synthetic fees (commit + settle) are identical before/after: AMM 2.000061,
Book 2.000068, Curve 2.000065, NFT 2.000099 test PSY equivalent burn amounts.
They are verified proof results, **not new network fee debits**. Fixture funding,
admission, ordinary signatures/claims, RPC and confirmations are excluded.
Proof byte arrays are internally verified by the frozen binary; this synthetic
fixture exports reports/logs, not independently replayable serialized UPSs.

## Actual network observations remain separate

The completed isolated maximum case used production CLI admission and 12 fills.
Its 2026-10-22 order-to-last-ordinary-claim envelope was **9948.625 s**, including
deliberate cold comparisons, failures, operator resumes, sponsorship and index/
common-state waits. Actual included fees in the post-order accounting interval:
**32.000504 test PSY**; order fees were outside that interval. QA FT/NFT were
used, existing pUSDT was not. Warm/cold actual preflight pairs: seven complete,
Curve settlement cold missing after a read-only connection failure. Preserve
that missing sample. The old report has **no memory measurement**.

Saved-proof verification + fresh checks + acknowledgement: approximately
19–27 s; acknowledgement-to-common-indexed observation: 25–195 s in that run.
These are composite stages; transport-only latency and server finality were not
isolated. Ordinary claim process and observation timings are in the unchanged
`maximum-cost-report-v1.json`. The new formal CLI read-only scan at checkpoint
368187 observed 6.213 s and parent Node RSS endpoint 82,509,824 bytes. It proved
and submitted nothing; that memory endpoint is not child peak RSS.

## Artifacts and unclosed measurements

`executor/verification/2026-10-23-review-v1/full-ups-resource-comparison-v1/`
contains 30 files / 41,736 gzip bytes, original/compressed hashes checked.
Originals: `/tmp/psy-market-profile-resource-20261023-v1`, including frozen
source hashes and SDK digest. Existing real request/proof/receipt archive stays
unchanged under the 2026-10-21 candidate evidence directory.

Remaining: repeated/alternating-order samples, per-phase child RSS, controlled
end-to-end before/after confirmation/claim comparison, actual economic watch-
service lifetime acceptance, adaptive pre-freeze batching, and further recursive/
end-cap improvements. No Node changes or weakened checks are justified by this
ledger. No chain TPS or production certification is claimed.

## Closed-case formal Executor report

`executor/acceptance/livePerformance.mjs CASE FRESH_REPORT.json` reads a case
only after `public/COMPLETE.json` confirms ordinary claiming and the economic
audit. It performs no RPC, proof or broadcast. It separates resident startup
observations from per-proof timings, parent adapter phase walls, ordinary wallet
process walls, saved-proof verification/fresh checks/acknowledgement, and the
subsequent exact indexed/common-state observation. Failed preflight logs and
failed phase counts remain visible. Overlapping operation sums are not case wall.

No cold startup is inferred from a warm zero; missing startup remains null.
Child peak RSS, matched live before/after speedup and chain TPS remain null.
Network magic/profile and source/binary/SDK hashes are retained from the case.
This is a report over the existing acceptance assertions, not a new cryptographic
receipt verifier. Three focused regressions cover construction ambiguity,
failure accounting, closed-case gating and references outside the case.

The opt-in fallback case is running in
`/tmp/psy-market-fallback-live-20261023-v1`; completed stages alone are not its
final economic acceptance. Its original source hashes and raw evidence remain
unchanged. The final report must wait for settlement, ordinary claim and audit.
