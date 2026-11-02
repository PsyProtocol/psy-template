# Conditional minimum frontier promotion evidence

Read [SUMMARY.json](SUMMARY.json), [index.json](index.json),
[PUBLISHED-AUDIT.json](PUBLISHED-AUDIT.json) and the
[team report](../../../docs/security/RANDOM_PROMOTION_20261029.md).

This is a prerequisite for replacing v10's poisoned ordering-prefix primitive.
It does not deploy or enable a market, register a key, authorize a signature,
verify a seed/finality source, produce a financial UPS, submit a transaction or
establish ordinary-wallet arrival. Zero financial operations occurred.

## Results

Five eligible members from the prior public synthetic source produce five
canonical-source insertions and five authenticated minimum-head extractions.
Ten unique proofs verify. The final formatted source then rechecks those exact
proof bytes and complete public transitions, without generating replacements.
Both runs reject seven raw-circuit attacks: extra progress, seed substitution
after insertion, a valid non-head member, skipped successor, duplicate extraction,
extraction before source completion and a coherent skipped source minimum.
The last attack has a valid original membership opening and recomputed resulting
roots; actual minimum constraints, not a claimed host verdict, reject it.

The resulting queue equals the existing v10 full-hash permutation. Source/seed,
full canonical Goldilocks comparison, owner/nonce/index ties and full terms remain
bound. Complete linked-list construction plus exact head extraction permits
finite forward progress without a reset. Inter-proof continuity is separately
checked by exact public endpoints; this is not a recursive aggregate or an
installed contract/SD-key continuity proof.

The new application additionally verifies both original v10 key identities and
saved proofs, rejecting six coherently altered priority/signature contexts.
No CFC or Endcap is regenerated. These compatibility checks do not promote the
component to a replacement financial key.

Seven read-only RPC requests succeeded with matching checkpoint-1 roots and the
reviewed native identity. Head observations differ by one checkpoint in a
sequential capture. They are not a simultaneous snapshot, finality proof or
permission to deploy. Exact requests/responses and the no-write plan are retained.

## Reproduction

The frozen SDK is mainnet-beta `c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`. Use nightly-2025-09-20,
release/offline/locked, two Cargo/Rayon threads and the testnet profile.
All 2,756 source pins are rechecked by the fresh application materializer.

Unpack the indexed gzip files into fresh directories after checking compressed
and public hashes. Original hashes identify the unredacted local originals.
Replace only redacted `<case-root>`, `<application-root>`, `<evidence-root>` and
`<home>` machine paths in scripts/manifests. Do not overwrite source artifacts.
No compiled binary, wallet, private key, mnemonic or raw signing/CFC witness is
published. All proof files serialize public-input ZK proofs; transition files
contain explicit public member/Merkle data for a synthetic source.

The input fixture is the exact `native-planner-v1` directory in
[the prior public bundle](../2026-10-29-source-random-stream-v1/README.md).
Its review, source and referenced artifact original hashes are in SUMMARY.
Create a fresh `--test-only` application using
`batching/dependencies/prepare_mainnet_beta_application.py`; do not patch the SDK.

```text
cargo +nightly-2025-09-20 test --release --offline --locked
      --manifest-path FRESH_APPLICATION/Cargo.toml
      --test random_minimum --no-run --message-format=json

MINIMUM_FIXTURE=REVIEWED_PUBLIC_FIXTURE MINIMUM_OUT=FRESH_OUTPUT
TEST_BINARY canonical_source_insertion_and_minimum_extraction
            --ignored --nocapture --test-threads=1
```

For exact replay, add `MINIMUM_SAVED=ORIGINAL_COMPONENT_OUTPUT` with a different
fresh output. `proofsGenerated` must be zero. The archived plans cap ten accepted
new component proofs and 24 rejected attempts; actual negatives are fourteen
component and six compatibility attempts. The observer enforces time/RSS stops.
No offline test is a financial authorization.

Original full CFC/SD-key/Endcap acceptance of v10 remains in the prior bundle.
Replacement contract/key bindings, sponsor-approved aggregate fee admission,
actual full UPSs, current-instance funding/deadline fit, native broadcast and
real registration/trades/claims/recovery remain pending. The live write gate
must remain closed until these are checked. Component timing is not full UPS,
chain TPS, confirmation/claim latency or a market speedup comparison.
