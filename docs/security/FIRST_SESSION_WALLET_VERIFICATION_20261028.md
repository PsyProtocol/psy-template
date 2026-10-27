# First-session complete wallet verification — 28 October 2026

## Scope and source boundary

In scope: the application native/WASM verifier, its fixed resource exporter and
exact saved-proof regression. Application starting commit `4da9cd9b`, branch
`markets-batch-capacity-recovery-20261020`; wallet remains published at `5c15a9d`
on `wallet-security-20261016`. SDK remains
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, manifest
`06d86a86775bef1f217e61a2192b525d657bc8de2d3687e5c28d93e7abfaec8f`.
No SDK/Node source, dependency version, market mechanism, old contract, wallet
history, original request or original evidence was changed.

Out of scope: installing live wallet resources, extension-origin acceptance,
registration/faucet retries, broadcasting, market settlement, actual ordinary
claims, two-pool execution, Book-to-AMM and matched performance claims.

## Correctness fixes

`amm/u124/vm-tests/src/wallet_verification.rs` selects the pinned SDK
`ups_start_register_user` key and fingerprint only when the approved and proven
stored start leaf is zero. It requires nonce one and the exact SDK empty session
leaf. The fixed register-start circuit independently binds the nonzero public
key, registration-tree index, checkpoint, zero stored user leaf and session leaf.
A missing registration resource rejects; a failed regular proof cannot fall back
to registration. Nonzero stored leaves retain the initialized-user branch.

The first Endcap commits to the zero **stored** user leaf. The SDK signature
commits to the initialized **session** leaf, including its key and empty state.
The verifier previously used the stored leaf for both. Signature reconstruction
now uses the already authenticated session leaf, matching frozen SDK
`UserProvingSessionManager::compute_sighash_from_header`; the regular branch has
already checked equality to its approved stored start leaf. Full signature,
call-stack, CFC/UPS, session, sig_hash, code/layout/function, fee, nonce, expiry
and final endpoint checks remain present.

`wallet_verifier_export.rs` exports verifier/common data and fingerprint from
the actual frozen SDK registration circuit. They are compiled into a WASM build,
never supplied at runtime by a page. Existing initialized-user packs without
that optional resource still verify their original initialized-user proofs;
they cannot accept a first session.

## Executed evidence, including failures

Root was the only proof/execution owner. One process at a time, two Rayon
threads, at most 8,192 MiB sampled process-family RSS. A bounded recovery plan
followed the failed fixture; no financial budget was expanded or used.

| Invocation | Outcome and exact interpretation |
| --- | --- |
| Initial launcher v1 | Fixture-path assertion before compiler or prover; retained. |
| Native generation v2 | Compiled; fixture forgot the SDK new-user flag and selected regular start. Failed before a start proof; retained. |
| Native generation v3 | Constructed register-start, claim/burn CFC and UPS, ordinary signature and complete Endcap; application verification rejected its old signature preimage. Failed test remains failed and unchanged. |
| Native replay v4 | Corrected verifier verifies the exact saved v3 bytes; 18 changed-source/key/start/nonce/fingerprint/network/fee/proof/session/delta/code cases reject. One selected test passes. No new signature, witness or proof. |
| Initialized-user replay v5 | Original saved AMM proof and old verifier pack pass, including 15 negative cases. One selected test passes. No new proof or market operation. |
| WASM build / acceptance v2 | Actual compiled WASM verifies the same first-session request and rejects eight mutations. The first bindgen invocation failed because the tool was not on PATH; corrected invocation uses the already cached exact 0.2.126 binary. Both logs remain. |

The replay test reads each public input once and hashes the exact immutable
buffers it verifies. The WASM report records request, approval, bundle, pack,
observed JS and WASM hashes and checks the observed module files remain unchanged.
This is standalone WASM acceptance, not independent extension/runtime attestation.

Saved first-session request SHA256:
`3ae2a1a47747c63dba2ff4bdb41827104bed1b6b05c77bdd004da470638058f3`.
Verifier pack SHA256:
`2f51f14521654268f498d834c715db02b04b112dd4e60a34c0a0275ed4127ad4`.
Registration-start fingerprint:
`b8c4e8da6c28b4aadf2cc51fc75452ccc92a4773d354d4be79264188cc701476`.
The synthetic signing account is 204, SDK-derived registration index 417792.
It is not the live QA issuer 223232. Market fixture 9/vault 631808 is synthetic
context only; the verified first-session stack contains exactly two native calls,
`claim(1590272)` then `burn(1000002000)`, and no market trade.

The native code/layout/function roots in the pack exactly match the captured
reset-chain native roots. That identity equality does not turn a synthetic source
checkpoint into real network state or consensus evidence.

## Claim and fee arithmetic

The complete verifier authenticates the API's state updates and their Merkle
paths against the proven final state. A separate arithmetic audit associates the
same exact request/approval/bundle/pack hashes and decodes native slot locations
from the captured ABI. It is an audit of already authenticated updates, not an
additional cryptographic verifier or receipt.

| Synthetic quantity | Raw native units |
| --- | ---: |
| Initial contract-0 balance | 0 |
| Claim cursor increase / incoming amount | 10,001,000,000 |
| Final contract-0 balance | 9,000,998,000 |
| Exact fee burn | 1,000,002,000 |
| Final balance plus fee | 10,001,000,000 |

Both standard CFC steps have `total_balance_spent = 0`, and the separate user-leaf
balance remains zero. Native contract-0 balance slots fund native fee burn;
this is not a user-leaf credit or permission to spend an unclaimed Outbox.
The claim occurs before the burn in this one proven UPS. There was no actual
network credit, claim, test-PSY expenditure, QA FT/NFT issuance or pUSDT spend.

## Measurements and limits

All samples, including failures and launcher/tool failures, are retained. The
following are individual offline diagnostics, not matched performance pairs:

| Run | Launch through exit | Sampled family RSS peak | Result |
| --- | ---: | ---: | --- |
| Generation v2 | 184.999 s | 2105.56 MiB | Failed fixture start |
| Generation v3 | 209.590 s | 2223.88 MiB | Complete proof generated; old verifier rejected signature preimage |
| Corrected native replay v4 | 69.229 s | 1036.48 MiB | Includes application compilation; test itself 0.20 s |
| Initialized replay v5 | 2.073 s | 172.05 MiB | Cached build; test itself 0.29 s |
| WASM build | 10.328 s | 412.91 MiB | Cached dependency build; not clean SDK compilation |

Generation v3 reports a 113.239 s first-process circuit-build stage and a
66-second application compilation. Its test runtime is 141.72 s. These clocks
have different scopes and must not be summed as independent proof phases.
The fixture builds market resources it does not use in the native-only stack;
that is a measured remaining construction cost, not an optimized production path.
One-second sampling covers each listed process family from launch to exit,
including compiler children. Shared pages can be counted more than once;
between-sample peaks can be missed. RSS is not true physical peak memory.

There is no warm settlement task, matched old/new binary pair, real fill,
confirmation, ordinary claim or whole financial round in this milestone.
The 0.20/0.29-second mutation suites differ in stack size and are not a speed
comparison. No p95, TPS, production readiness or general speedup is claimed.

## Remaining activation and service dependencies

The checked-in wallet installed release is still null. The existing exact
transport deliberately requires an initialized observed account leaf and current
starting fee balance. First-session send needs a fresh, authenticated original
URT identity plus zero stored leaf/nonce-one handling and fee-credit validation
bound to the actual approved claim. Those checks must be implemented and tested;
this native/WASM milestone does not remove them or authorize a page flag.
Current-instance pack/release provenance, final wallet confirmation, browser
approval, single exact broadcast, receipt recovery and ordinary claim remain open.

The bootstrap case remains one registration, one unresolved faucet request,
zero confirmed grants, zero market deployments/fills/ordinary claims and zero
controlled UPS fees. Its original send lock is retained. The faucet service
owner must correlate the request hash in the bootstrap report and provide a
public exact transaction identity and inclusion, or definitive rejection/disposal
and the operator/source-checkpoint/start-variant cause. No witness or secret is
requested. An error reply or a zero balance does not prove permanent disposal.
Curve 11 remains quarantined. No old-chain request is replayed on the reset chain.

Continue in order: first-session fresh transport and owned resource integration;
resolve original faucet disposition and obtain current QA funding within budget;
real AMM approval/settlement/ordinary claim and recovery; then Curve, whole-order
Book and NFT with its same-UPS identity assertion. Complete explicit current-SDK
composition adaptation before two-pool success/exit/intermediate-return acceptance.
Multi-UPS paths remain staged workflows, shared vault/payer nonces serialize,
and deterministic sealed queues do not establish global inclusion fairness.

[Public proof, frozen build inputs, failed runs, exact replays, WASM and arithmetic evidence](../../executor/verification/2026-10-28-first-session-wallet-v1/manifest.json).

## Archive reproduction

The archive contains the exact public JS/WASM verifier binaries used by the
standalone test, their source/build inputs, the two saved proof cases, and failed
runs. Its `recipes/` launchers record original case-root invocations; they are
provenance, not a claim that machine-local SDK paths run unchanged after extraction.
The corrected arithmetic recipe accepts explicit paths and has been executed
against freshly extracted archived inputs without modifying them:

```sh
python3 recipes/audit-conservation-v2.py "$EXTRACTED_CASE" "$FRESH_REPORT"
```

The original v1 arithmetic recipe is retained as provenance; it expected its
original case-root location. The extracted v2 audit and its fresh report are
archived separately. Original case files and the initial archive remain intact.
