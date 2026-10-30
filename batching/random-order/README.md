# Conditional random-order components

The **qualified entropy gate remains closed**. Separate producer-seeded market
profiles and the delayed accepted-seal stream have synthetic complete UPS
evidence; their [current capabilities and limits](../../docs/security/ACCEPTED_SEAL_DELAYED_DRAW_20261030.md)
do not establish unbiased randomness, canonical finality or live settlement.
Default deterministic builders, policies and admission continue to reject random
parameters. A valid-looking certificate cannot activate the qualified gate.

The new [public checkpoint delivery interface](../../docs/security/CHECKPOINT_PUBLIC_DELIVERY_20261030.md)
exports fixed local resources and verifies supplied stored records through the
owned native verifier and Executor. Import success remains conditional proof
consistency; it cannot install a foreign key or authenticate seed-release timing.

## Modules and trust boundary

| Module | Executed capability | Does not establish |
| --- | --- | --- |
| `sourceGate.mjs` | Central deterministic-only gate for generation, policy and admission | Entropy, a live adapter or random execution |
| `statement.mjs` | Strict immutable candidate encoder; unverified three-proof envelope parser | On-chain sealing, certified source, finality, funds authorization |
| `amm/u124/vm-tests/src/random_order.rs` | Source-fixed native Poseidon frozen commitment and complete permutation circuit | Market CFC, SD-key, actual calls, token arithmetic, beacon or full UPS |
| `random_order_statement` | Read-only SDK hash/rank inspection | Proof verification or execution |
| `verify_random_order_component` | Exact saved component-proof verification against rebuilt fixed resources | Market payment, inclusion or ordinary-wallet claim |

There is no externally supplied verifier/callback, success flag or resource URL.
`authorizeRandomBatch` validates the envelope shape then throws
`RANDOM_SOURCE_UNAVAILABLE`. Existing queues, contracts and keys are not changed.

## Versioned candidate encoding

All numeric inputs are canonical decimal strings; all hashes are 64 lowercase
hex digits using the SDK QHashOut representation, with each limb below Goldilocks
`p = 0xffffffff00000001`. The decoder reverses display limbs into `[h0,h1,h2,h3]`.
AMM is market kind 1, Curve is 2. Book/NFT are rejected by this candidate format.
The source ID must identify the complete future source definition, including
source type/algorithm, verified keys and round/finality rules; no such qualified
registry is installed. An opaque ID alone is not source authentication.

The fixed 74-Felt layout is distinct from the old 74-witness market-key format;
it has no execution dispatch or conversion into a software-defined call:

| Indices | Field |
| --- | --- |
| 0–4 | Version 1, frozen SDK network magic, kind, market ID, vault ID |
| 5–13 | Epoch, cutoff, seal-inclusion deadline, draw checkpoint, fixed round, settlement deadline, recovery point, authorized fee cap, member count |
| 14–49 | Nine four-limb roots: source ID, chain genesis root, code, layout, function, key fingerprint, public key, queue and batch |
| 50–73 | Four rows: owner, full 62-bit nonce, four-limb complete order-terms hash |

`cutoff < sealBy < draw < settleUntil < recoveryAt`; active owners are unique,
ascending and different from the vault. There are 1–4 active rows and exact zero
padding. The queue/batch/order hashes must eventually be authenticated from the
new contract's sealed state. The encoder does not claim those user-supplied roots
are correct or included. Full U124 order amounts remain inside the authenticated
terms/batch commitments; this component never merges or compares amount limbs.

## Unique conditional permutation

Using the frozen SDK's Poseidon `hash_no_pad`:

```text
frozenRoot = H(0x50535946524f5a31 || all 74 fields)
key[i]     = H(0x5053594f52445231 || frozenRoot || seed[4] || row[i][6])
rank       = active row indices sorted by (key.h0,h1,h2,h3,owner,nonce)
```

Hash limbs are compared as canonical **unsigned** field values; array position 0
is compared first, independently of reversed hex display order. A 64-bit limb
split is constrained to at most `p-1`, preventing an alternate representation of
zero as `p`. All four hash limbs participate. Full-key ties use ascending owner,
then nonce; unique active owners make that order total. Inactive `rank[i] = i`.
The circuit constrains rank bounds, uniqueness, active membership and ascending
keys; every active member occurs exactly once. Public inputs are frozenRoot[4],
seed[4], count and rank[4].

These guarantees are conditional on the exact root and seed. A malicious producer
can still select a seed unless a separate qualified source constrains it. An
Executor can still fabricate a candidate set unless sealed-state inclusion is
proved. A component proof cannot authorize a trade or substitute for the full
ordered call-stack/session/sig_hash/fee/state checks of a new SD-key and UPS.

## Future wire envelope, always unverified

`validateBeaconEnvelope` requires the exact format
`psy-market-beacon-certificate-v1`, source ID, chain root, fixed round/draw,
claimed seal-inclusion checkpoint, seed and three bounded base64 blobs:
`beaconProof`, `sealInclusionProof`, `finalityProof`. The claimed seal checkpoint
must be after cutoff and no later than the precommitted seal deadline. Parsing
neither validates those bytes nor makes the claim true. The owned future adapter
must verify all three, bind the exact frozen root and one finalized history, and
prove the source was unpredictable at the actual seal-inclusion boundary.
Unknown fields and caller-supplied verification reports reject. There is no
fallback to local randomness, another checkpoint, another set or deterministic
settlement for a random-frozen batch.

## Reproduction

Use `batching/dependencies/prepare_mainnet_beta_application.py` with the frozen
source cohort, a fresh output and `--test-only`. The archived root target
projection adds only the two named read-only binaries; dependencies do not change.
Build/test with `nightly-2025-09-20`, `--release --locked --offline`, selected
testnet config, two Rayon threads and a fresh output:

- Integration test `full_statement_scopes_and_canonical_boundaries` in
  `--test random_order` checks host scope, bounds and padding.
- Ignored integration test `bounded_permutation_and_tie_proofs` requires
  `RANDOM_ORDER_COMPONENT_INPUT` from the JS encoder and fresh
  `RANDOM_ORDER_COMPONENT_OUT`; use `-- --exact --ignored --nocapture`.
- Library test `random_order::tests::host_ties_use_full_key_then_owner_then_nonce`
  checks host full-key/owner/nonce ordering.
- `random_order_statement PUBLIC_INPUT FRESH_REPORT` computes root, keys and rank.
- `verify_random_order_component PUBLIC_INPUT PRESERVED_PROOF FRESH_REPORT`
  re-verifies the exact saved proof, without signing or generating another proof.

The original permutation proof reports explicitly say `qualifiedSource: false`,
`sealInclusionVerified: false`, `fullUpsVerified: false`, `broadcast: false`.
The proof tests use fixed synthetic inputs, never a substitute live random source.

[Source assessment, results, costs and missing market integration](../../docs/security/VERIFIABLE_RANDOM_ORDERING_20261028.md).

[Conditional historical sealed-state inclusion](SEAL_INCLUSION.md) adds the
separate native/circuit relation needed to bind an actually included state to a
checkpoint root. It still requires independently authenticated finality, reviewed
slot semantics and the source's unpredictability boundary.
[Provider delivery requirements](PROVIDER_INTERFACE.md) define those remaining
interfaces; they are not existing methods or accepted adapters.

[Conditional recursive seal/order linkage](LINKED_PROOF.md) verifies the two
components under source-built constant child keys and binds the same frozen root
inside the circuit. It supplies neither qualified entropy nor canonical finality
and cannot enable random execution.

[Local candidate request recovery](REQUEST_RECOVERY.md) adds immutable request
pinning and projected unverified observations through the existing Executor
journal. Its operator interface never signs, submits, accepts entropy or refunds;
local persistence is not a chain seal or a financial terminal state.

[Checkpoint evidence inspection](CHECKPOINT_EVIDENCE.md) uses frozen owned proof
resources and preserves exact compatibility failures. The
[no-Node audit and U0–U3 delivery list](../../docs/security/NO_NODE_RANDOMNESS_FINALITY_20261028.md)
separate current RPC capabilities, proof validity, finalized history and qualified
causal entropy. No new source or finality adapter is enabled.

[Scoped version-2 seal/order binding](../../docs/security/SCOPED_RANDOM_SEAL_20261028.md)
adds complete-byte instance/source/finality/release identity claims and key epochs
to a new stored commitment and its permutation. It cannot reinterpret an old
seal or qualify those claims; deterministic generation and all authorization
gates stay unchanged. `scope.mjs` is a strict candidate encoder, not an enabled
Executor market profile or approved beacon adapter.
