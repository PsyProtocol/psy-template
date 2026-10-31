# Funded Executor integration and reachable lifecycle — 31 October 2026

This continues `6eb876012d7a3c2cea22740495e203e19aa6a789` on
`markets-batch-capacity-recovery-20261020`. SDK remains
`c92880c8b6e2c8d392f19368bc8801a2584fd427` (client `b280d714a8f0930c61962c885374ea63ea63d274`,
backend `736572e9dd3ca93566471cf5a2a1cb67a13fe01d`). No Node, SDK, wallet,
deployed contract, market pricing, priority or randomness mode changed.

## Closed application boundaries

The formal Executor factory now recognizes `source-funded-v14` for AMM/Curve.
It delegates to the dedicated native `funded_stream_wallet` instead of the
legacy compact key builder. Native and JS boundaries reject Book/NFT under
this profile; these markets require a separately reviewed spending key.

The native route uses real frozen SDK APIs for explicit-checkpoint UPS start,
new-user registration membership, compact CFC proving, exact fee/burn,
source/current dependency proofs, signature/session binding and Endcap. The
same shared binder is exercised by the complete UPS test. It checks the actual
SDK transaction list, ordered call stack, direct callers, method IDs, full
input hashes/counts, source and current roots, registered key, session and
signature context. Native saved verification additionally reconstructs the key
signature proof's domain and approved checkpoint/nonce/start/end endpoints.

The exact prepared request, public source/session projection and public key
proof are hashed into its manifest. Raw signing/CFC witnesses and ordinary
private keys are not persisted. The owned producer and pinned driver/manifest
are part of the trust boundary: an arbitrary package's Endcap plus JSON trace
is **not** a generic proof of user-approved calls. A webpage cannot supply the
producer, verifier, resource addresses or success flags.

The adapter uses the existing journal/worker, account lock, sealed driver,
dependency guards, complete proof verification, immutable request, single-send
intent and exact receipt reader. Completed unsigned crypto can be adopted after
a final-read failure only through native re-verification. Unknown sends block
subsequent stages and never trigger another proof, signature, payment or nonce.
Receipt recovery checks the chain instance, common visibility and exact user/
end-leaf identity, without requiring unchanged current code merely to record an
already included transaction.

The lifecycle coordinator records separate batches and stage predecessors. It
binds ordinary stages to a wallet-owned approved-task digest, stops without that
privileged adapter, and checks original included journal evidence after restart.
Missing history fails closed. Restoring an exact receipt advances a stage even
when its next scan is idle. Two local owners cannot prove/pay the same lifecycle
simultaneously. This is **local persistent coordination**, not cross-machine
acceptance or cross-UPS atomicity.

## Fresh registration and execution gate

Registration has a separate durable exact public identity/attempt marker.
Unknown registration never resends. A known identity is checked through the
native registration Merkle/checkpoint certificate. A different allocated user ID
stops before funding; review/rebind a fresh instance plan and retain the original
attempt rather than registering another key to conceal it.

The frozen SDK default registration HTTP client does not disable redirects. The
new application route therefore uses its own existing no-redirect/no-retry
transport, exact saved wire body and bounded response/ACK wait. Four transport
unit checks pass, including byte-envelope parity with the frozen SDK request.
An ACK is never registration inclusion or a market fill.

`executor_binding` pins the SDK commit, review digest, confined artifacts and
checkpoint-1 chain root. The instance-specific `allow_broadcast: true` switch is
required before registration or financial submission; it is an operational
release gate, not a replacement for the key circuit or on-chain authorization.
Candidate identity fixtures keep it **false**. The dedicated driver rejects direct `submit` before loading policy/network
resources; only the prepared route can broadcast. No live bundle, wallet resource
or UI writer was enabled in this phase.

Formal entry points:

- `node executor/run.mjs CONFIG.json scan|once|reconcile` uses the new adapter.
- `node executor/fundedLifecycleRun.mjs PLAN.json PERSISTENT_RUNTIME` processes
  only exact approved stage inputs and receipts. It stops at `awaiting-wallet`
  or `awaiting-stage-input`; it never invents a future source, nonce or payment.
- `continueFundedRegistration()` handles registration/reconciliation separately
  from financial UPS journal records. Registration reserves zero UPS fee.
- The privileged ordinary-wallet adapter remains an integration dependency;
  this CLI does not obtain user keys or auto-approve ordinary payments.

## One reachable synthetic lifecycle

Unlike the previous independent bootstrap/conditional-settlement cohorts, the
corrected test is one state/nonce/checkpoint chain. Its genesis explicitly has
prefunded QA issuer, fee owner and ordinary user, fixed public **test-only** keys,
and registration membership for an otherwise empty SDK vault. Registration is a
synthetic prerequisite, not a registration RPC or deployment proof.

Every subsequent mutation is a real complete UPS using actual candidate
bytecode and fixed Endcap verification:

| Checkpoint | Account | Transition |
| --- | --- | --- |
| 100 | Ordinary fee owner | Authorize lifetime cap and Native transfer |
| 101 | Ordinary issuer | Native and both FT activation seeds |
| 102 | SDK vault | First-use activation, seed returns, grant/claim and fee |
| 103 | Ordinary issuer | Curve inventory and Native initialization funding |
| 104 | SDK vault | Curve initialization |
| 105 | Ordinary user | Signed limit buy, Native fee and U124 quote transfer |
| 106 | SDK vault | Fresh post-funding complete-source OPEN |
| 107 | Ordinary fee owner | Explicit higher lifetime grant and Native top-up |
| 108 | SDK vault | Authenticate/apply grant and claim original-owner funding |
| 109 | SDK vault | Cover all four declared source accounts |
| 110 | SDK vault | Execute the buy, change/refund Outbox and exact fee |
| 111 | Ordinary user | Signed FT delivery/change claims and exact fee |

The input `(2^62)+17` has two nonzero limbs. The ordinary user receives one
`10^18` base-unit asset and spends exactly `10^18` quote units after claiming
change. All FT balances/Outboxes and Native balances/Outboxes/fees conserve.
The full original source/checkpoint leaves are retained over all stages.
Fee exhaustion rejects before spending. Recovery preserves the original set,
scope and expiry; no reopen, seed, deadline extension or state injection occurs.

The recovery planner reserves **both** its own grant transaction fee and the
following task fee. Merely funding the latter could immediately exhaust the
budget again. Authorization remains explicit, nonce/key-bound and monotone.
It does not automatically raise a cap or spend an unapproved owner's funds.
An unrepresentable lifetime cap and an overflowing original-owner claim stop
without suggesting another payment.

## Preserved failure and bounded correction

The first cohort accepted eight complete UPSs and then rejected a recovery
request with `canonical inactive maintenance tape`. Its request incorrectly
reused a dummy tape constructed from the pre-freeze header. The circuit was
correct to reject it. Recovery must construct its canonical inactive tape from
the **original now-frozen header**, while retaining the active source unchanged.
This validation now also runs before expensive CFC proving.

All original outputs remain intact. Original bounds were 12 positive UPSs and
2,400 proof-process seconds, with zero market compiles/finance. The explicit
`PLAN-v2.json` amendment authorized one additional 12-UPS offline cohort (20
accepted unique UPSs total including the prior eight), at most another 1,900
seconds, while retaining the 2,400-second aggregate ceiling and every financial
ceiling. The original ephemeral keys were never persisted; the corrected cohort
uses fixed public test keys. The two cohorts are separate synthetic initial
identities and must not be spliced into one chain.

The final 12 UPSs pass. A separately sealed verifier re-verifies all 20 saved
Endcaps and metadata; changed public fees reject. This independent Endcap check
does not independently establish the approved stack; the actual producer/key
binding above remains essential. A pure native regression rejects a stale
maintenance header, malformed width and duplicated source account without a
circuit build or RPC. There are 87 scoped JS passes, a separate public-audit attack regression and
four transport unit passes. Mock-native registration/transport tests are explicitly labeled and are
not real payment acceptance.

## Measurement scope

| Final synthetic cohort | Measurement |
| --- | --- |
| Whole test process | 596.735 s |
| Cold stream resource construction | 99.784 s |
| Six SDK tasks, proving and audit | 328.874 s total |
| Six ordinary tasks, proving and audit | 163.182 s total |
| Final ordinary signed claims | 24.361 s |
| Sampled process-family RSS peak | 4,050,368 KiB |
| Ordinary Native fees | 6.000036 synthetic PSY |
| SDK Native fees | 6.000090 synthetic PSY |
| Total Native fees | 12.000126 synthetic PSY |
| Actual network fills / registrations / claims | 0 / 0 / 0 |

The first failed process took 433.384 s and peaked at 3,853,696 KiB sampled
family RSS. Both complete one-second sampling series and all failures remain.
RSS includes shared pages and is not physical footprint. These are functional
synthetic measurements; host regressions/builds occurred concurrently, ordinary
signature construction/audit/cleanup are not a new isolated baseline, and the
formal subprocess driver is not this in-process test harness. There is no
matched speedup, cold-SDK-compile comparison, p95, chain TPS or steady-state
claim. Stage timings are not treated as additive network latency.

## Current read-only observations and remaining gates

After the offline phase closed, a separate maximum-eight-request diagnostic made
exactly eight reads and no writes. Python TLS failed for all three configured
endpoints. Node fetch obtained the expected Realm 0 checkpoint-1 root; Realm 1
and coordinator returned TLS `ECONNRESET` before a secure connection. Realm 0
head was 29242 and a QA contract-8 issuer slot read returned zero successfully.
This no longer reproduces the former missing-height error for that one read;
it neither proves metadata globally repaired nor establishes the complete
current chain/dependency/finality preflight. No further retries or sends occurred.

| Remaining boundary | Required next evidence |
| --- | --- |
| Real instance/key/vault and ordinary arrival | Full fresh all-endpoint preflight, actual-ID build/bind, bounded new registration/setup, exact receipts and ordinary-wallet claims |
| Wallet integration | Privileged wallet-owned adapter, installed instance resources and real extension approval; no webpage verifier injection |
| Fee-owner unavailable / unused treasury | Explicitly unresolved; current recovery requires the configured ordinary owner, not forced service or permissionless treasury exit |
| Book/NFT startup | Distinct funded bootstrap/fee spending policy with global price/time or buyer priority; v14 remains rejected, existing candidates/deployments unchanged |
| Real admission/window/budget | Complete current inventory and original C+32 fit including every fill/refund; synthetic four-account source is not a full-network capacity result |
| Upgrade authorization / finality / randomness | Existing external requirements unchanged; deterministic mode remains, no qualified beacon or causal seal-before-seed claim |

Book/NFT financial integration is not promoted through AMM/Curve's policy as a
shortcut. Their current ordering and winner semantics stay intact until the
distinct bootstrap/key and full-UPS gates pass. Multiple stages/UPSs remain a
recoverable workflow, not cross-vault atomic execution or complete-pool parallelism.

See [public requests, proofs, preserved failures and reproduction](../../executor/verification/2026-10-31-formal-funded-executor-v3/README.md).
