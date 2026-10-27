# Market correctness and reset-chain validation — 27 October 2026

## Starting point and execution order

The application started at `5af851ad` on
`markets-batch-capacity-recovery-20261020`; the wallet started at `9c407d5` on
`wallet-security-20261016`. Both trees were clean. No financial or proof job was
running; existing UI/read-only gateway processes were left untouched. Root was
the sole financial/proof owner. The frozen SDK remains
`c92880c8b6e2c8d392f19368bc8801a2584fd427`, consumed client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. No dependency, Node or old contract
was changed. Initial application library compilation and selected-cohort wallet
typecheck passed; the earlier compile errors are historical, not current.

The remaining sequence is: source/API and Curve correctness; wallet-owned
verification/approval/exact send; new isolated registrations/deployments and
ordinary-wallet claims; controlled cold/warm performance and fault acceptance;
then the remaining composition paths. No step below closes that entire sequence.

## The RPC recovered onto a different chain instance

Realm 0, realm 1 and coordinator returned valid HTTP 200 RPC responses. Their
checkpoint was approximately 347 rather than the previous 4902. Checkpoint 1's
chain root is now
`919896e18690246e20307f68cf2e5725aee496755366bbafff88eccaea975f12`.
Old AMM 9 is absent; both previous QA public keys return empty registration lists.
The previous chain's registries, balances, IDs and receipts are historical.
A lookup on this new chain cannot resolve the old issuer's unknown faucet grant.
No old request was resent, re-signed or replaced.

The native contract now has:

| Endpoint | Captured value |
| --- | --- |
| Code root | `5df4b10ccf59e25f3c44b4164edb9597455da33b925c3981881c280f2636ebd1` |
| Layout root | `cd6931e5422fb07be012e3d0642bbffd0880bf499ecc87bcb822276d7426771c` |
| Function root | `1ad1a069434cf058a419f4d874615c6fc47170471069f5d232874099ef13c5b1` |
| State height / fields / slots | 32 / 8 / 8594128984 |

`project_native_layout.py` projects only the frozen genesis ABI's state/type
fields to a canonical-layout **candidate**. It omits the historical method ABI.
`verify_native_layout` reconstructs that layout with the frozen SDK and requires
exact agreement with the captured native leaf. The selected public `transfer`,
`claim` and `burn` definitions equal the previously reviewed bytecode. Their
CFC fingerprints are rebuilt from the current definitions and authenticated by
captured function Merkle paths, including index and arity descriptors. Other
native methods, including the changed `claim_deposit`, are not accepted by this
selected-method compatibility result.

The service-published Endcap verifier-only data and fingerprint match the frozen
source (`78b73ece…91c6a3`). Common data still comes from the fixed local source;
the service does not publish a common-data object through this interface.
This is compatibility evidence, **not** service-image attestation or a complete
live UPS. Wrong code, layout count, missing layout, Endcap fingerprint and
function-root inputs all reject without a success report.

The application verifier exporter and linked UPS fixture no longer assume every
native layout is zero. A non-null ABI must reconstruct canonically; a null ABI
is supported only for the historical native-zero artifact. The exporter still
compares every reconstructed root/count with its reviewed binding. There is no
fallback after a failed non-null ABI and no weakening of endpoint checks.

[Native preflight evidence and tested source](../../executor/verification/2026-10-27-reset-native-preflight-v1/manifest.json).

## Corrected Curve recovery proof milestone

Candidate `0d02be67…5777b5d` completed four linked full UPSs on synthetic
authenticated checkpoints: commit, expire, recommit, and four-member refund.
The fixture uses the captured new native bytecode and its authenticated canonical
layout. Every exact public request is retained, with fixed Endcap/common-data
verification, SD-key/session binding, linked leaves and state-delta checks.

Premature expiry, wrong-root settlement and terminal replay reject in the VM;
the rejected settlement preserves committed state. Cancellation and recipient
claims are VM checks in this run. They are **not** ordinary-wallet UPS or browser
acceptance. The existing candidate's configured old-chain recipient and asset IDs
remain fixture constants; it is not ready for deployment on the reset chain.
New registered identities must be compiled/bound and proved before deployment.
Old-chain Curve 11 remains isolated and was not initialized, funded or updated.

The initial invocation incorrectly selected ignored tests and ran zero tests.
It is retained as a failed acceptance invocation, not counted as a pass. The
corrected invocation generated exactly four UPSs once and passed. No financial
operation occurred and no original artifact was overwritten.

[Exact requests, fixtures, tested source and complete logs](../../executor/verification/2026-10-27-curve-recovery-native-layout-v1/manifest.json).

## Measurements and limits

This is one correctness lifecycle, not a same-condition before/after benchmark.
Its process uses two Rayon threads. No SDK clean build was measured. The second
invocation reused a compiled application test binary; first in-process circuit
construction is measured separately.

| Measurement | Observed |
| --- | ---: |
| First circuit/key construction | 111.631 s |
| Commit, 3 physical calls including burn | 38.945 s |
| Expire, 2 calls including burn | 23.231 s |
| Recommit, 3 calls including burn | 35.688 s |
| Refund settlement, 23 calls including burn | 153.510 s |
| Test harness / launcher through exit | 365.23 / 366.62 s |
| Sampled process-family RSS sum peak | 2305.77 MiB |
| Simulated fee total / actual network fees | 4.000061 / 0 test PSY |
| Actual fills / refunded members | 0 / 4 |
| Submit / final confirmation / ordinary-wallet claim | Not exercised |

The two-second RSS samples cover the launch-to-exit process family. Summing RSS
can count shared pages repeatedly and miss peaks between samples; this is not
unique physical peak memory. Sample count is 180. No p95, steady-state throughput
or general speedup is inferred. Endcap/recursive-finalization remains a large
bucket (77.535 s of the refund stage); its existing combined timing cannot be
presented as Endcap proving alone. Fixed-verifier construction occurred once
(3.286 s); later accesses hit immutable resources, while all four complete proofs
were verified anew. Phase subtotals are not added to an already measured wall
interval. Different call counts are not a cold/warm comparison.

## Outstanding gates and bounded stop

- The second readiness set still reports faucet HTTP 503. No grant was requested
  this round; no old unknown grant was retried. No existing pUSDT was spent.
- The initial bounded plan allowed one replacement Curve, one key registration,
  at most 16 ordinary UPSs and 20 additional test PSY fees within the existing
  aggregate cap. The reset invalidates the planned identity set. Rebuilding all
  QA assets and four markets requires a new explicit instance/count ledger;
  this round did not silently expand those limits. Actual financial operations
  and fees are zero.
- Wallet core remains prepare-only. Installing a reviewed instance-specific
  verifier pack, wallet-owned final confirmation, native exact-broadcast wiring,
  NFT identity postconditions and actual extension acceptance remain open.
- New-chain market setup, real fills, ordinary claims/refunds, fault acceptance
  and matched performance pairs remain unverified. Old live evidence is not
  promoted to this chain.
- Runtime provenance and upgrade-RPC authorization require service-owner delivery
  of the running artifact identity and isolated unauthorized/replay rejection
  evidence. The application retains its code/layout/key/domain preconditions;
  it does not relax them to accommodate unknown infrastructure.
- One UPS writes the signing user's state across allowed contracts. Separate
  vaults and UPSs retain confirmation/claim dependencies; Outbox is not spendable
  before claim. Same-origin/local coordination is not cross-machine acceptance.
  Deterministic sealed-queue processing is not global inclusion or censorship
  resistance. Random ordering remains disabled.

The existing [composition capability matrix](../../composition/CAPABILITIES.md)
continues to govern atomicity and deferred-call limits. Book remains whole-order:
an unresolved order must terminate and release funds, followed by claim, before
AMM use. No market mechanism or batch capacity changed in this milestone.

## Wallet pre-proof chain guard milestone

The application service now rejects a changed checkpoint-1 chain anchor before
creating a preparation task, witness or proof. It uses the reviewed coordinator
endpoint, strict successful JSON-RPC framing and a bounded response. Only an
identical in-flight read can be shared; no completed observation is cached.
AMM and other-market bundles must share their exact chain identity as well as
network configuration. Existing broadcast-time code/layout/key/nonce/fee and
state checks remain unchanged. A failed observation does not release any existing
pending intent or authorize a retry of an unknown broadcast.

Ten focused application cases passed, including a reviewed AMM preparation on a
changed chain that invokes neither prover nor persistence. A separate real RPC
observation through the vendored wallet module rejects the historical bundle;
it generated no proof, durable write or financial operation. Wallet integration
passed seven cases, selected SDK/typecheck guard passed, and staging build passed.
These checks do not install a live verifier release or enable page writes. The
19-module vendor output retains exact source hashes; the wallet delivery must
follow publication of the corresponding application source milestone.

[Guard source snapshot, failed/successful regression logs and selected-cohort build evidence](../../executor/verification/2026-10-27-wallet-chain-guard-v1/manifest.json).

## Composition/probe layout propagation and full native whitelist

A follow-up source search found the same zero-layout assumption in the dual-pool
complete-UPS fixture and two independent CFC probes. Those three paths now use
the shared strict ABI reconstruction. `cargo check --release --locked --offline`
passed for `batch_lifecycle` and `composition_funds` against the unchanged frozen
SDK (4.90 s incremental check). This compiles both test targets; it is not a
new proof or execution pass. The earlier four-UPS archive retains its exact tested
source snapshot; no proof was regenerated for these separate fixture paths.

The source-derived verifier exporter additionally rebuilt **all** native method
fingerprints and reproduced the complete captured native function root
`1ad1a069…13c5b1`, together with its exact code and canonical layout/counts.
It exported verifier-only resources for public transfer/claim/burn, with pack
SHA256 `ffcd8f90d35aabeedf10e1f5d8fb95a71f82c9ecaee670a1f58dd79ca5a8cbe8`.
This closes full-native-whitelist reconstruction beyond the earlier three
membership paths; it does not validate the business semantics of every other
native method. The 25.34 s resource build generated no business UPS and is not a
transaction-performance result. The native-only pack is not an installable
four-market wallet release and was not activated by the wallet or UI.

The published wallet commit
[`075703d`](https://github.com/PsyProtocol/psy-wallet/commit/075703d)
vendors the exact application source from
[`e302d157`](https://github.com/PsyProtocol/psy-template/commit/e302d157).
Fresh reproduction matched all 21 output files (19 modules, bundle and source
inventory). An HTTPS push failure was recovered using SSH for the same commit;
no branch/dependency changed. All new native/composition work remains financial
operation count zero.

[Follow-up source, compile log, native verifier resources and reproduction evidence](../../executor/verification/2026-10-27-composition-native-layout-v1/manifest.json).

## Formal wallet source integration follow-up

[Formal integration report](WALLET_FORMAL_INTEGRATION_20261027.md) records the
background/approval/exact-send wiring, explicit reset-chain profile, reviewed
resource build tool and page protocol. The installed release remains null and
NFT writes remain closed. The user deferred unlocking; no new financial or
proof work was started. Current faucet configuration is enabled, but no grant
was requested. Actual extension and current-chain market acceptance remain open.

## Verifiable intent responsibility boundary

[Current intent-layer report](VERIFIABLE_INTENT_EXECUTION_20261027.md) records the
application-owned approval policy extraction, generic wallet authority, fresh
read-only chain checks and capability matrix. It also identifies composition's
remaining legacy SDK/native profile and u32 slot-count restrictions. Current-chain
financial activation and complete two-pool recovery remain unaccepted.

The subsequent layout-capacity fix closes composition's client u32 count
restriction with the frozen SDK's exact packed-word bound and 89 model
regressions. Its legacy SDK/domain/native-method migration remains open; no
current-chain composition, wallet financial or performance acceptance is implied.
See the follow-up in the current intent-layer report.

## 28 October: reset-chain bootstrap and first-session boundary

[Current bootstrap report](AMM_RESET_BOOTSTRAP_20261028.md) records one new
registration matched to URT membership and indexed receipt, an independently
bound checkpoint audit, and one exact faucet request stopped after a service
UPS-start proving error. There is no confirmed grant, deployment, market fill or
ordinary claim. The first-session native/WASM verifier variant remains a separate
code/UPS gate; initialized-user synthetic evidence does not close it. Raw remote
proof-wire diagnostics and all secret files are excluded from published evidence.

## 28 October: first-session native and WASM verification

[First-session report](FIRST_SESSION_WALLET_VERIFICATION_20261028.md) closes the
pinned registration-start and distinct stored/session signature-preimage gaps.
The exact saved claim/burn proof passes corrected native replay and actual WASM;
old initialized-user proof/pack replay also passes. Failed fixture/verifier/tool
runs remain failed in the archive. No proof or financial operation is regenerated
to obtain these replay results. Fresh first-session transport, installed wallet
release, extension approval and live financial acceptance remain open. The original
faucet request is unresolved, and the existing financial stop is unchanged.
