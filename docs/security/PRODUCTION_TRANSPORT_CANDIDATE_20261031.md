# Production candidate: formal RPC and wallet transport — 31 October 2026

Starting application commit: `47a38e5cd3588a9f245cbc6fff95fdec6a80cb56`, branch
`markets-batch-capacity-recovery-20261020`. Wallet baseline:
`5c15a9df9d5c47c4df449988ab7cb89b5d397b32`, branch `wallet-security-20261016`.
No financial/proving owner was active at entry. Root owned this phase. The
declared live bounds were 20 configured staging reads, zero new proofs, zero
contracts/contract compilations and zero financial operations. Eighteen live
reads were used. Loopback HTTP tests are separate finite non-financial fixtures.
Existing financial ceilings, consumed faucet requests and original sends remain
unchanged. No Node, SDK, old contract, proof or original artifact was modified.

## Actual safety changes

The [shared wire module](../../market-client/rpcWire.mjs) is used by the formal
[Executor](../../executor/publicState.mjs), public gateway, chain-instance guard
and [exact wallet transport](../../market-client/wallet/exactTransport.mjs).
It contains generic framing/byte checks, not market logic or a verifier.

Three new tests first failed on the baseline: formal Executor accepted an
unrelated RPC response identity; its core transport accepted an oversized
chunked result; and the wallet accepted unrelated response identities at
preflight/ACK. The red log and original code snapshot are preserved.

- Require JSON-RPC 2.0, the exact numeric request ID, and **one** result or
  structured error. Both/neither outcomes, string IDs and wrong versions/IDs
  reject. A correct-looking state value or end-leaf hash alone is insufficient.
- Enforce UTF-8 **byte** limits while reading, including responses without
  Content-Length. Reject impossible/oversized lengths and malformed UTF-8;
  cancel rejected streams and release the reader. The Executor limit is 1 MiB;
  wallet public reads retain a 4,000,000-byte limit, its ACK limit is 262,144
  bytes, and the chain anchor limit is 65,536 bytes. Oversized results fail
  closed; they are not silently truncated or treated as a zero state.
- The Executor permits only configured RPC endpoints, rejects redirects without
  following them, and requests uncached observations. Protocol failures do not
  enter the bounded transport retry path. Existing transient-read/metadata
  retries remain fixed-request, read-only and bounded; sends never use them.
- Capture read parameters and exact wire bytes before queueing. Flight keys,
  retry bytes and metadata-error classification use that same captured input.
  Caller mutation cannot turn a queued request into another checkpoint while
  retaining the original coalescing key. Serialization also rejects unsafe JS
  integers before transport. BigInt checkpoints and in-flight identities retain
  exact integers, including i64::MAX; no completed balance/nonce is cached.
- A malformed ACK remains **unknown** after the only send. It does not produce
  confirmation, release the account hold, cancel a broadcast preparation or
  permit a replacement. A new staged-wallet regression exercises the real
  framing error with a synthetic backend: restart/repeated calls do not send
  again; only exact original receipt reconciliation releases the hold.

This hardens transport, not its cryptographic assurance. Existing actual-call,
caller, parameter, U124, session/sig_hash, code/layout/key, fee, nonce and endpoint
checks remain required. No external verifier or page-provided success report is
trusted. An RPC envelope is neither a state proof nor consensus finality.

## Formal wallet integration and frozen dependency

The application vendor entry reproduces the changed generic module, declarations,
chain guard and exact transport into the existing formal wallet. `bundle.json`,
reviewed registries, network configuration and `installedMarketRelease: null`
remain unchanged. No obsolete market IDs/resources are activated. NFT writes
remain closed; the wallet still requires same-UPS NFT identity constraints.

The SDK remains `c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. All 2,756 frozen source members match.
The wallet's canonical workspace SDK guard rejected a different local sibling
package before typechecking. No guard, dependency or lockfile was changed.
Validation instead used a fresh wallet source snapshot with the **previously
selected frozen cohort**. Its guard verifies package/config and all 472 installed
SDK distribution files. No install, SDK branch switch or upstream patch occurred.
Node for these checks is v24.22.1.

The first isolated typecheck lacked a public Genesis ABI copied by the existing
wallet native-SDK test. The exact original ABI was added to the isolated source
copy, then typecheck passed. The first wallet suite found an old text-only mock
Response. It now uses a genuine stream-bearing Response; production checks were
not weakened for a mock. All failures remain recorded.

## Validation layers and limits

| Check | Result | What it establishes |
| --- | --- | --- |
| Red reproductions | Three expected failures | Baseline accepts the stated malformed/oversized responses |
| Real loopback HTTP | Five final cases pass | Wrong envelope, chunked body bound, redirect/endpoint refusal, exact i64::MAX bytes, captured parameter identity |
| Scoped application regressions | 355 pass, one existing skip | Client, gateway, runtime/locking and synthetic wallet state-machine behavior |
| Formal wallet selected cohort | 66 files pass; 730 tests pass, one existing skip | Consumer/vendor, background/unit integration and existing wallet regression coverage |
| Frozen SDK guard and TypeScript | Pass | Exact selected consumer distribution; no declared nonexistent SDK API or ignored type error |
| Fresh staging extension build | Pass | Build output and archive produced in a new isolated directory; not browser payment acceptance |
| Current configured staging reads | Inconsistent metadata | Availability stop remains; no financial task follows |

The first wider application invocation retained six failures at explicit missing
environment/fixture prerequisites (`checkpointStream`, `finalStateStream`,
`finalStatePairReadiness`, `previousCheckpoint`, `previousCheckpointRoute`,
`producerBatchBinding`). They are not silently accepted. These unchanged native
proof/profile integrations were not rerun with generated replacements or new
proofs in this phase. The explicit later test scope is in the evidence pack.
One existing native capsule test also remains skipped without its dedicated
proof fixture; neither that skip nor the broader failures are full-UPS evidence.

Wallet build retains existing WASM URL/chunk-size warnings. Vite reports 14.43 s
for its build phase; this excludes the preceding typecheck and is **not** cold
prover, warm-task, browser startup, confirmation or final-claim performance.
There is no new full native UPS, real extension approval, fill, claim, throughput
or memory comparison in this delivery. No general speedup is claimed.

## Actual staging stop: checkpoint 27044

The hardened formal Executor observes the same current chain root and included
QA FT 8 code/layout/function identity. Issuer 223232 remains nonce 1 with
998.999998 test PSY observed in Native state. At the same diagnostic run:

- Realm 0 explicit checkpoint 27044 height: **[0]**.
- Realm 0, Realm 1 and coordinator i64::MAX heights: **[31]** each.
- Realm 0 issuer/contract-8 word read succeeds, returning an actual zero word.

This reverses the previous latest/fixed pattern at 26855, where the fixed height
was 31 but the latest height was zero and state reads failed. It is evidence of
intermittent/routed metadata disagreement, **not recovery** or a confirmed
single database cause. The actual zero result is not a fallback for an error,
nor independently verified state. Runtime serving-instance identity, routing,
cache population and persisted metadata still need examination; see the
[unchanged detailed upstream criteria](UPSTREAM_REALM_LATEST_HEIGHT_HANDOFF_20261031.json)
and the new raw capture. Both source code and RPC observations remain distinct
from attestation of the running services.

The first read-only logging harness used a shared sequence counter after an
await; two parallel head replies collided on a `wx` filename. It stopped after
two reads, with no overwrite or financial action. A new harness/output captures
the request-local ID, uses at most 18 remaining reads and enforces a global
deadline. It completed in 11 reads. Both versions and the original failure are
preserved. No financial operation or request was retried.

A final five-read observation on the final Executor code at checkpoint **27105**
still matches the current chain anchor, but Realm 0 returns **[0]** for both
the fixed checkpoint and exact i64::MAX bound. It does not constitute state/proof
acceptance or recovery. Total live reads are 2 + 11 + 5 = **18/20**; no further
read or financial attempt follows this unchanged availability stop.

## Production release boundaries

| Boundary | Current status / required evidence |
| --- | --- |
| Formal transport / exact unknown recovery | This code fix and scoped tests complete; actual extension/live fault acceptance still required |
| Reliable current-chain state/proof reads | External runtime gate remains open; fixed/latest metadata disagreement must close across serving paths |
| Four actual market identities and fresh vaults | Not deployed on this chain. Candidate IDs remain provisional. Selected deterministic v5/v9 profiles need empty-vault registration/authorization/setup and actual-ID full UPS |
| Full protocol safety | Dependency upgrade authority/immutability, accepted snapshot age and cancellation precedence still require enforced upstream rules/evidence; client checks alone cannot close them |
| Source completeness / liveness | Complete authenticated finite source and deadline/fee budget remain mandatory. Fixed 32-checkpoint windows must fit real inventory; inclusion before queueing is not global censorship resistance |
| Random mode | Not enabled by this work. A producer seed is not qualified unbiased entropy or certified seal-before-publication/finality |
| Real user product | AMM approval, exact broadcast, confirmation, ordinary claim/refund first; then Curve, Book, NFT and dual-pool recovery. No ACK or local proof may display final success |
| Capacity, operation and performance | Current verified profile bounds only. Continuous live fault acceptance, resource measurements and matched settlement comparisons remain open |

Shared vault pricing and ordered state updates remain intact. Orderbook keeps
whole-order price/time priority; NFT keeps its unique sale and buyer priority.
Cross-vault/multi-UPS composition remains a staged workflow with confirmed
intermediate claims, not an atomic cross-vault transaction. Same-host tests do
not establish cross-machine coordination. No Node change, invoke_sync, market
mechanism change or UI demonstration is used to bypass these boundaries.

This is a hardened **production candidate**, not completed production acceptance.
Review [the public evidence](../../executor/verification/2026-10-31-production-transport-v1/README.md)
and the corresponding wallet report before enabling any financial release.
