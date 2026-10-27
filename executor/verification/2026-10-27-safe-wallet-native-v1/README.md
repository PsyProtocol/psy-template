# Ordinary-wallet preparation and native complete UPS review

This change closes offline ordinary-signature proof coverage and adds an
extension-internal prepare-only integration. **Browser financial writes are still
closed.** Neither test counts nor an independently valid endcap establish that an
arbitrary browser-approved call manifest is bound to that proof.

## Changes

- `market-client/wallet/prepareOnly.mjs` uses explicit UPS-start, signature, CFC
  and endcap jobs. It never calls auto-submitting trace-step/concurrent convenience
  methods. CFC jobs execute serially with bounded complete step identities.
- `capsule.mjs` checks exact caller, network, checkpoint range, starting leaf,
  next nonce, signing fingerprint, ordinary signature source, call order, method
  IDs, parameters, reviewed code/layout/function roots, full call count and actual
  burn fee before proving. Inline/deferred/external scope is rejected for these
  ordinary plans. Only public submit input/proof and a manifest are retained;
  hydrated traces and signing witnesses are not persisted or sent to the page.
- `staged.mjs` reserves an account/network/chain across origins before preparation.
  Same-background instances share the store mutex. Proof verification failure
  retains the precise capsule for verification without reproving. A durable
  broadcast intent precedes the only transport invocation. Unknown results never
  trigger another send, signature or replacement business operation. Reconciliation
  requires original identity, exact receipt and common nonce/endpoint evidence.
  Unbroadcast crash preparations can be explicitly cancelled. History is capped
  at eight entries by default; no automatic deletion or recovery overwrite.
- `prepareService.mjs` reconstructs plans against bundled ABIs/registry. A new
  trace requires a fresh observation. Immutable historical record reconstruction
  after a long proof is separate from the mandatory fresh native pre-broadcast
  gate. Its production native verifier/transport are explicitly unavailable;
  a prepared capsule remains `unverified`, and there is no web broadcast method.
- The existing wallet candidate branch vendors exactly these application modules
  with `SOURCE.json`. Its real core uses the ordinary wallet's existing trace/job
  APIs under the wallet FIFO and durable storage. Enqueue, execution, trace and
  preview paths check pending market reservations. Market preparation rejects
  unresolved legacy queue history, including failed/cancelled rows that do not
  prove rejection. The public build metadata states that web writes, SDK
  attestation and the native full-call verifier are unavailable.

The wallet integration covers the three reviewed ordinary market planners. The
AMM ordinary native proof fixture is also exercised; the AMM browser planner is
not silently reclassified as accepted by this three-market internal adapter.

## Evidence and limits

The final native runner uses the frozen session-bound application SDK manifest
`0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`,
unchanged Cargo.lock and compiler/network config. All 1,466 pinned SDK source
files were rechecked. No Node/SDK source or dependency selection changed.

Fresh fixtures use real compiled market, U124 FT, NFT and native bytecode with
synthetic authenticated checkpoints. Every ordinary UPS includes its standard
signature, complete CFC chain, automatic fee burn and endcap. The harness verifies
the full proof, compares ordinary-user state with independent VM execution, and
rejects mutations to nonce, signer, checkpoint, start/end roots, fees, call count
and proof. FT quantities exercise both nonzero limbs; NFT claims use the actual
next FIFO packet. Fixture setup, liquidity, seller deposits and claim Outboxes
are VM-only. These are **not** end-to-end market settlement, refunds, browser
approval, live network acceptance or cross-realm acceptance.

Saved public requests are additionally verified by the existing pinned native
endcap verifier/common data. That independent verifier checks the complete proof
and core endpoint/fee metadata. It does not separately attest an arbitrary
browser call list/session; the corresponding production gate remains closed.

`public/NATIVE-SOURCE-v1.json` binds the final runner/source snapshot. Earlier
incremental binaries were not separately retained; their logs and public request
bytes remain preserved. Final fund cases are rerun with the retained final runner
rather than presenting an earlier build as a byte-identical source closure.
`public/NATIVE-SUMMARY-v1.json` records final and previous attempts separately.

## Regression and dependency results

- Application client/gateway/staged/capsule checks: 68 passing tests.
- Wallet preparation/provenance/network and existing web-provider metadata checks:
  9 passing tests. This is not an installed-extension or WASM/native acceptance.
- Wallet baseline and candidate each have the same 10 normalized TypeScript
  errors: existing private FT code expects `verifyPrivateFtPacket` and private FT
  profile/packet types absent from the currently selected SDK declarations.
- Two pre-existing wallet queue suites cannot initialize because the packaged SDK
  imports a missing internal `dist/node_modules/.pnpm/doge-sdk/.../data.mjs` path.
  The unchanged baseline reproduces this. No compatibility casts, deleted safety
  checks, alternative SDK or fabricated passing build closes these failures.
- Configured realm0, realm1 and coordinator each returned HTTP 503 in a single
  bounded readonly probe. No retries, proof submission or financial request was
  sent. No heartbeat was recreated.

All intermediate failures are retained: missing explicit compiler config,
unrelated autobin compilation, incomplete ABI-only fixture restoration, NFT
reference traversal of an unseeded irrelevant FT, lockfile/tool invocation
failures, synthetic-test fixture corrections and dependency-blocked suites.
The NFT reference fix compares all ordinary-user slots present in the authenticated
fixture; it does not remove a proved contract or native verification check.

## Timing and memory interpretation

Each native market/action creates its proving resources anew. Row elapsed times
include fixture preparation, cold circuit construction, state seeding, complete
proving, verification and assertions. They are not isolated proof timings, warm
measurements, RPC latency, chain confirmation, wallet startup, live fees or TPS.
Process `/usr/bin/time -l` logs retain both maximum resident set size and peak
physical memory footprint; neither is a sampled browser RSS measurement. There
is no controlled before/after acceleration claim in this change.


| Market | Action | Complete fixture elapsed (s) | Calls including burn | Fixture burn (base units) |
| --- | --- | ---: | ---: | ---: |
| amm | fund | 124.469 | 4 | 1000008000 |
| orderbook | fund | 106.051 | 4 | 1000008000 |
| bondingcurve | fund | 119.024 | 4 | 1000009000 |
| nftmarket | fund | 126.566 | 5 | 1000008000 |
| amm | claim | 113.699 | 2 | 1000004000 |
| orderbook | claim | 93.429 | 2 | 1000004000 |
| bondingcurve | claim | 108.209 | 2 | 1000004000 |
| nftmarket | claim | 110.036 | 2 | 1000006000 |

Final claim run: maximum RSS 2,161,950,720 bytes; peak physical footprint 1,927,943,680 bytes. Final funding run: maximum RSS 2,233,483,264 bytes; peak physical footprint 1,978,128,000 bytes. Both are whole native process lifecycle measurements. Saved proofs are 130,328 bytes each before request JSON encoding. No network fees were paid.

## Remaining required interfaces and acceptance

1. A wallet-owned native adapter must independently bind the exact request and
   manifest digests to the complete proof, full calls/parameters/callers, signing
   fingerprint, session, sig_hash, endpoints and fees. It must report its fixed
   SDK/key identity. A page-supplied report or an endcap-only verifier is rejected.
2. Exact transport must freshly validate actual network/chain, code/layout/key,
   start leaf, nonce, expiry, balances and fees; submit the original request bytes
   once; reconcile by original identity and receipt/common state. No generic
   `psy_sendTransaction` fallback is allowed. Production adapters are not yet
   connected, even if RPC recovers.
3. Add explicit separate preparation/broadcast approval screens and trusted
   sender-origin routing. Internal extension methods are not web permissions.
   A build must attest the actually shipped SDK/WASM/circuit identities; the
   application manifest is only the required verifier pin, not wallet attestation.
4. Resolve the SDK's existing private-FT declaration and package-path mismatch in
   the separately authorized dependency/release task, without switching this
   task's selected SDK or weakening checks. Require baseline+candidate build and
   queue tests with the same pinned package before an extension release.
5. After the above and a fresh complete network preflight, run new isolated wallet
   browser approvals, actual orders, settlement, ordinary claims/refunds,
   restart/unknown-broadcast and stale-state recovery. Preserve exact public
   requests/receipts/fees and asset conservation. No current production claim.

## Candidate source links

- [Wallet candidate commit](https://github.com/PsyProtocol/psy-wallet/commit/fe05368)
- [Wallet integration and release boundary](https://github.com/PsyProtocol/psy-wallet/blob/wallet-security-20261016/docs/security/MARKET_PREPARATION_20261027.md)
- [Canonical preparation modules](../../../market-client/wallet/prepareService.mjs)
- [Ordinary native fixture](../../../amm/u124/vm-tests/tests/support/ordinary_wallet_full_ups.rs)

The wallet formatting-only commit hook initially reformatted unrelated working
files and generated vendor copies. Its changes were recorded, unrelated files
restored, canonical vendor bytes regenerated and checked, and a scoped follow-up
commit retained the exact hashes. No Node/SDK source or dependency change resulted.

## Reproduction

Use `executor/acceptance/ordinaryWalletOffline.py --sdk SDK --config CONFIG
--output FRESH_DIRECTORY` to verify pins and restore the archived public fixture
bundle without building or proving. Add `--run --mode fund` or `--run --mode claim`
for bounded offline native proving. Cargo uses `--offline --locked`; no RPC is
performed. A fresh crate snapshot disables unrelated autobin discovery and
rewrites only path dependencies to the same verified SDK. The repository and
original artifacts remain unchanged. The SDK snapshot and locked Cargo cache
must already exist; the script does not manufacture an upstream release.

`node market-client/wallet/vendor.mjs WALLET/src/market-preparation` reproduces the
application-only wallet module/registry bundle. It does not install or change the
wallet SDK. Runtime wallet dependencies still need their separate release fix.
