# Composition service candidate — local acceptance, 2026-10-24

Branch: `markets-batch-capacity-recovery-20261020`.
Baseline: `9acb6d614f6aad7b7e9a1fe5c6e0cb9e71273363`.
No Node, SDK, pricing, controller bytecode, SD-key policy or old contract update
is part of this change. This is not a production certification.

## Implemented

Formal `composition/run.mjs` uses `composition/service.mjs` for reconciliation,
action selection, bounded session recovery, orderly shutdown and unsigned
ordinary-owner final-claim handoff. The service holds no ordinary owner key.

Recovery requires a matching sealed proof-child response, exact
`start-compact-session` rejection for a pinned HTTPS endpoint, a regular output
directory containing only matching `failure.json`, and positive no-broadcast
evidence. Source, dependency, key and journal identities are checked. The old
proof child must exit before rebuilding. Restart reservations persist in the
financial journal; unresolved broadcasts block new business operations. Generic
errors, partial proofs, unknown ACKs and security failures do not authorize
substitute financial requests.

`composition/buildResources.mjs` reuses only three immutable source/IR/layout
verification closures, within one process and exact financial scope. Bound
inputs/tools are rehashed on every reuse. Live state, nonce, fees, signature
context and full UPS checks remain fresh. No transaction witness is cached.

An optional separate authority supplies authenticated leases and a durable
journal. Local HTTP/process tests cover contention, death/takeover before
broadcast, append ACK loss, authority restart, stale fences and no-send evidence.
See `executor/coordination/README.md`. Two physical hosts are unavailable;
cross-machine financial validation is not claimed.

## Matched source-verification experiment

Same machine, dependency, sealed driver, immutable configuration and live
read-only identity checks. ABBA order after a separate priming run:

| Adapter reconstruction | Trial 1 | Trial 2 | Median |
| --- | ---: | ---: | ---: |
| Full source verification each time | 207.000 s | 219.534 s | 213.267 s |
| Reuse verified immutable closures | 13.143 s | 11.321 s | 12.232 s |

Priming took 212.494 s. Two repetitions per variant establish reduced adapter
reconstruction cost, not faster transaction proving, settlement TPS or a matched
end-to-end trade speedup. No transaction was signed/broadcast by this experiment.
RSS endpoints are observations, not whole-process peak memory.

All five original rows are retained. The original benchmark failed while
serializing a fractional ratio through the integer-only protocol codec, after
all trials completed. `finalizeBuildBenchmark.mjs` checks those original rows,
identity/configuration/cache hits and exclusively writes the missing summary.
No trial or failed log is replaced. Future runs use the observational serializer.

## New isolated financial acceptance

New controller **2494**, vault **117952**, owner **406720**. QA-A 2483 and QA-B
2484 use 18 decimals; test PSY contract 0 uses 9. No pUSDT is used.
Independent publisher deployment request:
`3fe717a2e5076cc7b8ee064dd6fa9308e4694583329a631275571970729d50e8`.
Registration checkpoint: 372739.

An earlier deployment returned a historical receipt for old controller 2492.
The fresh-occurrence guard rejected it before registration or funding. Request,
rejection and logs are preserved; possibly allocated 2493 is unselected and
unfunded. Content hash is not a unique queued deployment occurrence; an index
404 is not cancellation.

Planned flow: ordinary funding plus cancellation in one UPS; explicitly injected
proof-session read rejection; formal service rebuild; controller fund/return
UPSs; ordinary-wallet claim of the exact exported unsigned request. This is a
zero-fill recovery case, separate from the baseline's real two-pool successful
trade and one-fill intermediate-asset recovery.

**Status: financial run and post-run proof/accounting audit in progress.**
Completion requires complete marker, ordinary claim proof, exact fee accounting,
zero controller residual and cohort audit; planned steps are not passed evidence.

## Frozen dependency and external evidence

SDK manifest remains
`0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`;
the 1,466-file local snapshot and lock/config/genesis hashes remain frozen.
The user identified `release/testnet-stable` as the deployment branch; a branch
name or HTTPS observation does not attest the running binaries.

| Owner | Required delivery and acceptance |
| --- | --- |
| Runtime operations | Coordinator/realm/edge binary or image digests linked to reviewed commits/config; authenticated checkpoint and state anchors. |
| Security/operations | Effective upgrade RPC auth configuration and isolated unauthorized/replay rejection evidence; code/layout trust boundary. No old-contract upgrade probe. |
| SDK maintainers | Reviewed reproducible release matching frozen session binding, source/toolchain and dependency locks. Upstream migration remains separate. |
| Deployment API | Caller-bound idempotency and durable accepted/queued/included/rejected/expired status; terminal rejection/expiry guarantees no later enqueue. |
| Randomness provider | Authenticated unpredictable, hard-to-bias future seed/checkpoint proof, commit-before-reveal and timeout/non-redraw rules. Deterministic mode remains enabled. |
| Execution operations | Future second host, authenticated TLS authority and identically mounted durable artifacts, tested partitions/fencing/takeover. User currently requests local acceptance. |

Test counts and startup speed do not close these boundaries. Selected-queue
completeness does not prove global inclusion or censorship resistance. Multi-UPS
composition remains a staged financial workflow, not cross-vault atomicity.
