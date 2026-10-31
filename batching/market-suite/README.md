# Four-market deterministic candidate suite

This is the shared **offline build and late-binding entry point** for the
existing AMM, Bonding Curve, Orderbook and NFT Market implementations. It does
not deploy, register a key, sign, broadcast, fund a vault or enable wallet/UI
writes. All generated readiness fields remain false until separate acceptance.

| Market | Existing implementation reused | Preserved behavior |
| --- | --- | --- |
| AMM | `checkpoint-stream/generate.mjs`, policy v5 | Shared reserves, existing constant-product quote/fees, deterministic source order, progressive state updates |
| Bonding Curve | `checkpoint-stream/generate.mjs`, policy v5 | Existing lot pricing, limits, reserve accounting, change/refunds and configured graduation recipient |
| Orderbook | `checkpoint-stream/pair-optimized-generate.mjs`, policy v9 | Whole-order matching, global price/time priority, complete triangular scan, certified invalid-winner refund and rescan |
| NFT Market | Same pair generator, policy v9 | Collection/token/metadata/nonce/price terms, per-listing buyer priority, one sale, loser/refund paths |

Source coverage, exact order commitments, cross-page cursors and terminal
refunds stay in the existing contracts and SD-key protocol. The builder does
not replace them with a host scan or lower these profiles to small independent
legacy batches. Deterministic AMM/Curve source processing has four-account
coverage pages; Book/NFT scanning has four comparisons per UPS and two-member
settlement pages. These are existing code bounds, not newly accepted live
capacity or a whole-market throughput claim. No qualified randomness is added.

## Build

Build `compile_stream_market`, `compile_pair_stream_market` and any required QA
asset compilers through `dependencies/prepare_mainnet_beta_application.py` with
the frozen mainnet-beta sources and Cargo lock. Record the sealed binaries'
SHA256 values. Both market compilers expose `network-magic` for explicit domain
checking. Imported policy modules do not execute their fixture CLI. `spec.json` supplies:

- `schema: 1`, the exact frozen `sdkCommit`, decimal-string `networkMagic`, a
  nonzero declared `chainRootAt1`, and `randomMode: false`.
- Exactly `compilers.stream` and `compilers.pair`, each with `path` and `sha256`.
- Exactly `artifacts.native`, `artifacts.tokenA`, `artifacts.tokenB`,
  `artifacts.nft`: paths to reviewed original compilation artifacts.
- `config`: the existing validated market configuration, including distinct
  `assetA`, `assetB`, `nftId`, a reviewed FT `tokenId` for NFT payment, `issuer`,
  graduation `target`, cap/liquidity/threshold and decimal-string U124 amounts.

```sh
node batching/market-suite/build.mjs compile --spec /reviewed/spec.json --out /fresh/candidates
node batching/market-suite/build.mjs bind --build /fresh/candidates --market-ids /reviewed/assigned-ids.json --out /fresh/policies
```

For a reviewed build, add `--build-sha256 HASH` to `bind`. The hash must come
from the reviewer, not from the executor presenting the artifacts. Binding
without this optional pin remains an offline inspection operation and records
`expectedBuildDigestMatched: false`. Even a matching pin grants no live rights.

The manifest requires the exact 21-file inventory, four market records and six
frozen input roles. Source/artifact records and copied dependency digests must
agree with that inventory. Missing entries, extra paths, failed-build markers
and contradictory readiness flags reject. The manifest and members are read
into one hash-checked byte snapshot; policy parsing and cache copies use those
same bytes rather than reopening paths after checking them. This is integrity
relative to the reviewed manifest, not proof of a trusted compilation or chain
deployment. Normal bytecode, key and full-UPS verification remains mandatory.

The ID file must contain exactly `amm`, `bondingcurve`, `orderbook`, `nftmarket`,
with four unique bounded IDs distinct from the dependency contracts. Those
numbers are inputs to policy generation, **not proof of deployment**.
`BOUND.json` records `marketAssignmentsVerified: false`. Actual receipts,
code/layout/function roots, key/registration, nonce, session/sig_hash, fees,
state endpoints and complete UPS still need their normal independent checks.

The builder checks dependency ABI/actual method identities and arities, FT
selector agreement, compiler pin/domain, all foreign state read dimensions
(Native 32, FT/market 31, NFT 30), source/config binding and file hashes. The
original bytecode bytes are copied without reserializing its integers through
JavaScript Number. Layout proofs and full UPS are deliberately not inferred
from an ABI, compiler report, audit count or host success flag.

All Native/FT/NFT actual function names and selectors must be unique. Every
FT/NFT actual function must have exactly one ABI entry with matching selector,
input count and output count. Native retains its explicit frozen code-definition
checks: its reviewed artifact has a layout-only ABI, not a method table.

## Optional exact artifact reuse

`compile` also accepts `--reuse-build DIR --reuse-sha256 HASH`. The digest must
come from the reviewed local build, never from a webpage or an untrusted
executor. Every prior member, SDK/client/backend, network/chain, compiler and
dependency digest must match. Only an **identical newly generated source** can
reuse the preserved immutable bytecode; changed source compiles normally. The
foreign-read audit runs again. Policies always rebuild for the new configuration
and assignments. No CFC/signature proof, key, witness, nonce, fee or state is
reused. Cache adoption and all outputs require fresh directories.

This is an optional compile optimization, not an end-to-end performance claim.
It does not remove any transaction validation or enable runtime authorization.

## Acceptance boundaries

The selected deterministic profiles retain their existing open fresh-vault
bootstrap, full current-instance UPS, source-window/fee budget and admission
precedence gates. The separately tested producer-random minimum/bootstrap
profiles are not silently substituted. A 32-checkpoint source window must be
shown to fit the actual occupied-account coverage and proving cost before live
use. A valid source proof covers its declared checkpoint/current-order scope;
it is not every historical order event or global censorship resistance.

A registered graduation recipient is not necessarily an initialized/funded
account or a newly proved signer. Verify its original identity, registration
membership, control and intended authorization before funding a live Curve.
The 31 October candidates bind the registered QA recipient 1639168 but still
use provisional asset/collection/market IDs. They are not deployment-ready.

Shared vault state updates remain ordered. Different vault UPSs are separate
atomic ranges; intermediate Outbox assets require a confirmed claim. This entry
point adds no invoke_sync, price-mechanism change, shard or cross-vault atomicity.

See [current code/evidence and remaining gates](../../docs/security/FOUR_MARKET_SUITE_20261031.md).
See also [adversarial review and preserved-bytecode reproduction](../../docs/security/FOUR_MARKET_ADVERSARIAL_20261031.md).
