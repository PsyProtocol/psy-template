# Fresh stag AMM acceptance — 16 November 2026

New QA assets **56/57**, AMM **58**, and dependency-bound SD-key vault **570752** are registered/deployed on the current stag chain. The eight allocated-bytecode complete UPS gates passed. The bounded real journey is running; real AMM settlement, its final ordinary claims and browser acceptance are not yet reported as complete.

## Confirmed fresh funding and deployment

[Funding evidence](evidence/STAG_CORE_AMM_FUNDING_20261116_v1.json) records issuer **1975680**, trader **1136000**, and exactly one faucet grant of **1,000 test PSY**. The grant confirmed at checkpoint **148670**. The faucet returns the operator end-user leaf hash; the existing exact historical-leaf reader linked it to the services content hash. A timing-only write failed after the response was durable. Original response, error and send lock remain intact; reconciliation did not re-apply.

The issuer's actual ordinary Native claim confirmed at checkpoint **148714**, with fee **1.000002 test PSY** and spendable balance **998.999998 test PSY**. Its exact saved UPS also passed the independent frozen verifier/common-data check. This is a current-chain ordinary SDK funding/claim result, not an AMM swap or browser approval.

[Deployment/provisional evidence](evidence/STAG_CORE_AMM_PREDEPLOY_20261116_v1.json) records QA assets 56/57. Both use fresh **0 to 15 field** layout proofs. AMM 58 uses a fresh **0 to 58 field** layout proof and code root `b7493cacdb148ec8edb39495444024213142388f2b3a0fff0618650d1903724c`. All three have numeric deployer 1975680. No old contract was updated. Vault 570752 registration membership was verified at checkpoint **149361**; an initially empty public lookup was index delay, not a second registration attempt.

QA-only source fixes issuer, distinct symbols and 18 decimals. The production FT still supports configurable precision. Older QA source/artifacts remain preserved. The real journey separately authorizes 200 QA units per asset; synthetic initialization minted 100 per asset and does not establish live issuance. Existing pUSDT is not used or relabeled.

## Dependency-bound SD-key

The legacy key pinned calls, callers, inputs, stack and session, but relied on application guards for reviewed dependency roots. A full proof of changed registered code alone would not establish that it is the reviewed version.

The explicit `selected-dependency-bound-v1` key now authenticates checkpoint-one chain membership under the actual signed checkpoint-tree root; the current checkpoint's full global roots/stats under its signed checkpoint-leaf hash; and four full contract leaves, including deployer, code/function/layout roots and dimensions, under that checkpoint's contract tree. Private metadata extends the existing business witness; only the typed public checkpoint/contract opening is archived. No signature/private-key witness is persisted.

New fingerprint: `44b19042b8640b5b0e97c59b7da49e0de155e79c06181a55a1b32ec64fdf7e4b`.
Public key hash: `be05afbe0bf56933c16cb275d26f1ed27e36f48770c1f1b9b70a2a12dff1c14c`.

Legacy key fingerprint/public-key regression is unchanged. No registered legacy key was replaced. New funded admission requires the bound profile; recovery of existing legacy instances remains available. The rebuilt v7 tool additionally compares complete current dependency leaves and their same-checkpoint Merkle paths before sending/reusing a prepared request, closing the deployer-only freshness gap. Its key identity exactly matches v6. The new pure negative freshness unit was added but has not been executed; compilation and subsequent live freshness checks are distinct evidence.

## Completed offline gates

[Compact allocated-key evidence](evidence/STAG_CORE_BOUND_UPS_20261116_v1.json) retains request/opening/report digests and public outcomes, without duplicating raw proofs into Git.

| Gate | Complete UPSs | Scope |
| --- | ---: | --- |
| Fresh activation | 1 | Actual allocated contracts/vault/key; synthetic authenticated checkpoint |
| Commit and swap settlement | 2 | Same reviewed bytecode and key; one synthetic fill |
| Commit, expire, recommit, refund | 4 | Linked synthetic state chain; four members; cancellation/recipient claims in VM |
| Ordinary claim | 1 | Actual FT/vault identities; seeded Outbox and synthetic ordinary signer 201 |

All seven SD-key requests use vault 570752 and its exact new public key. Complete proofs passed fixed SDK verifier/common-data checks, with exported state/endpoints checked. The ordinary claim separately rejects corrupt proofs and altered nonce, signer, checkpoint, roots, fee and call count. Its seeded Outbox is not the eventual live swap output.

Seven host opening attacks, four direct SD-key constraint attacks, and two signature/witness-shape guard attacks reject. Their evidence labels distinguish host rejection from circuit rejection. Two dependency-shape unit tests and 40 relevant host regressions passed. The earlier four provisional complete UPSs remain historical evidence with explicitly provisional IDs and legacy key; they are not silently promoted to allocated-key acceptance.

The executed activation report's old label says “40-call”; authoritative measurements show **40 logical policy slots and seven actual calls**. Only future wording was clarified; the original report was retained.

## Formal live journey and limits

One root-owned supervisor executes the formal Executor route: ordinary issuer/trader setup, vault activation, liquidity, one swap and its actual ordinary claim, then a cancelled order and its refund/claim. Complete validation, exact stack/session/sig_hash, identity, network, roots, nonce, expiry, fees and endpoints remain mandatory. Exact requests/broadcast intents are durable before one send. Unknown results stop and reconcile; no automatic replacement/re-sign/payment.

This fresh case permits two ordinary identities, two QA FTs, one AMM and one vault. One faucet request is already used. Aggregate ceiling: **24 UPSs / 75 test PSY fees**; the live journey reserves **20 UPSs / 60 test PSY**, with a one-hour job cap inside the original six-hour master window. The synthetic proof ceiling is 12: four provisional plus eight allocated. No financial budget was expanded for build fixes.

The Native ordinary approval guard requires actual SDK registration/session identity, exact starting raw leaf and next nonce, successful fresh nonce read, same-checkpoint raw membership, complete proof and final endpoints. First use additionally requires the actual SDK new-user context and authenticated raw zero leaf. Formal restart terms remain strict: changed saved deadlines/quotes/source inputs or missing historical snapshots require review; they are not silently recreated.

## Measurements and remaining boundaries

These are gate timings on a shared workstation, not a matched performance experiment: activation process **345.820 s** (cold resource build **218.775 s**, measured proof portion **110.285 s**); commit/settle process **409.769 s**; four-step recovery **570.331 s**; ordinary claim **158.854 s**. The largest sampled family RSS among these runs was **1,025,504 KiB**. Sampling may miss peaks and sums shared pages; it is not true physical peak memory. Phase overlap must not be added. No chain TPS, p95, stable throughput or general speedup is claimed.

SDK remains `01b8f2b0a077367a7b9879baba1a72aea8ab5510`, client `7058070057c3242b5d8b29e1a31d498aaa4202c0`. All 2,759 recovered SDK source files and frozen lock inputs were checked. Historical profile names select this freeze. Existing Go 1.26 is selected through PATH; no Node/SDK source or dependency version changed. Tool build timing is separate from cold proving-resource construction.

Observed checkpoint membership is not an independent consensus-finality certificate or runtime-image attestation. Qualified randomness, seed-publication timing, whole-market inclusion, cross-machine coordination and browser UI payment acceptance remain unverified/disabled. Shared vaults, deterministic selected orders and existing pricing remain unchanged. No unrelated-user scan is added.

After AMM, each additional market needs a separate bounded plan: Curve needs inventory within available QA supply and actual finite-configuration proofs; Orderbook needs two parties plus a distinct sponsor; NFT needs a fresh collection and same-UPS approval of expected token/metadata. NFT writes remain closed until that identity constraint exists. None is accepted merely from AMM results.

Raw requests/proofs, old failures, wallets/backups, binaries and caches stay in the protected local case. Only source and compact public review evidence are pushed. The preserved unresolved old sponsor request remains separate and is never replayed with these new identities.
