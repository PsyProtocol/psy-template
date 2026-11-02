# Audit SDK / reset-chain resource compatibility — 2 November 2026

Status: **the audit branch supplies the exact current runtime Endcap verifier**.
This closes the published Endcap-source identification gap in the preceding
reset-chain investigation. It does not mean SDK migration, a complete UPS,
wallet payment, runtime-build attestation or new deployment has passed.

The user requested a read-only check of the SDK's `audit` branch. Existing
application branch, frozen c92880c8 dependency, wallet, Node, old contracts and
original evidence remain unchanged. No financial/proof task is started. The
bounded fresh diagnostic uses two explicit RPC calls, no retries, no new proof,
registration, faucet, payment, deployment or claim. No alternate verifier is
installed into the current production trust set.

## Exact source identities

| Item | Inspected identity |
| --- | --- |
| SDK branch | `audit` |
| SDK commit | `01b8f2b0a077367a7b9879baba1a72aea8ab5510` |
| SDK-referenced client/Node commit | `7058070057c3242b5d8b29e1a31d498aaa4202c0` |
| SDK backend override | `736572e9dd3ca93566471cf5a2a1cb67a13fe01d` |
| Toolchain | `nightly-2025-09-20` |
| TS package metadata version | `2.1.0` |
| Current checkpoint-1 global chain root | `81bac9934a1c18579519b5297c94c7e7d25cb53973ac67befefe8b7a86f96b5c` |

These are immutable source observations and a current RPC anchor; they do not
prove that every running service uses that source commit. The inspected root
matches the reset-chain baseline. Branch names remain mutable, so a migration
must freeze the exact commit, submodules, client/backend inputs and built
native/WASM distributions instead of depending on the branch name alone.

Source links:

- [SDK workspace and dependency pins](https://github.com/PsyProtocol/psy-sdk/blob/01b8f2b0a077367a7b9879baba1a72aea8ab5510/Cargo.toml).
- [SDK-referenced Endcap verifier](https://github.com/PsyProtocol/psy-node/blob/7058070057c3242b5d8b29e1a31d498aaa4202c0/psy_plonky2_circuits/src/circuit_library/end_cap_verifier_data.rs).
- [SDK-referenced cached circuit registry](https://github.com/PsyProtocol/psy-node/blob/7058070057c3242b5d8b29e1a31d498aaa4202c0/psy_plonky2_circuits/src/generated/cached_circuit_library.rs).
- [Fingerprint construction](https://github.com/PsyProtocol/psy-node/blob/7058070057c3242b5d8b29e1a31d498aaa4202c0/psy_plonky2_circuits/src/proof_minifier/pm_core.rs).

## What matches

The audit client's `END_CAP_ALT_VERIFIER_DATA_SERIALIZED` equals the entire
observed `ups_end_cap.verifier_config`: **all 16 constants/sigmas cap entries and
the circuit digest**. Cached circuit type 6 has the same full verifier and
advertised fingerprint. The current runtime and audit source both yield:

- Fingerprint: `043e026dc674c310d8a9c529268a02619cab6f3779a74396a330c5ff0d0a5893`.
- Circuit digest: `6934680402ad9d0521feb981c72e3990f98e8082c4dd9d758ed27d7142cbb57b`.

The inspection independently recomputes the fingerprint using the source's
Poseidon `hash_no_pad(cap elements || circuit digest)` construction and the
already installed `poseidon-goldilocks-lite` 0.2.3 helper. It also recomputes the
old frozen SDK fingerprint as a control and verifies a substituted digest does
not retain the expected identity. Fifteen advertised runtime circuit-role
fingerprints recompute from their own verifier bytes; this is **not** a comparison
of all those roles against freshly constructed audit-SDK circuits. Only Endcap
has the explicit complete cached-source match established in this investigation.

The first comparison run stopped because the independent JS helper returns a
`0x`-prefixed display string while the SDK serializes an unprefixed string. Its
script/log are retained. A separate v2 script normalizes only that display
prefix and passes the exact comparisons, frozen control and substitution check.
There is no protocol hash change, weakened equality or extra RPC retry.
An initial source lookup used the wrong `psy_config` path; the correctly pinned
file was then read from `client_prover/psy_core/psy_config/src/network_constants.rs`.
Both source-read records remain, without treating a missing file as compatibility.

## What is not yet accepted

- A frozen, reproducibly built audit SDK/native/WASM distribution, including exact
  Genesis submodule/config inputs and common-data identity.
- Generated ordinary UPS role keys, whitelist/config paths and common data
  compared against actual constructed audit-SDK resources.
- Four-market/SD-key/Executor API migration, current-instance key identity and
  complete approved-call/caller/parameter/U124/session/sig_hash/nonce/state/fee
  verification using the audit build.
- Complete real UPS verification and submission on this reset chain.
- New assets, markets, vaults, registrations, actual UI approval, settlement,
  ordinary wallet claim, refunds or restart/unknown-result live recovery.
- Runtime build/upgrade authority, canonical checkpoint finality, qualified
  randomness and causal batch-seal-before-seed-release authentication.

These remain distinct gates. Matching the Endcap source makes this SDK a
well-supported **migration candidate for the new chain**; it is not authority
to replace one verifier constant inside the old c92880c8 application or to claim
that the entire product has passed. Existing immutable requests and old-chain
records must retain their original dependency and chain identities.

## Next migration sequence

If moving to this SDK, freeze audit commit `01b8f2b0…`, client `70580700…`, the
backend and exact Genesis/build inputs in a new versioned dependency profile.
Keep the existing frozen profile and raw evidence intact. Port the existing
four markets, dedicated keys, formal Executor and wallet through that profile,
then rebuild/reverify native and WASM complete UPS/call-session binding with
new reviewed resources. Only after fresh chain/dependency/state/funds checks
should new isolated deployment, AMM approved settlement/claim and the remaining
markets proceed. No Node source modification is needed to investigate or
prepare this client migration; no migration is performed by this inspection.

[Public observations, immutable source captures and comparison scripts](../../executor/verification/2026-11-02-audit-sdk-compatibility-v1/README.md).
