# Previous-checkpoint v4 acceptance evidence

Read [SUMMARY.json](SUMMARY.json), [index.json](index.json) and the
[security report](../../../docs/security/PREVIOUS_CHECKPOINT_EXECUTION_20261028.md).
This is producer-seeded AMM/Curve ordering, **not** a qualified unbiased beacon,
network deployment, confirmed trade or ordinary-wallet acceptance.

## Contents and integrity

Each indexed `files/...gz` expands to one original/public artifact. The index
records uncompressed, compressed and original digests, byte lengths and whether
machine-local paths were redacted. Unpack into fresh paths; never replace original
evidence. Proof/request bytes and candidate source/policy/artifacts are unchanged.
No private key, mnemonic, recovery wallet or signing/state-reader witness is
published. Public key inputs are an explicit field projection, not a signing
witness serialization. Native and test binaries are identified by digest, not
uploaded.

- `candidate/`: exact v4 source, compiled artifact, policy, config, token/NFT/native
  support and initial build report. The build report predates proof acceptance;
  `SUMMARY.json` records the completed offline result.
- `run/full-ups-v1/`: four complete synthetic requests, public key projections and
  per-market measurements. Recipient claim execution here is bytecode only.
- `run/public/`: all bounded run logs/RSS samples, native key/rank outputs,
  independent saved-request verification, old v3 rejection and retained failures.
- `run/application-v2/` and application manifests: exact build dependency/source
  bindings; no upstream patches. Local path redaction is recorded.
- `default-before-fix/`, `default-after-fix/`: profile-selector defect reproduction
  and correction. The fixed default's source, policy and compiled artifact match
  the preceding v3 milestone byte for byte; the digest comparison is retained.
- `dependencies/`: unchanged frozen SDK/cohort manifest.
- `reproduction/`: bounded process observer and native offline checks. These are
  reviewable procedures, not permission to send archived requests to a network.

The early native build with an incorrect manifest path and receipt-double test
failures are retained. Missing receipt fields were added to the test fixture;
the journal's receipt-identity checks were not relaxed.

## Reproduction

Materialize the frozen dependencies from the existing manifest. Use the checked
`batching/dependencies/prepare_mainnet_beta_application.py --test-only` script to
create a new application snapshot. Do not patch the SDK/Node or reuse a mutable
source checkout as a build identity. The snapshot disables automatic binaries;
add explicit binary targets for `src/bin/compact_market_wallet.rs` and
`src/bin/compile_checkpoint_processor.rs` in that new snapshot.

Use nightly-2025-09-20, release, `--locked --offline`, two Cargo jobs and two Rayon
threads. Set `PSY_NETWORK=testnet`, `PSY_CONFIG_PATH` to the frozen SDK Genesis
configuration and `PSY_MARKET_TESTNET_PROFILE=mainnet-beta-20261027-v1`.
Compiler network magic must equal `1384803358401154921`.

Build with the optional v4 selector:

```text
node batching/checkpoint-processor/build.mjs OWNED_COMPILER BASE_FIXTURES FRESH_OUT previous-checkpoint
```

The base fixture supplies the original policy configuration and support assets;
the compiler generates fresh v4 code/layout artifacts. Omitting the final argument
still produces v3. Existing ordinary generators are unchanged. Neither an old
sealed queue nor an old deployed contract acquires random semantics.

Set `BATCH_BUILD` to the new v4 fixture directory. Run the snapshot's
`batch_lifecycle` test binary with:

```text
processor_ --nocapture --test-threads=1
processor_key_stack_reproduction --ignored --nocapture --test-threads=1
```

The first command runs four bytecode tests and leaves explicitly ignored proof
tests unexecuted. The second independently verifies the constrained key and
rejects the old tag and changed signed checkpoint. Neither is a network test.

For four fresh complete proofs, set `BATCH_PROOF_PROFILE=compact-v1`, set a new,
nonexistent `BATCH_FULL_UPS_OUT`, unset `PROCESSOR_RESUME_COMMIT` and any trace-only
selector, then run:

```text
processor_complete_claims_first_ups --ignored --nocapture --test-threads=1
```

Use one execution owner and a declared bound. The recorded full run allowed
950 seconds, 8 GiB sampled family RSS and four UPSs, with zero RPC/financial
operations. It completed in 610.763 seconds. Its initial pools, roots, checkpoint
statistics and identities are synthetic, with fixed seeds for reproduction.
It proves actual bytecode and Endcap transitions, not consensus finality.

With `PREVIOUS_FIXTURES` set to v4 and `PROCESSOR_FIXTURES` set to the unchanged v3
fixture directory, the recorded final JavaScript set was:

```text
node --test executor/previousCheckpoint.test.mjs
            executor/previousCheckpointRoute.test.mjs
            executor/config.test.mjs executor/compactAdmission.test.mjs
            batching/checkpoint-processor/policy.test.mjs
            batching/checkpoint-processor/legacy.test.mjs
            batching/mainnet-beta/native.test.mjs
```

These 60 checks include existing four-market regressions and new AMM/Curve
coordination tests. The new formal-route tests use named driver/receipt doubles;
they prove journal/routing behavior, not cryptographic validity or network sends.

The native driver commands `identity POLICY` and
`producer-order POLICY INPUT FRESH_REPORT` perform no RPC. The latter matched
both complete settlement projections and canonical two/three-member padding.
`verify_saved_ups PUBLIC_REQUEST FRESH_REPORT` independently verified all four
saved proofs against pinned Endcap resources and checked endpoints/fees. The
original v3 native identity action continued to reject before key construction.

## Not yet accepted

The new native fixed-source RPC session, quote, preflight and exact broadcast
paths compile but have no actual-network acceptance in this archive. There is no
new deployment, registration, browser approval, ordinary-wallet claim UPS,
expiry/refund UPS or cross-machine test. Before promotion, run fresh chain/identity
and balance preflight on new instances within a separately recorded live budget.
Never broadcast these synthetic archived requests.

The source is influenced by the producer. No unbiased randomness, actual
pre-release sealing, trusted chain-instance/finality, global order completeness,
anti-censorship or forced execution claim is established. No matched cold/warm
or deterministic/random performance comparison was run. The ordinary qualified
random-source gate remains closed; v4 requires an explicit weaker-model
acknowledgement and a distinct constrained key.
