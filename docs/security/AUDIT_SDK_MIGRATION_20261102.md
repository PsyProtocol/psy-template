# Audit SDK migration — 2 November 2026

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
