# Private claim commitment journal — 4 November 2026

## Scope and release status

This continues the [complete compact claim verification](PRIVATE_FT_APPROVED_STACK_20261104.md).
It closes an application persistence gap: the ordinary market capsule keeps
approved `fullCalls`, which must not be used for a private claim containing
receive randoms. The existing wallet journal now supports an explicit schema-3
commitment capsule. No second financial state machine or market business logic
is introduced into the wallet.

The selected mainnet-beta SDK remains
`01b8f2b0a077367a7b9879baba1a72aea8ab5510`, client
`7058070057c3242b5d8b29e1a31d498aaa4202c0`, source manifest
`246cfcb12788fe0d0eb79594556acdfcc7781d01641890e47836db1fbc93c467`.
The historical build-profile name `sdk-audit-20261102-v1` is retained; no
dependency, Node source, old contract, installed extension or account changes.

**This is offline acceptance, not a live private-claim release.** Installed
wallet resources remain null and `privateFtClaimExecutionReady()` remains false.
The other task's wallet/profile/import/history stays untouched.

## Implemented boundary

The fixed Native/WASM verifier returns each actual verified call's caller,
contract, method ID/name, input count and parameter hash. These values come from
the CFC/UPS-bound call, after comparison with ephemeral approved parameters;
they are not accepted from a trace's unverified declaration. Complete signature,
session, sig_hash, code/layout/function inclusion, state and fee checks remain.

Schema 3 replaces durable `fullCalls` with ordered `callCommitments`. The
approved prefix, exact final Native fee call, resource identity and manifest are
checked against independent verification. The verifier report must also match
the precise request, nonce, endpoint, session, signature context and actual fee.
It never exports raw inputs or receive/signing material.

Public records and contexts have exact field inventories. **Before the first
artifact write**, schema 3 verifies both complete proof and typed public JSON
projection. Unknown fields cannot smuggle a witness into the journal. Canonical
bincode decoding rejects appended proof bytes, including the Endcap and CFC
proofs. Existing schema-1/2 ordinary records retain their path and serialization.

`createNativeCommitmentVerifier` is a wallet-background adapter. Its fixed
verifier and ephemeral-approval callback are configuration owned by the wallet,
never page parameters. Rehydration must use the wallet's existing receive
material in memory. Approval identity, range, budget and domain must match the
public record. A callback that never completes or supplies multiple approvals
fails. Buffer cleanup is not a guarantee of physical RAM erasure of immutable
JavaScript values.

The existing account journal key, cross-context lock contract, nonce hold,
wallet-owned confirmation callback, fresh submission checks, durable intent
readback, one-send path and original-identity reconciliation are reused. A
private unresolved operation also blocks an ordinary operation on that account.
Unknown outcomes cannot be cancelled into a replacement payment. Only exact
receipt/common-state reconciliation releases the hold.

The proof-only runner admits a bounded external prefix only when explicitly
selected: at most three contiguous external steps followed by the two reviewed
claim/fee CFC steps. Default ordinary calls still reject external steps. It uses
the actual frozen provider signature `proveExternalProofJob(envelope, index)`;
no submit-capable convenience method is used. Complete verification remains
mandatory after job assembly. The wallet additionally exposes its existing
parameter commitment in the verifier's exact hexadecimal representation.

## Acceptance and retained failure

The case is `psy-market-recovery-20261023/private-claim-recovery-20261104-v1`.
Root is the sole owner. Declared limits: zero new complete UPSs or note proofs,
four Native builds, 7,200 total seconds, 12 GiB sampled process-family RSS,
zero financial operations and zero live instances. Two Native builds are used.
No new proof, key, faucet request, registration, deployment or broadcast occurs.

The preserved request
`be69e143789d44765d808d799f2b658e8d5636fb5e3f4f4d1d8ed9e95b33e9b5`
passes actual WASM with all three external insertions and both actual call
commitments. Its saved jobs pass the explicit proof-only runner and exact public
projection. The prior 14 mutation refusals still pass. Schema-1 ordinary market
and first-session proofs pass a separately pinned compatibility build, including
their existing refusal suites.

Forty-nine application regressions pass, including the actual saved UPS through
the wallet-owned commitment verifier and the same durable journal. Host fault
tests cover restart, lost response, duplicate clicks, two service/store wrappers,
approval refusal, fresh-state refusal, altered original receipt, wrong caller,
parameters, fee commitment, in-budget fee change, nonce, network, pack and
session; malformed or secret-bearing material is not retained. A storage failure
before intent readback sends nothing; failure after send preserves the original
intent and never resends. These are host transport tests, **not** actual extension,
network, cross-machine or ordinary-wallet payment acceptance.

The first replay test incorrectly expected an unknown bundle field to return a
false projection flag. The typed bundle already rejects it outright. That
failed log is retained; the corrected test accepts only rejection or an explicit
false projection flag, and checks no private capsule reaches storage. It does
not relax the verifier. A subsequent direct CFC-string comparison exposes a
separate wallet-format mismatch: the hash utility emits `0x`, while Native uses
64 unprefixed hexadecimal characters. The wallet now emits the exact canonical
form; the failed targeted run is retained and the final suite/build are rerun.

The isolated wallet suite passes 793 tests with one existing skip. Fixed 472-file
source/installed SDK checks, strict TypeScript and staging build pass. A targeted
test also compares the exact hexadecimal commitment with the saved CFC call.

| Measurement | Elapsed seconds | Sampled family RSS KiB |
| --- | ---: | ---: |
| Compact WASM release build | 11.354 | 439408 |
| Ordinary compatibility WASM release build | 11.381 | 403136 |
| Final wallet full host suite | 37.742 | 1398064 |
| Final wallet SDK check, typecheck and staging build | 78.512 | 2977584 |

These are whole supervised build/test processes, with one-second RSS sampling.
The final wallet suite and build overlap; their times must not be summed or
compared as a controlled performance experiment. Earlier samples are preserved.
Summed RSS includes shared pages and can miss short peaks; it is not physical
peak memory. Inner/nested test times are not added to process elapsed time.
These are not matched speedup, cold/warm settlement, confirmation or TPS samples.
Saved synthetic fee fields remain synthetic; actual funds spent here are zero.

## Remaining product gates

The frozen Rust SDK exposes the necessary `TraceBuildSession` operations, but
the generic WASM batch-claim entry still produces the legacy scalar ABI. An
application bridge for the actual compact trace, ephemeral signing path and
reviewed current-chain resources remains necessary. This milestone supplies the
public journal and verifier interface, not that missing trace producer.

Formal confirmation must display wallet-owned asset/amount/recipient terms and
bind them to these verified commitments before schema-3 execution is enabled.
Runtime installation, real extension approval, fresh current-chain checks,
exact broadcast, receipt recovery, ordinary-wallet claim/refund and live market
integration remain unverified. No page-facing installer, injected verifier,
resource URL, broadcaster or approval-success flag is enabled.

Market pricing, shared vaults, deterministic batches, priority and unique NFT
sale semantics are unchanged. Cross-UPS composition, authenticated randomness,
finality/seed chronology, actual end-to-end performance and production readiness
are not established by this journal work.

[Small evidence inventory](../../executor/verification/2026-11-04-private-claim-recovery-v1/INDEX.json)
records hashes and measurements. Raw proofs, binaries, SDK copies, logs and
wallet build outputs remain external and are not uploaded to Git.

## Delivery status

Application source commit: `3b0e8d78ce2a5720db061a676c7ba1e90d600fdf`.
Wallet source commit: `118a0fb` on `wallet-security-20261016`. Both current branches
contain the verified changes. Pushes fail at SSH public-key authentication; the
connected GitHub integration also rejects application blob creation with HTTP
403 and cannot access the wallet repository. No remote branch is updated, no
force push is attempted, and no global SSH/credential setting is changed.
Local commits and external evidence are preserved. Restoring an authorized
repository transport is an external delivery dependency, not an acceptance pass.
