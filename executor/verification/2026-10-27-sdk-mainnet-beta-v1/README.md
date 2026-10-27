# User-selected mainnet-beta SDK compatibility

**The selected SDK supports the observed native protocol.** The previous failure
was obtained with the application's old source snapshot. It must not be described
as evidence that mainnet-beta is incompatible or that no adapted SDK exists.

## Selection and native checks

| Input | Pinned value |
| --- | --- |
| SDK repository and branch | PsyProtocol/psy-sdk, mainnet-beta |
| SDK source commit | `c92880c8b6e2c8d392f19368bc8801a2584fd427` |
| Client dependency commit | `b280d714a8f0930c61962c885374ea63ea63d274` |
| Existing upstream proving-backend pin | `736572e9dd3ca93566471cf5a2a1cb67a13fe01d` |
| SDK Genesis gitlink | `0e15c98183e9e975b8f9b9158504fe0ec6f0413d` |
| Client Genesis gitlink | `067fd40d3d254d907de135ebd87dfb8436bed691` |
| Stage / magic | testnet / `1384803358401154921` |
| Toolchain | nightly-2025-09-20 |

The fresh materializer reconstructs all four exact source trees without a patch,
verifies 2,756 upstream files and leaves existing working trees/evidence intact.
The selected SDK and client testnet public config is identical. The source npm
package version is 2.0.8; no new package was published, installed into the wallet,
or accepted as a complete distribution. Branch selection is not network selection:
these diagnostics use testnet, not mainnet.

`batching/sdk-mainnet-beta-preflight` compiles an application-only offline
diagnostic against the exact core/VM client crates used by this SDK and its
unchanged backend patch. The original offline attempt failed because the new
backend was absent from the local source cache. The subsequent build downloaded
the pinned sources; a final locked/offline build succeeded. This is a diagnostic
consumer build, not a full SDK Rust/WASM/TypeScript release build.

Six fresh readonly RPCs returned HTTP 200; the initial heads were checkpoint
3366 and `next_contract_id=6`. The chain anchor remains
`24fe11facdc008ad5a6e6408da654217380b798af1ddb7df59845dfecd395942`.
The compiled testnet diagnostic successfully:

- Decodes the numeric native deployer with the upstream SDK type; no hash-to-ID
  conversion or owner coercion is used.
- Decodes all native bytecode and matches its metadata/code root exactly to
  `f54490d8ed6ccd5bb06f3c42193a5b11ce7bd252c9eae2c3697f9f3e483e26ee`.
- Confirms transfer ID `2789897329`, claim ID `3824212239` and the selected SDK's
  automatic burn ID `3998182541`, including arity and zero outputs.
- Rejects four changed captures: old hash owner, wrong numeric native owner,
  changed code root and changed state height. Three native unit tests pass.
  Three materializer tests and one real fresh reconstruction also pass.

One additional readonly `psy_get_circuits_data` request succeeded. The actual SDK
provider expects a JSON-RPC **string** result containing JSON. The first wrapper
observation retained that string without interpreting it; decoded-v2 preserves
the correct interpretation. The observed Endcap fingerprint is
`78b73eceb32a446a7cc04ca3ad36e0d856293f366593de8f6132c9240f91c6a3`.
Its verifier config equals the selected source's real verifier blob. This is
readonly equality, **not** a runtime attestation, independent key validation,
authenticated checkpoint proof, full UPS or evidence of live chain acceptance.
Do not promote metadata, select a different network enum or relax fingerprint
checks based on this observation. Upstream non-local metadata-validation policy
and actual network key acceptance still need their own evidence.

## Remaining application migration, not a missing SDK

An isolated release-mode `cargo check --lib` ran against the unchanged market
library from `92ae3095`, the new client source and the exact upstream backend
patch. First, the FFI build found an installed old Go binary and rejected its
unsupported `toolchain` directive. Selecting the existing Go 1.26.0 by explicit
PATH/GOROOT cleared that environment error without a source patch. The next
check reached the market library and failed with **12 application API/type
errors**. Both complete logs are retained. No diagnostic failure was discarded
or presented as a successful migration.

The port must preserve these boundaries:

| Application area | Required adaptation | Acceptance gate |
| --- | --- | --- |
| Custom market/composition SD-keys | Removed `signature::sd_key` interface becomes separate DPN and Plonky2 gadgets; witness/signature context and actual calldata bindings differ | Rebuild key identities; bind full actual stack, caller, inputs, sig_hash/session, network, user, nonce, fees and endpoints; reprove mutations and complete UPSs |
| Compact logical batches | Existing 40 logical slots include canonical noops; new upstream introspection uses active slots/raw inputs | Preserve compact actual-call hash and the frozen logical set; no constructor alias or zero-filled context used merely to compile |
| Wallet integration | Replace removed generic insert/witness methods with the correct DPN/Plonky2 interfaces | Exact approved request, signing preimage and original-identity recovery remain mandatory |
| Initial-layout preparation | The new deploy command owner is authenticated numeric user identity, not a public-key hash | Verify the exact owner/authorization relation; never truncate or cast a hash into a user ID |
| Native descriptors / registration | New native names/IDs and owner schema invalidate prior assumptions | New code/key/vault identities and independent full proofs; old registry/keys/requests are not reused |

The new source already contains explicit signature-preimage binding. Its presence
is not proof that our existing custom circuits are correctly wired to it. No
security constraint was deleted to hide these compile failures. Existing root
market build inputs, registry, ordinary wallet provider and UI financial gates
have not been switched to this unaccepted integration. The selected source is
frozen and runnable through the new preflight consumer; complete application
adoption remains open, rather than silently falling back to the old SDK.

There were **zero** registrations, deployments, faucets, signed requests,
financial proofs, fills, claims/refunds, fees or financial broadcasts. No old
contract was updated, no prior request replayed, no Node or SDK source changed,
no original artifact overwritten and no heartbeat recreated. No new performance
or production conclusion is supported.

## Reproduction and evidence

Start with the [source recipe](../../../batching/dependencies/mainnet-beta-20261027/README.md).
The native probe consumes captured public envelopes offline:

```sh
/absolute/fresh/target/release/psy-market-mainnet-beta-preflight \
  /absolute/public/native-leaf-response.json \
  /absolute/public/native-code-response.json \
  /absolute/fresh/native-compatibility.json
```

Expected exit status is 0 for the retained observations, with
`necessaryNativeChecksPassed=true` and `financialReady=false`. The tool has no
network, wallet or broadcast transport. Unit tests use `cargo test --release
--locked` with the same manifest/configuration. Materializer regressions run via
`python3 -m unittest discover -s batching/dependencies -p test_materialize_mainnet_beta.py`.

The public-only MANIFEST binds raw RPC envelopes, positive/negative results,
all failed/successful build logs, the exact probe source/lock, isolated library
manifest/lock, source hashes and binary identity. Source hashes and captures are
not substitutes for proofs. Original local artifacts remain in the persistent
run directory recorded in the manifest. No credentials, keys or wallet recovery
files are included.
