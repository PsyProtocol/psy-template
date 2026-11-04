# Owned private-FT note verification — 4 November 2026

## Closed in this continuation

The selected source remains mainnet-beta SDK
`01b8f2b0a077367a7b9879baba1a72aea8ab5510`, client
`7058070057c3242b5d8b29e1a31d498aaa4202c0`, manifest
`246cfcb12788fe0d0eb79594556acdfcc7781d01641890e47836db1fbc93c467`.
The existing application and wallet branches are retained. No Node/SDK source,
dependency version, old contract or original proof is changed.

1. The wallet no longer declares an optional `verifyPrivateFtPacket` method
   that the frozen SDK does not implement. Mailbox, outgoing delivery and
   delivery recovery now call an application-owned background adapter.
2. A Native/WASM verifier embeds reviewed denomination-note verifier/common
   data. It recomputes the exact circuit fingerprint and verifies each active
   limb's public-input hash and proof. It rejects noncanonical/range-invalid
   fields, empty identities, duplicate nullifiers, swapped/missing proofs,
   extraneous resource fields and trailing proof bytes. Zero limbs require
   null proofs and zero nullifiers. Amounts use the complete U124 value.
3. The wallet loads only a statically installed, extension-owned binary with
   matching binary/pack/source/domain identity. Its adapter requires matching
   chain, asset code/layout/function roots and coordinator/realm checkpoint
   observations, including a chain-change check after verification. No page
   RPC installs a verifier, URL, result or broadcaster. Loading is bounded,
   once-only and retains failure; it never creates a financial request.
4. The existing low-level external-proof route passed bytes to the frozen
   SDK's Base64-string interface. The bridge now encodes exact validated
   bytes. The claim route uses the same strict byte decoder. Invalid values
   cannot silently wrap into bytes, and sparse/reordered framing is refused.
   Existing origin/account/unlock/approval routing is unchanged. Runtime
   extension/session acceptance of this route is still pending.
5. Fresh application snapshots now stamp selected SDK/client provenance into
   Cargo metadata without changing dependencies. The copied metadata formerly
   retained the earlier `c92880c8…` annotation despite verified new source pins.
   A fresh snapshot and locked Cargo metadata check agree with the selection;
   the lockfile is unchanged. Original snapshots retain their old bytes.

## Evidence and measurement scope

External case: `psy-market-recovery-20261023/wallet-private-packet-20261104-v1`.
Its predeclared limits are zero live instances/actions and zero new complete
UPSs, at most four note proofs, six native builds, 1,800 proof seconds, 7,200
total seconds and 12 GiB sampled process-family RSS. Root is the sole owner.
No competing proving/financial task was active when this continuation began.

The native test creates two new notes with actual compiled private-FT bytecode
SHA256 `b7f4a9f49bc09bde262a9b41e8ec11763a17204ee41fdd24f5ff3b0f6e22fa91`.
The source is a synthetic VM checkpoint, not a signed transfer or a live receipt.
It produces exactly two note proofs, accepts the two-limb/low-only/high-only
packets and rejects 21 mutations plus an unknown resource field. Private
witnesses remain in memory. The native process takes 211.484 seconds with
sampled process-family RSS peak 322,464 KiB.

The same exact public proofs pass actual compiled WASM: three valid packets,
15 refusals, zero replacement proofs. The new binary also re-verifies the saved
ordinary complete market UPS/capsule with six refusal cases, and the saved
first-session ordinary claim UPS with eight refusals. These are preserved
synthetic proofs, not additional live trades or ordinary extension claims.

The shared sibling SDK package had drifted and its unmodified gate rejected it.
An external isolated workspace recovers all 472 archived distribution files and
verifies both sibling and installed package before building. Shared SDK files
are untouched. Final wallet regression and build results are indexed in the
[public evidence inventory](../../executor/verification/2026-11-04-private-note-verifier-v1/INDEX.json).
No binary, raw packet, proof, log, wallet export or witness enters source Git.

The first native test build fails on an explicit serialization error conversion;
the application-only correction builds successfully. A first-session replay
initially uses the fixture's smaller pack digest against a union-pack binary
and correctly refuses; explicitly identifying the actual embedded union pack
passes. Both failures are retained, not relabeled SDK or proof failures.
The native build, wallet builds/tests and WASM replays overlap in this correctness
cohort. These timings/RSS samples are not a matched performance experiment,
physical-memory peaks, finality latency, TPS or evidence of general acceleration.

## Remaining gates and exact product boundary

No private-note release or live market release is installed in the wallet.
`privateFtClaimExecutionReady()` deliberately remains false. Private FT sends
must not fund an unsupported claim path. Imported packet claims are rejected
before legacy trace generation, preventing a U124 packet from silently using
the SDK's older claim ABI. This is a stronger explicit gate, not a claim that
the 86-word wallet path is finished.

Next application work is the compact-v2 asset/code identity descriptor and the
external-proof/86-word claim trace, public projection and complete approval
binding. It must bind both proofs to the final session root, then verify the
ordered external/CFC/UPS steps, caller, amounts, sig_hash, nonce, endpoints,
fee and recipient through the existing exact-request journal/broadcast owner.
The native private transfer/claim UPS pair preserved by the preceding milestone
is separate evidence; this new synthetic packet cohort is not its continuation.

Only after that gate passes may a reviewed current-chain resource release be
installed and the minimal AMM/UI/ordinary-wallet journey proceed. New-chain
registration/deployment/funding, real approval, final confirmation, ordinary
claim/refund and restart/lost-receipt acceptance remain unverified. The other
task's wallet import/unlock/history is untouched.

RPC agreement does not prove finality or authenticate a random source's
unpredictability/publication timing. Random mode remains subject to its existing
upstream gates; no new random-source or whole-market fairness claim is made.
Cross-UPS composition remains a recoverable workflow, not cross-vault atomicity.
No dependency switch, safety-check removal, faucet request, test-PSY spend,
broadcast, real fill or real ordinary claim occurs in this milestone.

## Source entry points

- [Fixed public note verifier](../../market-client/wallet/native/src/private_notes.rs)
- [Native/WASM exports](../../market-client/wallet/native/src/lib.rs)
- [Bounded synthetic note regression](../../token/wide/private/vm-tests/tests/support/private_packet.rs)
- [Actual WASM acceptance](../../market-client/wallet/native/privateNoteAcceptance.mjs)
- [Selected snapshot preparation](../../batching/dependencies/prepare_selected_application.py)
- Wallet branch `wallet-security-20261016`: `src/private-note-native/runtime.ts`,
  `src/background/psy-wallet-ext-core.ts`, `src/lib/externalProofEncoding.ts`.
