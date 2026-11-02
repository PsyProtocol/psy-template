# Audit SDK migration — 2 November 2026

## Later private-FT application adaptation

The [private context compatibility continuation](PRIVATE_FT_CONTEXT_COMPATIBILITY_20261102.md)
adds explicit application-owned lowering for the frozen frontend's two missing
root intrinsics. The current compact claim ABI passes a complete ordinary
synthetic UPS, fixed independent verification and state/fee conservation. It
requires a new instance/key/resource pack; the raw compiler, legacy templates
and live UI remain separate boundaries. Original pre-adapter observations below
are retained. SDK/Node sources and selected commit are unchanged.

Current branch provenance is `mainnet-beta`, after both upstream refs reached
the same frozen `01b8f2b0...` commit. The existing audit cohort names and hashes
are immutable, and no SDK source or verification resource was replaced. See the
[selection and consumer validation](SDK_MAINNET_SELECTION_20261102.md), including
the ordinary-checkout SDK mismatch and separately verified isolated build.

Token-source coverage correction: the preserved legacy `.psy` entry and the
U124-private source are not covered by the public U124 market fixture's compile
or UPS success. Fresh audit compiler probes reject the former language and the
latter's missing `checkpoint_user_tree_root` intrinsic. Public U124 compiled all
20 methods. See the [exact compiler-interface review](TOKEN_COMPILER_INTERFACE_REVIEW_20261102.md)
before interpreting the historical milestones below.

## Selected release and preserved history

The user authorized exact SDK audit commit `01b8f2b0a077367a7b9879baba1a72aea8ab5510`. Its client is `7058070057c3242b5d8b29e1a31d498aaa4202c0`; backend remains `736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. The source freeze contains 2,759 members. Source-manifest SHA256 is `246cfcb12788fe0d0eb79594556acdfcc7781d01641890e47836db1fbc93c467`.

The application branch is unchanged. Legacy mainnet-beta freezes, current contract deployments and original evidence remain intact. Source archives are materialized in a separate workspace; Node and SDK code are not patched. The application uses an explicit `sdk-audit-v1` feature and runtime profile `sdk-audit-20261102-v1`. A legacy binary cannot select audit merely by changing an environment variable. Audit driver metadata must bind SDK, client and profile; linked static Endcap fingerprint is independently checked.

## Closed prerequisite work

- Native build of the protocol inspector, public resource inspector, market compiler and formal funded driver passed against the frozen audit client. The native full-test executable also compiled. These are not proof-generation results.
- All eleven ordinary transaction verifier roles match the retained runtime resource capture, including exact verifier data, whitelist, aggregation configuration and membership paths. Signature/private-note-specific resources outside this cohort are not silently certified by that comparison.
- All four latest v18/v19 market candidate bytecodes compile under the audit compiler. v3 is preserved; v4 fixes generated base-policy SDK/client metadata with identical compiled code bytes. The dependencies are public synthetic QA artifacts, not accepted new-chain asset or issuer identities.
- Formal Executor registration, lifecycle and funded-stage routes select the exact reviewed resource by SDK profile. Missing or substituted audit driver identity stops execution. Original unknown-request reconciliation stays available without sending again.
- The Book/NFT frontier stage mistakenly allowed historical v17 while rejecting current v19. It now requires the supported v15/v19 paired keys. Tests confirm v19 scan/carry admission with primary fees and rejection of auxiliary-fee reordering.
- Native wallet verification/export, the client protocol, fixed extension resource loader and exact transport now distinguish audit from historical mainnet-beta. The audit client profile binds the reset-chain root and all Native code/layout/function endpoints. It does not rewrite old registries or make them current.

The scoped host cohort passes 65 Executor checks, 12 client/loader checks and five wallet build-time checks. RPC and driver doubles in those tests do not establish full cryptographic or browser acceptance.

## Build failures retained and application-side remedies

The system default Go 1.14 cannot parse an unchanged dependency's `toolchain` directive. The native build succeeded using an existing process-local Go 1.26 installation. Browser preparation uses the declared Go 1.22.3 toolchain. No system defaults changed.

The default pnpm 8 cannot read lockfile v9. Exact pnpm 10.17.0 completed a frozen offline installation without resolution changes. Apple Clang lacks a WASM target; verified official WASI SDK 27 supplies only process-local WASM C/AR tools. The SDK Rust web/node WASM builds then passed. The SDK-pinned standalone compiler `4789838eb25c6da5c8d1402febf213f5c447a8e1` already requires sibling Node source overrides; the exact audit client source was copied into that isolated workspace and hash checked. Final browser/compiler distribution building remains in progress at this archive boundary. No source security check was removed.

## Still gated

1. Complete current-key synthetic UPS cohorts, including ordinary signed claim paths and failure/recovery evidence. Native program compilation is insufficient.
2. Final exact SDK browser distribution, wallet typecheck/build and generic verifier WASM release. Existing `installedMarketRelease:null` remains closed.
3. A fresh current-chain preflight, actual asset/issuer/graduation-recipient binding, budgeted new identities, contract/key registration and initialization. No old Curve or other deployment is updated.
4. Real ordinary extension approval, one exact broadcast, network inclusion, market settlement and ordinary claims. No new account, faucet, deployment, trade, claim or expense is represented here.
5. Random-source unpredictability, finality and causal seal-before-release remain independent protocol gates. Resource compatibility does not establish them.

Offline bounds: at most 12 native build commands, 60 unique complete UPSs, 7,200 aggregate proof-process seconds and 12 GiB sampled proof-family RSS; financial operations remain zero before a fresh preflight and separate live budget. A mismatch, authority/conservation failure, unknown broadcast or budget exhaustion stops dependent execution.

## Reproduce and review

Use `batching/dependencies/materialize_audit.py` with exact object stores into a fresh source directory, then `prepare_audit_application.py --source FROZEN_SOURCE --out FRESH_APPLICATION`. Build with Rust `nightly-2025-09-20`, `--offline --locked --release --features sdk-audit-v1`, `PSY_NETWORK=testnet`, explicit Genesis configuration and SDK profile. Build/test commands and toolchain provenance are retained in the archive; do not overwrite their outputs.

[Public original records and compiled artifacts](../../executor/verification/2026-11-02-audit-migration-v1/README.md). Earlier [runtime/source comparison](AUDIT_SDK_COMPATIBILITY_20261102.md) retains the raw resource capture. No matched performance, chain TPS, global fairness or production conclusion follows from this milestone.

## Closed AMM and current Native milestones

The latest four-market shared source compiles as a complete UPS test program. Eight fresh v18 AMM vault UPSs now pass: five members across two source pages, settlement pages 4+1, three synthetic swaps, cancellation/slippage refunds, timeout tail and unaccepted-source abort. Fixed verifier, spending key, exact stack/session, state endpoints and assets/fees conserve. Cold resources take 118.401 seconds within a full 729.223-second process; sampled process-family RSS peaks at 3,745,808 KiB. There is no matched speedup or live transaction. Ordinary claim evidence here is VM bytecode only, not a signed wallet or browser claim. The original shared harness label says v14; its actual version/fingerprint is v18, and original bytes are retained. [Complete public proof evidence](../../executor/verification/2026-11-02-audit-amm-ups-v1/README.md).

The unchanged audit browser SDK distribution built successfully, with 472 exact members. Wallet branch commit `b145653` contains the fixed SDK/Genesis/installer identity, passing exact installed-package checks, TypeScript, 742 checks with one existing skip and an isolated staging extension build. These are not browser payment acceptance. An existing import dialog in the dedicated profile was preserved and handed back; the new candidate has not been installed or used to create an account.

Eight fresh observations agree at checkpoint 9673, retaining the reset-chain anchors and selected verifier resources. A further bounded six-read cohort binds complete current Native bytecode/layout/function identity and source checkpoint membership. The SDK's published ABI lacks canonical state_layout; a strict application projection of only the exact frozen ABI, followed by unchanged full-root/count/function verification, fixes that build-input mismatch. The initial rejection is preserved. Source checkpoint 9672 and history root checkpoint 9673 have explicit separate roles and matching membership paths. This is not a finality or random-source timing certificate. [Full dependency binding and retained failure](../../executor/verification/2026-11-02-audit-native-binding-v1/README.md).

The ordinary full-wallet fixture initially attempted a retired legacy pool-settlement entry and rejected before any proof. Its correction uses fully backed synthetic pool preparation, retaining actual token transfer/claim bytecode. Curve's reachable lifecycle, Book/NFT full cohorts and complete wallet/WASM proofs remain in progress. New-instance financial actions and real UI writes remain gated.

## Reachable Curve and complete ordinary-wallet proofs

Curve now passes twelve complete reachable UPSs from an empty vault: six ordinary signatures and six v18 vault transitions, including actual ordinary grants/funding, initialization, user order/funding, explicit recovery after fee exhaustion, fill and ordinary signed final claim. There is no vault state injection. Native and both FT totals conserve including ordinary fees of 6,000,036,000 atoms and SD-key fees of 6,000,103,000 atoms. Cold resources take 111.317 seconds within a 642.930-second process; sampled family RSS peaks at 4,446,112 KiB. These are synthetic correctness measurements, not final network timing. [Exact requests and source-chain evidence](../../executor/verification/2026-11-02-audit-curve-ups-v1/README.md).

Two additional ordinary full-stack proofs verify with the **current captured complete Native dependency**: an initialized AMM order/funding transaction and a zero-stored-leaf Native claim/fee transaction using the separately fixed registration-start circuit. Complete call, CFC, UPS, signature/session and endpoint checks pass; fifteen negative mutation classes reject. Ephemeral signing keys are not persisted. The original retired-legacy-pool fixture failure and small compile/wrapper errors remain retained; the fixture fix does not relax any production gate. The exact flat-request counter correction is documented rather than rewriting telemetry. [Ordinary proof and failure evidence](../../executor/verification/2026-11-02-audit-wallet-proof-v1/README.md).

There are 22 unique complete synthetic UPSs at this milestone (AMM 8, Curve 12, initialized-wallet 1, first-session 1). Book/NFT current-Native v19 UPSs and actual WASM re-verification are running separately. Public native proof validity is not actual extension approval, deployment, inclusion, user balance arrival or production acceptance.

The configured faucet read now succeeds through certificate-verifying OpenSSL curl: it is enabled, offers 1,000 test PSY and currently does not require Turnstile. The first Python transport failure and independent valid TLS chain are retained. No claim, new identity or financial operation has been attempted. Browser installation remains separate from proof acceptance and the dedicated-profile existing import dialog is untouched.
