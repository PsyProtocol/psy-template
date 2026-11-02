# Production-candidate recovery and resource mismatch — 2 November 2026

Application branch: `markets-batch-capacity-recovery-20261020`, starting commit
`118be6f9cf38dd510890274941904661709db2b0`. Wallet branch:
`wallet-security-20261016`, starting commit `f6b3b81`, updated to
[`0a2fe2be51bebeaf4a54c2112b6434c3d08971f6`](https://github.com/PsyProtocol/psy-wallet/commit/0a2fe2be51bebeaf4a54c2112b6434c3d08971f6).
SDK remains mainnet-beta `c92880c8b6e2c8d392f19368bc8801a2584fd427`.

Root checked the clean source baselines, existing reports and process ownership
before resuming. No owned financial or proof task was running. The other task's
wallet/registration was not inspected or modified. This phase declares zero
new instances, proofs and financial operations, 12 initial explicit read-only
RPC calls and one additional circuit-registry read. The 13 reads are consumed;
there is no financial, faucet or proof retry. Browser automatic read activity
is separate and not counted as part of those explicit diagnostic RPCs.

## Recovered availability is a new chain, not full acceptance

All three configured staging endpoints return the same checkpoint-1 observations:

| Identity | Value |
| --- | --- |
| Checkpoint-1 **tree** root used by generic wallet scoping | `e4f0f2cf2a563c11f67131f5b9b0e032c6b4016a59503b42cdc5aeb86af2fe30` |
| Checkpoint-1 leaf **global_chain_root** used by market policies | `81bac9934a1c18579519b5297c94c7e7d25cb53973ac67befefe8b7a86f96b5c` |
| Previous observed global chain root | `919896e18690246e20307f68cf2e5725aee496755366bbafff88eccaea975f12` |
| Three observed heads | `8716`, `8716`, `8716` |

These two root types are different protocol objects. They must not be compared
as if they were the same anchor or silently migrated into one identity scheme.
The changed global chain root is a chain reset boundary. Old IDs, balances and
receipts remain history; no original request is replayed on this chain.

The coordinator returns Native 0 code root
`30f06e6c5c897af41c08f0f86677c66096e533ce490c9817b5ddf7b5812a3ea6`,
layout root `cd6931e5422fb07be012e3d0642bbffd0880bf499ecc87bcb822276d7426771c`,
function root `03c697aa1180e94b046ffcbf0272cd12ce0fee948b216afceb8e1ef524cdcd7e`,
height 32, eight fields and 8,594,128,984 slots. These are observations, not a
completed compiled-code/state-proof audit. The same contract metadata method
is not offered by the realm RPCs (`-32601`); contract metadata must use the
coordinator. Head/root agreement does not attest runtime builds or finality.

## Actual incompatible runtime verifier

The recovered prove proxy returns its circuit registry successfully, but its
Endcap is incompatible with the compiled frozen SDK:

| Resource | Frozen compiled SDK | Current runtime observation |
| --- | --- | --- |
| Fingerprint | `78b73eceb32a446a7cc04ca3ad36e0d856293f366593de8f6132c9240f91c6a3` | `043e026dc674c310d8a9c529268a02619cab6f3779a74396a330c5ff0d0a5893` |
| Circuit digest | `6743ce7e2664987d7d2b7d16a6538c137b9e894334aa9370788b1003abece164` | `6934680402ad9d0521feb981c72e3990f98e8082c4dd9d758ed27d7142cbb57b` |
| Constants/sigmas cap | Frozen 16 entries | Different 16 entries |

The unchanged pinned native inspector
`fcc2c7534d1bdf2d027368bc2e7afb0829f4108909d555e9fa5278baf28b063a`
rejects with `runtime Endcap differs from compiled frozen verifier`. Its first
invocation omitted the required SDK-profile environment and stopped before
comparison; both attempts/logs are retained. The correctly configured invocation
uses the original frozen network/config/profile. No fresh proof is generated.
The application rejection fixture uses the actual new public Endcap projection.

This cannot be repaired by changing an application address, downloading a remote
verifier into the trust set, disabling checks or silently switching SDK. The
running build and circuit-generation parameters must be reconciled with the
approved SDK; a necessary SDK migration remains a separately reviewed decision.
The [concrete upstream handoff](../../executor/verification/2026-11-02-production-resume-v1/public/UPSTREAM-v1.json)
contains exact expected/observed identities, requests, source/config and
verifier/common-data delivery requirements and acceptance criteria. It does not
request keys or credentials. Restoring HTTP alone does not close this gate.

## Application changes closed

1. **Actual wallet cold boot:** remove the stored-root fallback. A failed live
   identity observation cannot construct a transaction core from historical
   scope. Retain history and existing changed-chain migration instead of clearing
   accounts. Real background integration tests cover outage, worker restart,
   matching live recovery and changed-root scope handoff.
2. **Wallet chain reads:** reject conflicting valid roots even when one matches
   history. Reuse existing generic bounded framing, reject wrong version/ID or
   ambiguous envelopes, limit streamed UTF-8 to 65,536 bytes, reject redirects,
   and request uncached observations. Positional compatibility is limited to one
   explicit `-32602` response; network/protocol errors no longer cause a second
   read. One valid matching-history endpoint may still serve when another is
   unavailable. URL agreement is not independent consensus authentication.
3. **Formal funded Executor:** compare fresh configured ordinary-prover Endcap
   data with the exact reviewed compiled resource before complete UPS proving
   and before sending. Pin the reviewed resource file in existing immutable
   input guards. All configured prover endpoints must match. Compare the full
   verifier fields as well as the advertised fingerprint; never use the remote
   key to validate a proof. Completed observations are not cached. Existing
   in-flight read coalescing is reusable; balances, nonces and proofs stay fresh.
4. **Unknown-result recovery:** resource incompatibility blocks new financial
   work but does not prevent original-request receipt reconciliation on the same
   chain. Tests preserve the durable one-send identity across restart, allow
   exact receipt closure after a resource change, and stop an already prepared
   proof from being sent after compatibility changes. A changed chain still
   blocks old-chain receipt interpretation or replacement requests.
5. **Transport endpoint roles:** circuit registries can only be read through
   configured `prove_proxy_url` endpoints. State reads retain their configured
   coordinator/realm boundary. An arbitrary resource URL cannot enter through a
   page or task. This is an additional compatibility gate, not attestation of the
   running server, full role/common-data equivalence, finality or authorization.

The Executor addition covers the funded formal profiles shared by the four
markets. It does not silently rewrite legacy signing routes, old keys or saved
requests. Existing native complete proof/approved-stack/session checks, source
coverage, nonce, expiry, dependency, fee, recipient and endpoint checks remain.
No CFC/key/market source or pricing/matching rule changes; no invoke_sync.

## Validation and honest measurement

| Layer | Result | Limit |
| --- | --- | --- |
| Original wallet reproductions | Four identity/background failures and three wire failures | Expected red evidence; preserved |
| Focused corrected wallet cohort | 30 pass | Actual background module with explicit dependencies mocked; not extension payment |
| Full isolated wallet suite | 742 pass, one pre-existing skip, 67 files | Not live settlement or ordinary-wallet claiming |
| Frozen SDK / TypeScript / staging build | Pass; SDK guard before and after | Same reviewed 472-file distribution; no SDK change |
| Scoped Executor regressions | 87 pass, no failures/skips | Includes resource substitution, prepared-send guard, exact unknown recovery, wire/endpoint roles and actual-capture rejection |
| Unchanged native resource inspector | Correctly rejects actual current runtime Endcap | Compatibility failure; no complete UPS or new-chain finality acceptance |
| Actual isolated extension | Connection retry reaches welcome/onboarding | Previously loaded build; no new wallet/import, user approval, account or payment |
| Network fills, claims, deployed instances and spent test PSY | **Zero** | Live release remains closed |

Wallet test-command elapsed time is 30.349 s; staging build (including SDK guard
and TypeScript) is 30.117 s; Vite's internal build phase is 12.57 s. Fixed SDK
checks take 0.337 / 0.294 s. Dependency/tool caches are reused and the fresh
workspace has its own build/test caches. These are not matched cold/warm proof,
confirmation or final-wallet-arrival benchmarks. There is no new lifecycle RSS,
physical-memory, chain TPS, p95, fee-saving or overall-speedup claim. Existing
large WASM/chunk warnings remain. Test counts are evidence of scoped regressions,
not production readiness.

The fresh workspace's first extraction used an unsupported Python tarfile API;
it stopped before source preparation. That directory/log and a setup-failure
record are retained; the corrected workspace is separate. No old evidence is
overwritten. Current wallet production source matches the successful build,
and the real commit hook verifies generated vendor bytes before and after
staged-only formatting without further changes. The new build is not installed
over the old reviewed release. `installedMarketRelease` remains null.

## Remaining release sequence

- Resolve exact running-resource compatibility with the frozen SDK. Recheck the
  current chain and full code/layout/function/key/common-data identities after
  resolution; a later read may observe another chain reset.
- Declare fresh instance/fee budgets, then verify actual-ID bytecode/key/UPS and
  deploy new isolated assets/markets/vaults. Old Curve 11 stays quarantined.
- Install only reviewed instance-specific wallet resources. Create/approve the
  isolated wallet through its normal user-controlled credential flow, obtain
  necessary test PSY without replaying old faucet requests, then accept AMM
  approval → full verification → exact broadcast → confirmation → ordinary claim.
- Continue Curve, whole-order Book and unique-sale NFT; then two-pool staged
  success/exit/intermediate-asset recovery and matched end-to-end performance.
- Validate live expiry/cancellation admission, fee exhaustion/unused-credit exit,
  restarts and competing executors. Local tests do not establish cross-machine
  coordination or unconditional fee sponsorship/service liveness.

Batch ordering stays deterministic. Qualified randomness/finality and causal
seal-before-seed release remain unverified. Shared-vault state changes stay
ordered; proof aggregation is not same-pool parallel execution. Multiple UPSs
remain a recoverable workflow, not cross-vault atomicity. No production release
or high-throughput conclusion is made.

See [public evidence and reproduction](../../executor/verification/2026-11-02-production-resume-v1/README.md).
