# Reset-chain deployment continuation — 2 November 2026

Application baseline: `ec5d6b34ef8e02c326b85cfa7bfca81671caacae`, branch
`markets-batch-capacity-recovery-20261020`. The SDK stays at mainnet-beta
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. No Node or SDK working tree, old
contract, original request, browser wallet or historical evidence is changed.

## Current-chain development boundary

The user requested development and deployment against the reset chain. This
continuation begins with fresh observations, not re-signing or replaying any
old-chain request. Root is the single owner; no financial/proof job was running.
The declared initial bound is eight explicit read-only RPC calls, zero financial
operations/instances/proofs until compatibility and full fresh preflight pass.
A separate recorded bound permits one offline Native-checker build and one
inspection. No faucet or payment is attempted and no budget is silently raised.

All three current heads are **9025**. The checkpoint-1 tree root remains
`e4f0f2cf2a563c11f67131f5b9b0e032c6b4016a59503b42cdc5aeb86af2fe30`;
the distinct checkpoint-1 leaf global chain root is
`81bac9934a1c18579519b5297c94c7e7d25cb53973ac67befefe8b7a86f96b5c`.
They agree with the preceding reset-chain observation. Old account IDs, contract
IDs, key identities, balances and receipts are not promoted into this instance.
Future assigned IDs must come from this chain's exact accepted registration and
deployment results, followed by actual-identity compilation/binding and full UPS
validation. `next_user_id` or `next_contract_id` observations do not reserve IDs.

## Necessary Native compatibility now verified

One fresh `psy_get_contract_code_definition` read captures the actual current
Native 0 bytecode (431,276 response bytes). The application snapshots the exact
frozen sources and builds its existing `chain_protocol_preflight` helper with
`nightly-2025-09-20 --offline --locked --release`, two Cargo jobs/two Rayon threads.
There are no SDK source patches; all **2,756** pinned source members reverify
after building. The helper has no network, wallet, signing or submission path.

The actual inspection passes:

- Exact frozen SDK Native-leaf schema and height 32.
- Duplicate-free method IDs, decoded bytecode input/output metadata and required
  `transfer/2`, `claim/1`, `burn/1` public signatures.
- Recomputed Native code root equals the observed
  `30f06e6c5c897af41c08f0f86677c66096e533ce490c9817b5ddf7b5812a3ea6`.
- SDK automatic fee burn method ID **3998182541** exists with the correct arity.

The build takes 49.296 s and the offline inspection 0.392 s. These are necessary
code/schema checks only: layout and function-tree inclusion, current checkpoint
membership, consensus finality, upgrade authority and a new-chain complete UPS
are not verified by this helper. No transaction/proof performance is inferred.
The older pre-mainnet helper with a different numeric-owner/burn convention is
not used; a fresh exact-SDK build avoids that historical mismatch.

## Actual remaining compatibility gate

The prove proxy still advertises Endcap fingerprint
`043e026dc674c310d8a9c529268a02619cab6f3779a74396a330c5ff0d0a5893`.
The frozen compiled SDK requires
`78b73eceb32a446a7cc04ca3ad36e0d856293f366593de8f6132c9240f91c6a3`.
HTTP recovery and Native code compatibility do not make these verifiers equal.
No remote resource is installed to force acceptance.

Read-only GitHub inspection found SDK `mainnet-beta` at
`559f89db5a7d3188106fa549b480cb8b695e0183`, referencing client
`a09093dd3773d5ade78c1304a8614cbaa8c6ca9d`; Node `mainnet-beta` was
`ca261b874b7cd8e00976470e0afe940d20098ffc`. These are source candidates,
**not the proven identities of the running services and not selected dependencies**.
Both inspected client/Node refs retain the same old embedded Endcap file (blob
`abeb88428c88d96564a748e700a29cd36eb981ac`). The SDK-pinned client's inspected
cached circuit library also contains neither the observed fingerprint nor its
circuit digest. This does not establish the result of every possible dynamic
circuit build; it establishes that blindly switching to the latest branch is
not justified as a compatibility fix. Full build parameters/resources and an
actual comparison are still required.

Additional read-only checks of `release/testnet-stable` at
`8d1161c6437eb2fb23c9e41caa486f138c68d99d` and `multi_chain` at
`c98159e796dfefd6840b7fac363328e3eb187ddb` find embedded Endcap circuit digests
`16c57f84…10762c6` and `65ba308a…778aaf6`, respectively. Neither equals the
observed runtime digest `69346804…2cbb57b`. Their exact immutable source/blob
records are retained in the separate
[additional source comparison](../../executor/verification/2026-11-02-reset-chain-source-check-v1.json).
No source is substituted into the frozen SDK by this inspection.

The concrete upstream requirements from the preceding
[resource handoff](../../executor/verification/2026-11-02-production-resume-v1/public/UPSTREAM-v1.json)
remain: reproducible running build/source/config identity, network/circuit
parameters, exact public Endcap verifier and common data plus ordinary UPS role/
whitelist resources, and actual complete-proof/network acceptance. The runtime
must be reconciled with the approved SDK or a separately reviewed migration
must supply matching sources and resources. Neither Node changes nor deleting
validation is an application-side remedy.

## New-registration gate closed in the formal route

The preceding resource fix protected financial proving/sending but did not
protect first-time funded-key registration. A new regression reproduces that
an incompatible runtime could still create a registration send intent. The
existing `continueFundedRegistration` route now checks the frozen Endcap before
persisting the **first** send intent, rechecks immutable inputs/driver and pins
the reviewed resource file in those input guards.

Existing ambiguous registrations are handled before this new-start gate: retain
the original identity and return `unresolved-registration` without another send.
Exact existing membership still uses the original native registration checker.
Resource changes do not manufacture a replacement request or hide an original
result. A changed chain/policy cannot rebind and replay the old send marker.
No parallel registration implementation or new market mechanism is introduced.

The bounded final host cohort passes **66** tests with no failures/skips,
including first-registration refusal, unknown-result reconciliation after a
resource change, reset-chain replay refusal and existing funded lifecycle,
exact prepared-send, public endpoint/wire and proof-recovery regressions.
These are explicit native/transport doubles, not actual registration, full UPS,
network inclusion or wallet-claim acceptance. The initial expected red failure
and intermediate 44-pass cohort remain public evidence; counts are not added.

## Deployment status and next execution

| Stage | Status |
| --- | --- |
| Fresh reset-chain anchor/head observations | Complete at recorded checkpoint; must be fresh again before a send |
| Necessary Native schema/bytecode/code-root/burn checks | Pass, frozen SDK |
| Runtime Endcap equivalence | **Blocked**; fingerprints/keys differ |
| New assets, market contracts, vaults and SD-keys | Not registered/deployed; no provisional ID is treated as assigned |
| Actual-ID complete UPS and reviewed wallet resources | Pending compatible runtime and fresh instance identities |
| AMM real UI fill, network confirmation and ordinary claim | Not run; writes remain closed |
| Curve, Book, NFT and dual-pool network acceptance | Follow the AMM closed-loop acceptance |

The release proceeds with new QA identities only after compatibility and full
fresh preflight. It then obtains bounded test PSY, deploys new QA assets and the
AMM instance, binds actual code/layout/function/key identities, installs reviewed
wallet resources, and completes approved full verification → exact one-send →
confirmation → ordinary claim/refund. Curve 11 and all old contracts remain
untouched. Curve, whole-order Book, unique-sale NFT and staged two-pool recovery
follow in the already agreed order. Actual budgets/instance counts are declared
before that financial phase; this zero-spend diagnostic phase is not a claim
that contracts have been deployed.

There are **zero** new registrations, deployments, full UPSs, network fills,
claims, faucet requests or spent test PSY/pUSDT. No live product, random fairness,
throughput or production-readiness claim follows. Existing shared-vault order,
pricing/matching, deterministic ordering and multi-UPS recovery semantics remain.

See [source, observations and reproduction evidence](../../executor/verification/2026-11-02-reset-chain-deployment-v1/README.md).
