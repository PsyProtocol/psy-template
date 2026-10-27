# Selected mainnet-beta SDK migration

This is a staged application migration, not a production or live-wallet
acceptance declaration. The application branch remains
`markets-batch-capacity-recovery-20261020`. No Node or upstream SDK source is
patched, no old contract is updated, and original artifacts are retained.

## Immutable inputs

- SDK branch: `mainnet-beta`, commit
  `c92880c8b6e2c8d392f19368bc8801a2584fd427`.
- Consumed client: `b280d714a8f0930c61962c885374ea63ea63d274`.
- Proving backend: `736572e9dd3ca93566471cf5a2a1cb67a13fe01d`.
- Build selector: `PSY_NETWORK=testnet`; magic `1384803358401154921`
  (`0x1337CF514544CF69`). The SDK branch name does not select mainnet.
- Source freeze: [manifest](../../batching/dependencies/mainnet-beta-20261027/manifest.json).
  The materializer verifies 2,756 upstream source files. The active application
  lockfile belongs to this dependency graph. The former lockfile is retained
  separately for historical reproduction.

## Changes and trust boundary

The selected SDK replaces the former generic SD-key module with DPN and
Plonky2 modules. Its high-level wallet explicitly does not implement the
Plonky2 SD-key mode. The application does not enable that mode, relabel a custom
circuit as a DPN program, or edit the SDK to work around the restriction.

The stateless market authorization circuit lives in
[market_key.rs](../../amm/u124/vm-tests/src/market_key.rs). Existing market
policy constraints and the compact policy's forty logical slots are retained.
Canonical noops are excluded only from the actual complete stack; active count,
ordered transaction hash, caller, arity, input hashes and signed session remain
bound. The complete start user leaf is hashed in-circuit and its identity,
public key and starting nonce are tied to the current signing context.

The application uses the SDK's explicit signature-proof and Endcap interfaces.
Each complete proof must also verify against the selected source's fixed
Endcap verifier and common data. This is separate from runtime provenance or
proof that a remote deployment uses a particular binary.

Native methods are now `transfer/2789897329`, `claim/3824212239`, and
`burn/3998182541`. Fresh policy builds select the explicit
`mainnet-beta-20261027` profile. An existing policy is never modified in place.
Shared descriptor references are migrated once, and already migrated or
ambiguous descriptors are rejected. The formal Executor rebuilds and compares
the complete canonical policy under this profile before running it.

Deployment ownership is a registered numeric user ID in the selected SDK.
Initial-layout preparation, request identity, checkpoint verification and
deployment receipt checks preserve this exact type. A public-key hash is not
truncated or coerced into an owner ID.

The new VM validator rejects input definitions emitted after constants. The
application's prior height insertion and two-limb scalarization did exactly
that. Both passes now preserve the complete Felt input prefix, insert resources
after it, remap subsequent Felt references and retain state-command resolution
timing. Native/NFT height references use the returned target indices. SDK
validation and executable regressions cover ABI inputs and authenticated key
context. No VM validation is disabled.

The browser/server plan codec, wallet capsule validation, durable workflow and
read-only gateway select native names from an explicit reviewed SDK profile.
The new profile requires the exact SDK manifest digest, testnet name/magic and
native code identity. Readiness accepts the numeric native owner only under
that profile. Legacy registries retain their original schema and cannot silently
adopt the new network. Read-only readiness never authorizes financial writes.

## Evidence reached

- All four admission market bytecodes compiled with the selected SDK.
- Four markets: two fills per market, eight complete UPSs in total for commit
  and settlement. SDK verification, the pinned source Endcap verifier/common
  data, public endpoints, fees, linked state and independent bytecode state
  comparisons passed. Exact public requests and proofs were retained.
- Twenty-one plain-batch bytecode lifecycle regressions passed. Seven
  authenticated-admission regressions passed, including omission/forgery/root
  rejection, consent, legal carry, sender recovery and local worker competition.
- One hundred twenty-four client/Executor/gateway/wallet-module regressions
  passed before the next wallet distribution stage.

The first lifecycle invocation incorrectly used admission fixtures for three
tests requiring plain-batch fixtures. Its three failures remain recorded. The
suite was rerun with independently compiled plain-batch fixtures; dedicated
admission tests were run separately. This is not described as an application
defect or hidden by deleting failed samples.

## Wallet, distribution and live boundary

Four ordinary funding UPSs and four ordinary claim UPSs also passed the SDK,
fixed Endcap key/common data, exact public endpoints and reference-state checks.
Metadata mutations and corrupt proofs were rejected. Compact SD-key stack and
session substitution tests passed for all four markets. These are native
offline proofs, not remote inclusion evidence.

The unchanged SDK built for Rust, WASM and TypeScript. Its declared compiler
artifact uses source `3533edac7455ec9e8207b3a64086be4d0cb63b66`, hash
`05bfab562518a2fdc765856534962f395de8825536ab5bcc29f2996e1e0fe736`.
See the [compiler freeze](../../batching/dependencies/mainnet-beta-browser-compiler-20261027/manifest.json).
Retained environment failures concern the old package-manager lockfile reader,
Cargo SSH transport, Apple Clang's missing WASM target and Apple's archive tool.
An isolated hash-verified Zig 0.14.1 C/archive toolchain resolved these build
dependencies without SDK or Node patches. The evidence records 472 distribution
file hashes; package source version 2.0.8 does not imply an npm publication.

The wallet consumes runtime PsyJSON and SignType from the public package root;
old runtime deep imports do not resolve in this distribution. New native
intents use transfer/claim only for contract zero. Exact stored requests are
never rewritten. Input identity, affordability, pending holds, approval and
activity classification preserve this distinction. Numeric deployment owners
are resolved against the registered wallet identity.

The final consumer regression run passed 716 checks with one skipped.
Network-migration tests reproduce the original background cold-boot failure,
then pass explicit selection and recovery through the actual message handler.
Persisted sepolia/ethereum selections now require explicit user selection,
rather than silently choosing the new chain. Invalid nonempty build-network
values reject. Both the sibling SDK and the actual installed/resolved package
metadata, exports and 472 distribution files are checked before normal builds.
A stale installed package and changed metadata reject. The wallet extension
built against the selected distribution.
Its embedded application modules are regenerated, but remain prepare-only
until the new registry, native full-call/session verifier and exact durable
transport are accepted.

The SDK does not provide the former private-FT packet-verification API. That
path rejects before payment: capability absence and asynchronous failure both
produce zero submitter calls. The offscreen adapter does not expose a throwing
stub as a usable capability. Application delivery metadata types do not supply
verification. Existing committed recovery records remain retained. Removed reward APIs reject, while the replacement prepare/confirm
APIs are forwarded without inventing arguments. Those unsupported consumer
flows are not declared accepted.

Fresh read-only staging observations at checkpoint 4236 verified the retained
genesis anchor, numeric native owner, complete native bytecode root, methods
and height. The remote Endcap fingerprint is
`78b73eceb32a446a7cc04ca3ad36e0d856293f366593de8f6132c9240f91c6a3`;
complete verifier metadata matches the retained observation and the fingerprint
matches the selected source's fixed key. This does not attest runtime images
or upgrade authorization. Isolated deployment and real UI writes remain gated
milestones. Previous-chain market identities cannot be used on this chain.
Unknown broadcasts retain original identity; automatic replacement payments
remain forbidden.

- [Market bytecode and eight complete UPS requests](../../executor/verification/2026-10-27-mainnet-beta-market-ups-v1/manifest.json).
- [Ordinary UPSs, adversarial checks, SDK build and consumer failures](../../executor/verification/2026-10-27-mainnet-beta-wallet-ups-v1/manifest.json).

## Reproduction

Materialize the selected sources using
[materialize_mainnet_beta.py](../../batching/dependencies/materialize_mainnet_beta.py),
then use [prepare_mainnet_beta_application.py](../../batching/dependencies/prepare_mainnet_beta_application.py)
with explicit fresh source/output directories. Build the returned manifest with
`--locked`, `nightly-2025-09-20`, the frozen `PSY_CONFIG_PATH`, and
`PSY_NETWORK=testnet`. The `--test-only` option disables unrelated automatic CLI
link targets; it does not change the library, witnesses or test source.

Use `compile_batch`, `compile_composition_token`, `compile_qa_nft` and the
captured-bytecode decoder against fresh output directories. Admission compilation
must explicitly select the new native profile. Proof test selectors are
`full_ups::full_ups_four_market_commit_and_settle_proofs` and
`full_ups::ordinary_wallet::four_market_ordinary_wallet_complete_ups` in
`batch_lifecycle`. The latter requires explicit ignored-test selection, a fresh
output directory and `fund` or `claim` mode.

This run is compatibility/security evidence. Builds overlapped some proof
execution, so elapsed times are not a controlled performance comparison. No
chain confirmation time, speedup, TPS, cross-machine coordination or production
readiness is claimed.


## Review and isolated progression

Different-model staged wallet source review closed network recovery, installed
SDK identity and pre-payment private-FT capability findings. Source hashes of
all twelve embedded modules match the application. This is not an upstream SDK
audit or full application-wide all-lines review; the latter remains uncompleted.
The host staging guard now requires an explicit profile environment value,
including when profiles share network magic. A child invocation without that
value rejected before key output. The proved circuit source was unchanged.

Wallet consumer: [8f9b5ac](https://github.com/PsyProtocol/psy-wallet/commit/8f9b5ac).
The wallet's format hook initially rewrote reviewed files; that unpublished
commit was replaced with the exact reviewed tree and all hashes rechecked.
No remote history was rewritten and unrelated formatter edits were restored.

Fresh issuer 1590272 was registered once and included at checkpoint 4282.
QA FT A deployed as contract 6 at checkpoint 4367, with numeric owner, complete
code/function/layout endpoints, initial layout proof and authenticated checkpoint
membership independently reverified. QA-only symbol restrictions distinguish
new FT code identities and do not change base market mechanisms. QA FT/NFT are
not existing pUSDT or native test PSY. No ordinary market UPS has been submitted
in this isolated stage. The one original faucet request returned HTTP 502;
claimable read at services checkpoint 4342 showed zero, which does not prove
that the original request cannot execute later. No faucet retry or replacement
payment is permitted by this observation. Its raw error body was not retained;
that evidence limitation is recorded explicitly.

New deployments are processed serially and stop on unknown/rejected/unverified
results. Browser market broadcasting remains disabled until new market
registries, setup, native full-call/session verification and exact transport,
real settlement, ordinary claims and recovery are accepted. This report does
not mark those remaining user tasks complete.


## New-chain deployments and read-only UI (follow-up)

The selected SDK/client/backend pins above are unchanged. No protocol Node
source or existing contract was modified. The wallet follow-up is
[eaccc2a](https://github.com/PsyProtocol/psy-wallet/commit/eaccc2a).

| Component | New contract | Registered vault | Acceptance boundary |
| --- | ---: | ---: | --- |
| QA FT A / B | 6 / 7 | Not applicable | Initial deployment and authenticated checkpoint evidence only; metadata and supply not initialized |
| QA NFT | 8 | Not applicable | Initial deployment and authenticated checkpoint evidence only |
| AMM | 9 | 631808 | Deployed/key registered; setup and real settlement pending |
| Orderbook | 10 | 287744 | Deployed/key registered; setup and real settlement pending |
| Bonding Curve | 11 | 746496 | **Quarantined before initialization or funding** |
| NFT Market | 12 | 1053696 | Deployed/key registered; setup and real settlement pending |

Each original deployment and key registration was sent once. Numeric owner,
complete code/function/layout endpoints, initial layout proof and authenticated
checkpoint membership were reverified. This does not establish runtime image
provenance, upgrade authorization, market initialization or a successful fill.
No ordinary UPS was submitted in this new-chain live stage.

Curve 11 inherited graduation recipient 400 from the offline fixture. That
recipient was not verified as controlled. This was a configuration error, not
an accepted deployment for funding. The instance is unfunded and uninitialized;
it will not be updated. The pinned v3 registry marks it quarantined, and
client plan validation, wallet preparation and gateway reads reject it before
preparation/RPC. The UI removes its real account/action controls while retaining
clearly marked local demonstration forms. Historical pre-quarantine read-only
registries are archived, not used as current runtime configuration.

A fresh candidate binds graduation to SDK-created test identity 1856512, using
its exact included registration at checkpoint 4827 and unique coordinator
mapping. The acceptance guard rejects fixture target substitution, issuer
aliasing, key changes, missing inclusion and ambiguous mappings. Registration
and mapping are not an authenticated active user leaf or funding authorization.
The candidate compiled and its new initial-layout request verified offline:
76 fields, 1,291,845,916 slots, owner 1590272, code root
`0d02be6709797e981c802b8515dfb58110c4a0d05708b4a2f8adcf4235777b5d`.
It is **not deployed**, has no registered key and has not passed a full UPS
against a new live instance. The originally declared seven-contract run cap is
exhausted; replacing Curve requires a separately recorded additional-deployment
decision, full candidate acceptance and fresh live gates. No old update is used
to avoid that boundary.

The current gateway uses `mainnet-beta-v3.json`. AMM 9 and the other new-chain
identities replace previous-chain reader pins; local demo drafts retain their
original fixture IDs. Liquidity controls label the separately planned live
pool 9 instead of silently treating a demonstration draft as a live order.
Browser taskspace 51 exercised the actual rendered application: the issuer
read reports no active user leaf; Curve 11 renders quarantine with zero action
controls. No signing, payment or browser wallet claim occurred. The initial
read hit the two-reader capacity limit and its wait timed out; that failure
was retained before the later read succeeded in reporting the inactive state.
The dedicated browser session was then closed; unrelated sessions were not
used. The optional Ego Lite update was not installed.

At common checkpoint 4902 issuer 1590272 still had native balance zero and an
empty user leaf. Its indexed registration is not evidence of spendable funds.
The original faucet request remains unknown after HTTP 502, and is not retried.
The gateway now gives bounded static errors for inactive accounts and
unfinalized/mismatching token metadata while keeping all validation and write
restrictions. It never exposes raw internal exception text for these cases.

Focused client/gateway/recipient regressions: 81 passed. The wallet's unchanged
selected-SDK cohort: 716 passed, one skipped; typecheck, distribution guard,
application build and staging extension build passed. An accidental invocation
of nonexistent `pnpm build` failed before compilation and remains recorded;
`build:staging` is the verified command. These are compatibility/security
checks, not a performance comparison or live settlement acceptance. The
narrow wallet staged-diff review read all three changed files, checked all
twelve source hashes and exact bundle/registry/ABI/SDK digests, and found no
unresolved issue in that scope. It did not audit SDK upstream or attest chain
runtime identity.

Evidence:

- [QA deployments and original faucet observation](../../executor/verification/2026-10-27-mainnet-beta-isolated-assets-v1/manifest.json).
- [AMM deployment and key registration](../../executor/verification/2026-10-27-mainnet-beta-amm-deployment-v1/manifest.json).
- [Book, Curve quarantine, NFT and recipient registration](../../executor/verification/2026-10-27-mainnet-beta-three-deployments-v1/manifest.json).
- [UI, failures, wallet checks and replacement layout proof](../../executor/verification/2026-10-27-mainnet-beta-ui-quarantine-v1/manifest.json).

Still open: test PSY funding reconciliation; finalized QA metadata and supply;
new Curve deployment/key and exact-instance UPSs; market setup, real fills,
ordinary claims/refunds/recovery; wallet-owned fixed native full-call/session
verifier plus durable exact broadcast/reconciliation; runtime provenance and
upgrade authorization. The prepare-only wallet intentionally rejects verify,
freshness recheck, broadcast and reconciliation until those adapters are
implemented and accepted. Private FT packet verification remains unavailable
in the unchanged SDK and rejects before payment. No UI write, chain TPS,
cross-machine or production-ready conclusion is supported by this milestone.
