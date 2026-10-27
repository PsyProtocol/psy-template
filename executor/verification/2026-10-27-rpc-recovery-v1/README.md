# RPC recovery and deployment identity boundary

At 2026-10-27 01:24 UTC, the configured staging realm0, realm1 and coordinator
returned HTTP 200 and checkpoint 2746. This is a recovery from the earlier 503
observations, not evidence that the previous deployed environment still exists.

The latest block state reports `next_contract_id = 6`. At checkpoint 2752 the
coordinator explicitly returned `Contract leaf not found` for QA FT 2483, AMM
2485, Orderbook 2497, Curve 2498 and NFT Market 2499. The former UI registry cannot
be reused as a live deployment registry on this RPC state. This is consistent
with a reset or environment replacement; runtime image/commit identity is not
established by these observations.

Current checkpoint-one `global_chain_root`:
`24fe11facdc008ad5a6e6408da654217380b798af1ddb7df59845dfecd395942`.

| Native contract 0 identity | Previously reviewed registry | Current RPC observation |
| --- | --- | --- |
| Code root | `53735dc64de34c4a84281e22a3d1606d983ad6d617ab717480421883fc88d4ba` | `f54490d8ed6ccd5bb06f3c42193a5b11ce7bd252c9eae2c3697f9f3e483e26ee` |
| Function root | `0edd80f59d1f57f729df03a8612d44be1b4b12fae3565d517c78ea5bf6deb09d` | `9c64e00be65354f10b2453ceac2d94a790209ae7f8caefe86563a3a199185e8b` |

Native code/root changes require compatibility and proof/key validation with the
selected frozen SDK before deployment or a financial call. No dependency switch,
weaker identity checks, old-contract update probe or financial submission was
performed. A returned random_seed field does not establish circuit-authenticated,
unpredictable or unbiased future randomness; deterministic ordering remains.

## Concrete execution order

1. Establish the current network/chain identity and verify native ABI/code/layout,
   proving/key/session and request compatibility with the fixed dependency. Scope
   every new account, request and artifact to the new identity. Preserve old
   receipts, unknown-broadcast journals and registry without replaying them here.
2. Prepare a fresh isolated QA deployment manifest for FT/NFT and the four markets,
   independent controller/keys/vaults, within a newly recorded bounded plan using
   the existing authorization. Register and deploy only after the complete fresh
   preflight passes. Preserve all code/layout/function/key and fee evidence.
3. Rebind the existing English UI to the accepted new deployment manifest and
   actual balances/orders/receipts. Separately close the wallet-owned native
   full-call/session verification, explicit approvals and exact submit/reconcile
   path. RPC recovery does not close the known SDK packaging/declaration or wallet
   attestation gaps. Keep web broadcasts disabled until those gates pass.
4. Contract optimization and regression may proceed independently offline, keeping
   shared vaults, deterministic order and current pricing/matching semantics.
   Deploy optimized candidates as new instances; retain the accepted UI baseline.
   Do not alter a live UI instance during an economic/performance acceptance run.
5. Run real order, settlement, ordinary claim/refund and failure recovery with
   exact evidence. Compare performance under the same configuration, volume and
   machine scheduling, without concurrent proof/build jobs contaminating samples.

Independent UI implementation/read preparation and offline contract work can be
interleaved. Financial operations sharing a payer/vault remain coordinated.
Offline proof timings, proof aggregation and multiple UPSs do not establish chain
TPS or cross-vault atomicity. No production readiness conclusion follows from
this recovery. The deleted heartbeat was not recreated.
