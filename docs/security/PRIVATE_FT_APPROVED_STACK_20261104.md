# Compact private-claim approval stack — 4 November 2026

## Implemented and verified

The preceding [note-verification milestone](PRIVATE_FT_OWNED_VERIFICATION_20261104.md)
verified denomination proofs but did not reconstruct their position in the
complete transaction's proof tree. This continuation closes that verification
gap with a versioned, bounded external-proof prefix.

`PublicBundle` schema 2 records each external proof's position, fingerprint,
start/end root and insertion point. The fixed verifier reconstructs the whole
session tree from the start proof, verifies the actual denomination proofs,
requires the exact alignment duplicate, and then verifies both CFC/UPS pairs,
ordered inputs/caller, code/layout/function membership, state deltas, fees,
signature/sig_hash and final Endcap. The admitted private scope is one 86-word
U124 claim followed by exact Native fee burn. Arbitrary external verifiers,
extra/late/missing notes or unrelated call stacks are not admitted. Schema 1
ordinary bundles retain their existing serialization and verification path.

The public trace projector now accounts for external proof-job outputs by
their actual step indices. It refuses missing, duplicate, changed or extra
outputs and unsupported step types. It exports no verifier hints, CFC witness,
receive randoms or signing witness.

The wallet adds an explicit `u124_private_compact_v2` identity:

| Binding | Value |
| --- | --- |
| Code root | `3d554e7c6bc8fa0ced66fddbae7b4ada476c0525448fbb2df3e9a8aa0761d2dd` |
| Layout root | `35e546bb64ad8405e725377eae4cedd54032ca6980cda5520cc3cb18d81c0a03` |
| Function root | `a38bf7c8fb7470c2bd068d9f658743b7559e64df18adb103e48470e00ec10af4` |
| State height / fields / slots | `32 / 24 / 2178599700` |
| Compiled artifact SHA256 | `b7f4a9f49bc09bde262a9b41e8ec11763a17204ee41fdd24f5ff3b0f6e22fa91` |

Legacy pins remain distinct. Shared public-transfer, counter and balance
adapters handle both wide profiles without guessing width from decimals.
Compact identity requires the function root as well as code/layout metadata;
reviewed pins are immutable.

`privateFtCompactClaim.ts` derives the receive identity, reconstructs the
aligned pair's final-session membership and constructs exactly 86 inputs. Its
commitment uses the frozen SDK's actual `safe_hash_fixed_length` convention:
Poseidon over `[86, ...inputs, 86]`. The actual completed claim's input hash is
independently compared in the wallet regression. The returned plan is not an
authorization. Full inputs are available only inside a one-use asynchronous
callback, erased on success/failure and absent from JSON/public recovery data.
The separate public parameter commitment is immutable. A real receiver's
randoms must never enter the generic durable `fullCalls` or hydrated trace store.

## Complete proof and compatibility evidence

The successful release cohort creates one new ordinary-signature claim UPS
at synthetic checkpoint 101. It first independently verifies the preserved
source transfer request
`e1f53affa538591848bc398382de8e40be0fd3d9348547bef27d3f579916c5d5`
and requires its exact end leaf/state as the source account. Two denomination
proofs yield three insertions: the low proof is reused once to align its sibling
pair. The trace-only start commitment does not generate a discarded start
proof; the proving manager generates that proof once.

The claim amount is `1000000000000000000000000123` base units. The exact fee is
`1000005000` Native base units; token and Native endpoints reconcile. Eighteen
native mutations reject, including note omission/order/position/root/fingerprint,
amount high limb, recipient, receive randoms, call order, nonce, domain and fee.
Asset 42 is a synthetic QA private FT, not the existing pUSDT. Native fees are
also synthetic: no test PSY is obtained or spent in this continuation.
Actual WASM independently accepts the saved complete claim and exact public
projection, rejects 14 changes and generates no replacement proof. Separate
schema-1 WASM builds reverify the preserved ordinary market and first-session
proofs, including their existing refusal suites.

The wallet matches every parameter of the completed synthetic claim, including
its independently generated CFC input commitment. It also tests U124 maximum,
single-active-limb preparation, identity/path changes and one-use erasure. The
whole wallet suite passes 793 tests with one existing skip; strict typecheck,
exact 472-file source/installed SDK checks and isolated staging build pass.
Twenty-six application wallet/projection regressions pass. These counts do not
establish live acceptance or production readiness.

## Retained failure and measurement limits

External case: `psy-market-recovery-20261023/private-claim-stack-20261104-v1`.
Root is the unique owner. Limits are two new complete UPSs, four note proofs,
six native build commands, 1,800 proof-process seconds, 7,200 total seconds,
12 GiB sampled family RSS, zero live instances and zero financial operations.

The first compile exposes ordinary application syntax/type mistakes, retained
in `build-v1.log`; the corrected build passes. A subsequent invocation
accidentally selects debug rather than the prior verified release profile.
A read-only stack sample identifies CFC/minifier resource construction. That
owned offline attempt is stopped after 900.629 seconds, preserving its binary,
sample and log. No request/proof is saved by it. The versioned correction does
not expand any limit and deducts that elapsed time from the next proof budget.
No other process or financial task is stopped. The current driver rejects this
debug acceptance profile before resource/key/output creation.

The corrected release process passes in 86.929 seconds with sampled family RSS
peak 1,633,264 KiB. Its inner stack phase is 28.427 seconds; that excludes the
earlier dependency/circuit and note preparation. Do not add these overlapping
or nested measurements. Wallet build: 36.661 seconds and sampled family RSS
3,447,712 KiB. Actual funds spent are zero. These are offline correctness runs,
not a matched speedup, warm-state study, physical-memory peak, confirmation
latency, final user receipt, p95 or chain TPS. The failed/incomplete debug sample
cannot serve as a completed before/after performance baseline.

Only [small summaries and original-file hashes](../../executor/verification/2026-11-04-private-claim-stack-v1/INDEX.json)
enter Git. The original proofs, binaries, public synthetic fixtures, failures and
logs remain external. The signing key stays ephemeral. Persisted receive
randoms in this **synthetic test fixture only** are the already public constants
7 and 8; the exporter is not a real-wallet trace exporter.

## Remaining execution and product gates

The full Native/WASM verifier now proves approved compact-call/session binding;
the formal browser execution route is still closed. Both installed releases
remain null and `privateFtClaimExecutionReady()` remains false.

The next application delivery is a wallet-owned compact trace producer using
the frozen Rust SDK's public `TraceBuildSession`/pinned-checkpoint interfaces,
with an application WASM bridge. The existing SDK WASM batch-claim entry still
builds its scalar legacy private ABI; changing a TypeScript declaration or
feeding compact data into that entry is not compatibility. The required Rust
primitives exist, so this is application work, not a request to modify Node or
silently switch SDKs.

That producer must use the actual assigned instance identity, complete fresh
session/nonce/fee/state checks and the one-use receive-secret path. Its ordinary
signature witness and complete private inputs must remain in memory. It must
join the wallet-owned approval, exact-request journal, cross-context account
queue, single send and original-identity recovery, using a privacy-safe durable
projection rather than generic `fullCalls` persistence. Instance-specific
resources require a reviewed release before writes can open.

No extension is installed/unlocked or wallet history changed here. No account
registration, faucet, deployment, real-market fill, network confirmation,
ordinary browser claim/refund or fault-recovery journey is accepted. Historical
chain IDs and test receipts are not reused on the reset chain. Shared SDK drift
remains refused; the isolated build uses its archived exact frozen distribution.
AMM/Curve/Book/NFT pricing, shared vaults, deterministic ordering and existing
keys/contracts remain unchanged. Random-source/finality/publication-order gaps
are separate and are not closed by this synthetic UPS or RPC agreement.

## Sources

- [Complete verifier](../../amm/u124/vm-tests/src/wallet_verification.rs)
- [Public external-proof projection](../../market-client/wallet/publicBundle.mjs)
- [Complete synthetic claim producer](../../token/wide/private/vm-tests/tests/support/private_stack.rs)
- [Actual WASM acceptance](../../market-client/wallet/native/privateClaimAcceptance.mjs)
- Wallet branch `wallet-security-20261016`: `src/lib/privateFtCompactClaim.ts`,
  `src/lib/privateFtDelivery.ts` and their regressions.
