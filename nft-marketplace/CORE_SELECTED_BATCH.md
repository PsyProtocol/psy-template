# Selected-order NFT core candidates

`core-build.mjs` builds a **new** NFT marketplace candidate using the existing
`batching/v2/generate.mjs` source. It does not deploy, register a key, generate a
proof, scan all accounts or authorize a financial operation. Existing market
identities, artifacts and registered fingerprints are unchanged.

## Scope and initialization

The policy factory is:

```js
makeCoreNftPolicy(marketId, config, artifact, paymentToken, collection, chainRootAt1)
```

The artifact envelope includes `state_tree_height: 31` and `abi`; the asset
envelopes include `abi`. The collection must be the new, reviewed prepared-account
version: height 30, `account_version` at slot 603980958, and external zero-argument
`prepare_account` selector 1475740684. The existing collection source patch is
`nft/account-initialization.mjs`; it must be compiled and separately accepted
before supplying that collection artifact to this builder. An old collection
without this field and method is rejected.

Only the activation operation changes relative to the direct v2 policy. Its
collection acknowledgement becomes `prepare_account()`, and its mirrored branch
coverage changes with it. The operation remains nine logical slots, and the
policy remains version 2, 40 logical transaction slots and 74 witnesses. Native
claim/transfer/burn use the frozen release selectors. The compact SD-key must
validate and build these actual descriptors; an old registered acknowledgement
fingerprint cannot authorize the new preparation call. A new key is mandatory.

The market source retains its real NFT-holder activation payer requirement.
Preparation initializes an empty **vault** collection account; it does not mint
an NFT or remove the payer's eligibility condition. It does not remove the
one-unit payment round trip, fee funding, runtime account separation or original
activation checks.

Settlement, unique sale, selected-member buyer priority, complete processing of
a frozen selected batch and refunds use the unchanged market source and policy
operations. This is `explicit-selected-orders-v1`, with deterministic ordering.
It does not authenticate a market-wide order set, prove absence of omitted
orders, implement random ordering or assert global fairness.

## Fresh, reproducible build interface

```sh
node nft-marketplace/core-build.mjs REVIEWED_SPEC.json FRESH_OUTPUT
```

The exact schema-1 spec fields are `sdkCommit`, `clientCommit`, `chainRootAt1`,
`marketId`, `intendedVaultId`, `config`, `compiler`, `native`, `paymentToken` and
`collection`. Configuration is `{nftId, tokenId, networkMagic}` with optional
explicit deterministic `ordering`. Release commits come from the existing
`sdk-audit-20261102-v1` freeze. The network domain is `1384803358401154921`.
Every input record contains `path` and `sha256`; the compiler record also has
`api: "compile-pair-stream-market-v1"`. No arbitrary compiler arguments are
accepted.

The actual reviewed compiler is `compile_pair_stream_market`. Its domain probe
is `network-magic`; its NFT invocation has five arguments:

```text
SOURCE FRESH_COMPILED_OUTPUT PAYMENT_FT_ID COLLECTION_ID true
```

The builder checks `FOREIGN_READ_AUDIT.json`: Native height 32, U124 payment
height 31, collection height 30, exact asset IDs, positive audited read count,
all reads bound and zero financial operations. Compiler errors and failed
audit artifacts remain in their original fresh directory. Reusing an output
path is rejected. Dependency and compiled artifact bytes are preserved without
rewriting full-u64 bytecode constants through JavaScript numbers.

`intendedVaultId` records reviewed deployment intent, not a cryptographic vault
binding in this v2 policy. Account and contract IDs occupy separate namespaces;
numeric equality alone is not an identity conflict. Execution must verify the
actual registered account, key, market and asset identities, code/layout roots,
call stack, session/sig_hash, nonce, fees, starting/final state and time budget.

The manifest explicitly records `newKeyRequired: true`, `fullUpsVerified: false`,
`sdKeyProofVerified: false`, `liveAuthorization: false` and zero financial
operations. A successful host build cannot enable a live write route.

## Validation boundary

```sh
node --test nft-marketplace/core-build.test.mjs
```

These are host tests with historical ABI projections, synthetic IR envelopes
and an injected fake compiler. They test scope rejection, exact activation
substitution and coverage, wrong selectors/preparation, frozen inputs, compiler
API and domain, foreign-read audit, failed-output preservation and raw artifact
bytes. They are not compiler, VM, SD-key fingerprint, full UPS, receipt or live
wallet evidence.

Before a live route is accepted, the single authorized execution owner must
compile the actual new source and prepared collection, build/register its new
key, verify the actual complete UPSs, and exercise fresh vault registration,
authorization, activation, sale, competing buyers, refunds, timeout/restart,
fee recovery and ordinary-wallet claim on an isolated instance. Preserve all
failures and original evidence. Unknown broadcasts require exact-identity
reconciliation and cannot create a replacement payment.
