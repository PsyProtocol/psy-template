# Reachable Orderbook proof chain — 11 November 2026

The corrected synthetic QA chain has **24 complete UPSs**: 13 ordinary-signature
and 11 v19 SD-key UPSs. Three exact startup proofs are reused after verification;
21 new complete proofs extend that prefix. The earlier failed setup has four
additional complete proofs on a separate abandoned branch. There are 28 distinct
new complete UPSs in the case, not 31 sequential transactions.

The chain starts with an empty registered vault and explicit QA genesis assets.
Every subsequent actor mutation is a complete signed UPS. It includes real
issuer/recipient seed transfers and claims, funded whole orders, complete
two-page source coverage, original price/time frontier, one match and both
ordinary final claims. A new unmatched order is cancelled after sealing, refunded
after the original expiry and claimed by its original owner. Exact U124 amounts,
FT/Outbox conservation and Native conservation including every fee pass.

Fee exhaustion stops before the fourth vault UPS, after the first coverage page.
An ordinary owner grant and its application restore service without changing
the frozen set or expiry. Changed scan cursor and duplicate fill/refund reject.
This cohort does not certify fee-owner-offline exits or unused-treasury return.
Issuer activation FT seed claims are also outside this chain; pending Outboxes,
Native activation contribution and tagged treasury must retain separate owners
and accounting. Conservation does not imply every contribution was returned.

All 24 saved Endcaps and public metadata independently verify under the retained
frozen SDK verifier and common data. Changed fee, end endpoint and proof bytes
reject for all 24. That executable does not separately establish approved call
stacks or state-delta cryptography. The producer's compiled policy/SDK session,
ordinary signatures, exact stack/session binding and bytecode endpoint checks
provide separate evidence. The JS graph audit is structural only.

The failed source setup, stopped intermediate compile, rejected logical-versus-
compact recovery mapping and all slow samples remain immutable outside Git.
The successful process takes 2,073.638 seconds, including 675.572 seconds of
resource construction. Sampled family RSS peaks at 1,240,496 KiB. A live macOS
footprint snapshot reports a 7.3 GiB charged peak, including swapped/compressed
pages; it is not a final exclusive physical-RAM peak. Heavy shared-host swapping
precludes a matched speed comparison. Reused-prefix timings belong to the old
run and cannot be added as current proof time. These are offline measurements,
not confirmation latency, browser claiming, TPS or a production verdict.

Reproduction uses the frozen SDK source, `prepare_audit_application.py --test-only`,
and `nightly-2025-09-20`:

```sh
cargo +nightly-2025-09-20 test --offline --locked --release \
  --features sdk-audit-v1 --test batch_lifecycle --no-run
BATCH_BUILD=/path/to/reviewed-current-native-fixtures \
BATCH_MINIMAL_GENESIS=1 BOOK_REACHABLE_OUT=/path/to/fresh-output \
  /path/to/batch_lifecycle reachable_orderbook_ordinary_orders_fill_cancel_refund_and_claim \
  --ignored --nocapture --test-threads=1
node batching/checkpoint-stream/audit-reachable-book.mjs /path/to/fresh-output
```

A fresh run without prefix environment variables proves all 24 stages. Reuse is
restricted to the explicitly hash-pinned original three-stage public prefix;
it cannot import arbitrary state or send a network request. Each independent
verification must use a separately built/reviewed fixed verifier; the case
orchestrator pins the exact retained executable, not an arbitrary replacement.

`RESULTS.json` provides one public request/hash graph, source/artifact provenance,
budget/failed-run summaries and scoped verification results. Raw requests,
proofs, logs and source snapshots remain at
`psy-market-recovery-20261023/markets-core-acceptance-20261111-v1`.
No secrets, signing witnesses, SDK copies or proof dumps enter Git.

No current-chain registration, deployment, faucet request, financial send,
network fill, ordinary network claim or browser payment occurs. A bounded live
source capture stops at a TLS failure with only 22 observed nonzero leaves;
it is incomplete and cannot authorize funding or prove global inclusion.
