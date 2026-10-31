# Deterministic funded bootstrap candidate — 31 October 2026

## Scope and release decision

This closes the AMM/Curve **synthetic first-use bootstrap** gap for a new
deterministic spending-key profile, v14
`source-covered-deterministic-funded-bootstrap-v1`. It does not activate the
profile, deploy a contract, enable UI payments or establish production readiness.
The existing v5 AMM/Curve, v9 Orderbook/NFT and all random-profile artifacts are
unchanged. The four markets are not all promoted by this result.

Application baseline: `90a02e16ab8e247812559c5d5dd45d8984c60ce7`, branch
`markets-batch-capacity-recovery-20261020`. SDK remains
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. No Node, dependency, old contract,
wallet, UI, market pricing, U124 arithmetic or random-source change is made.

Root was the sole proving owner. This phase declared at most four market
compilations, four positive complete UPSs and 1,800 proving seconds, with zero
live RPC reads and zero financial operations. It used two market compilations
and four successful complete UPSs. The failed run and diagnostic replay remain
separate evidence; no request was broadcast or replaced. Financial ceilings,
consumed faucet requests and original unknowns are unchanged.

## Implemented authorization path

The [new generator](../../batching/checkpoint-stream/funded-generate.mjs) preserves
each existing deterministic market method body, adding a guard reserving the
fees-only principal. It adds a separately authorized, monotonically increasing
lifetime Native fee cap, nonce and registered-key identity. This is not a
per-batch resettable allowance. Every transaction ends with exact cumulative
fee accounting followed by the Native burn in the same UPS.

The [spending key](../../amm/u124/vm-tests/src/stream_policy.rs) binds:

1. First-use nonce zero, signed nonce one and an empty user-contract-state root.
2. The original nine-slot activation sequence: claim the exact Native fee seed,
   claim one unit of each FT, activate the vault and return both FT seeds to the
   original payer's Outboxes. The seeds are not counted as recipient-claimed.
3. Only then apply the ordinary owner's authentic grant and claim that owner's
   exact pending Native funding. Preloaded vault inventory is not assumed.
4. The exact registered key, payer, call order, callers, parameters, complete
   session/signature context, current code/layout/function roots and endpoints.
5. Fee accounting at logical slot 38 and the matching Native burn at slot 39.

Later grant updates can advance an authentic lifetime cap without a new deposit;
they cannot reset spent fees. A grant-only first transaction is rejected, so it
cannot preempt the activation nonce. Available Native funds do not by themselves
authorize expenditure beyond the cap. This phase does **not** implement a new
refund or withdrawal right over unused owner funding; an operator must not
present the cap as a refundable deposit or a bounded service guarantee.

The original deterministic complete-source ordering, cursor, settlement and
refund code is retained. The original C+32 source deadline is unchanged.
This bootstrap evidence does not prove that real full-source inventory fits that
window or sponsor budget, nor does it replace settlement/expiry acceptance for
the new v14 key.

## Failure, diagnosis and correction

The first AMM bootstrap reached all CFC calls, including fee accounting and burn,
but its spending-key proof failed. A replay of the **same public session** with
synthetic constraint diagnostics identified six failing 24-bit comparison rows.
The diagnostic exported gate/row/constraint indices, not witness values.

The new bootstrap reuses field 22 for a 62-bit fee cap. Three inactive claimant
order comparisons still read it under the old deterministic branch. The fix
masks their operands only while settlement is inactive; active settlement still
compares the original owners at the original range. No cap truncation, deleted
check, SDK patch or alternate verifier is used. This changes the new key
fingerprint; the final run generated fresh CFC/key/signature/Endcap proofs.

The first failed run lacked a pre-run executable digest and used a mutable Cargo
cache binary. Its source snapshot is preserved, but binary attestation is not
claimed retroactively. The final executable was copied, hashed before use and
unchanged afterward:
`56687ed4efb66cb1e0103095857560657b84ae9904a78c06ae2f9747423a132b`.

## Validation and measurements

All checkpoints and identities below are **synthetic offline fixtures**. Ordinary
grant/seed/setup actors execute actual VM bytecode, but their prerequisites are
not signed ordinary UPSs or network receipts. Contract 1000, vault 100, owner 600,
issuer 5 and assets 42/43 must not be reused as current deployment identities.
Both 62-bit limbs remain active for FT amounts; the returned seeds are exactly
`[1, 0]`. The 100 PSY fixture cap is synthetic; real expenditure is zero.

| Market / operation | Complete UPS result | Interval seconds | Synthetic Native fee, base units |
| --- | --- | ---: | ---: |
| AMM empty-vault activation + grant/claim | Pass | 75.538 | 1,000,013,000 |
| AMM subsequent grant without new funding | Pass | 30.810 | 1,000,002,000 |
| Curve empty-vault activation + grant/claim | Pass | 72.537 | 1,000,012,000 |
| Curve initialization | Pass | 43.549 | 1,000,010,000 |

Cold resource intervals were 102.931 s AMM and 96.566 s Curve in one process.
The entire successful child lifecycle was 428.391 s. Its one-second sampled RSS
peak was 5,502,096 KiB (~5.25 GiB). This is child RSS, not unique physical memory,
host peak, process-family memory or an allocation profile; short inter-sample
peaks can be missed. No raw per-second RSS series was retained by that runner.
Compiler builds, failure/diagnostic processes and subsequent tests are separate
intervals. The failure took 139.396 s; the public replay test took 105.26 s.
There is no matched before/after workload, warm steady-state sample, confirmed
trade, ordinary claim, p95, chain TPS or speedup conclusion.

Each final complete proof uses the frozen Endcap verifier/common data. The
bootstrap key also rejects coherent wrong-network, code/layout/function-root,
checkpoint/chain-anchor, session-nonce, ordered-stack and fee mutations, plus
first-use grant-only preemption. These are key-circuit checks, distinct from the
public JSON consistency auditor.

A separately built and sealed `verify_saved_ups` process re-verifies each exact
saved request against the fixed Endcap key/common data and public endpoints/fees.
All four pass; all four otherwise-identical requests with changed public fees
reject. No new proof is generated. This verifies preserved Endcap bytes and
public-input binding, not an independent reconstruction of the approved call
stack. The original spending-key/session tests establish that separate boundary.

Two bytecode regression tests pass across both markets: invalid nonce/cap/key/
payer and excess seeds roll back; replay rejects; funds/fees conserve; unauthorized
or decreasing grants, zero keys and out-of-range caps reject without writes; a
funded vault with an insufficient signed cap rolls back the **entire** activation,
seed return and funding claim. The added VM tests do not change production
circuit source or the four accepted proof identities.

Eight generator/policy regressions pass, including legacy deterministic and
paired semantics. Three public-evidence tests pass with twenty changed-envelope
cases. Their auditor checks exact activation/grant/maintenance calls, caller,
argument count, U124 seed quantities, stored-zero first-use versus signed initial
leaf, state edges and fee sums. It explicitly does not authenticate a proof.
Its first version rejected null-prototype JSON objects with matching fields;
that failed test log is retained. The correction compares exact projected field
sets/values, without relaxing caller, parameter or state checks.

## Remaining production gates and next sequence

| Gate | Status and required work |
| --- | --- |
| New AMM/Curve deterministic bootstrap | Actual bytecode, key and four complete synthetic UPSs pass; not registered/deployed live |
| v14 full continuous settlement/recovery | New key must run complete-source, trade, refund, expiry and restart paths; bootstrap-only evidence is insufficient |
| Orderbook/NFT bootstrap | Still open for their deterministic keys; NFT activation has distinct asset/acknowledgment semantics and must not inherit AMM's two-FT sequence |
| Real admission/service budget | Full authenticated Native source inventory, C+32 fit, sponsor cap and remaining refunds need an actual-ID bounded plan; do not raise the window or omit accounts silently |
| Unused fee treasury exit | No new withdrawal mechanism is implemented. Its authority, outstanding liabilities and exact terminal balance need separate contract/key design and acceptance before promising refundable unused funding |
| Reliable live metadata | No reads in this phase. Last prior capture at checkpoint 27105 returned Realm 0 height zero for fixed/latest queries. Fresh full preflight is still required; this report does not assert recovery |
| Upstream protocol boundaries | Enforced dependency-upgrade authority/immutability, accepted snapshot age and cancellation/admission precedence still need concrete runtime/configuration and rejection evidence; client checks are not consensus |
| Wallet and real UI | Reviewed instance resources remain uninstalled. Ordinary approval, exact send/unknown reconciliation, confirmation, final claim/refund and browser restart/competition remain required |
| Random mode | Not enabled. Qualified entropy, finality and causal seal-before-seed-release authentication remain open |
| Dual-pool and continuous operation | Revalidate current-SDK/current-chain success and actual intermediate-asset recovery only after the single-market user loop; multiple UPSs remain a staged workflow |

Next close v14 continuous deterministic settlement/refund acceptance, then the
separate deterministic Book/NFT activation paths, followed by actual-ID planning
and fresh live preflight. Reuse the generic wallet route and existing proof
resources; do not loosen gates or claim unused owner funding can be withdrawn.
No production, global fairness, cross-machine or cross-vault atomicity claim
follows from this milestone.

See [public proofs, retained failures, reproducibility and checksum inventory](../../executor/verification/2026-10-31-deterministic-funded-bootstrap-v1/README.md).
