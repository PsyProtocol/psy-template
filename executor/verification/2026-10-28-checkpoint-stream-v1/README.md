# Conditional checkpoint-stream evidence

Start with [SUMMARY.json](SUMMARY.json), [index.json](index.json) and the
[implementation/boundary report](../../../docs/security/CHECKPOINT_STREAM_20261028.md).
The financial settlement cursor is **zero**. This archive does not establish
complete block coverage, market/SD-key integration, a complete UPS, network
settlement or ordinary-wallet claims.

## What the archive demonstrates

- One nine-member finite manifest, one source/seed and three complete global
  ordering proof pages, including a single-member tail.
- Source membership, cross-page used-index checks, ordered-tree append,
  previous-key ordering and exact endpoint continuity, with full-bundle completion.
- Actual native component preparation/proving/verifying from the Executor module;
  reuse of two existing proofs and one missing-tail construction, followed by
  restart reuse and same-machine contention without another proof construction.
- Exact binary/input/preparation digest checks, a persistent native owner,
  bounded decoding and rejection of an extra trailing proof byte.
- Permanent rejection of whole-block and financial stream authorization,
  including caller-provided success claims.

The input identities, checkpoint commitments, source, seed and terms hashes are
synthetic. A proof binds those supplied values; it does not authenticate them to
the real chain or prove that the manifest includes all block orders. An explicit
test preserves this boundary: a subset with a different root is another valid
finite manifest. Existing v4 market keys cannot execute these pages as an
independent-batch substitute for global sequencing.

## Integrity and privacy

Each indexed `files/...gz` is one immutable artifact. The index records original,
public and compressed digests plus path-redaction status. Only machine-local
paths in text were redacted. Component proof bytes and public manifest/page
contents are unchanged. Use fresh unpacking paths and never overwrite originals.
The files contain order commitments, public Merkle openings and component
proofs, not a private key, mnemonic, financial signing witness or recovery wallet.
Binaries are identified by digest and are not uploaded.

`component-proofs/` contains the original three proofs and attack report.
`native-integration-v1/` preserves the actual missing-tail construction and
restart verification; `native-integration-v2/` preserves final zero-new-proof
reuse, two local contenders and strict-decoding attacks. Invalid trailing-byte
proof copies are deliberately retained under `trailing-proof/`.
Runtime component journal records are public here; copied executable caches are
excluded. `run/public/` holds all budgets, logs, sampling and the failed launch
that guessed the wrong test executable name before starting a process.

Application snapshots v2, v4 and v5 used the exact same indexed circuit source.
The original positive proof harness ran in v2; the native CLI fixes ran in v4;
the final host suite in v5 adds a coverage-boundary test. They are not presented
as a single binary or repeated positive-proof acceptance. Native integration v1
generated the fourth successful proof construction under the recorded supplement;
there are only three distinct page statements. Final checks reused saved proofs.

## Reproduction

Materialize the frozen mainnet-beta dependency manifest and create a fresh
application snapshot with
`batching/dependencies/prepare_mainnet_beta_application.py --test-only`.
Use nightly-2025-09-20, release, `--offline --locked`, two Cargo jobs and two Rayon
threads. Set `PSY_NETWORK=testnet`, the frozen SDK Genesis `PSY_CONFIG_PATH`, and
`PSY_MARKET_TESTNET_PROFILE=mainnet-beta-20261027-v1`. Network magic is
`1384803358401154921`. No Node/SDK patch is needed for this conditional component.

For the native tool, add the explicit binary target
`src/bin/checkpoint_stream.rs` in the fresh snapshot; automatic binary targets
remain disabled. Build that binary and the `checkpoint_stream` test target.

Run the host suite with:

```text
cargo +nightly-2025-09-20 test --release --offline --locked --manifest-path FRESH_SNAPSHOT/Cargo.toml --test checkpoint_stream -- --nocapture
```

To construct three fresh conditional proofs, set a new, nonexistent
`CHECKPOINT_STREAM_OUT`, then run the ignored test:

```text
cargo +nightly-2025-09-20 test --release --offline --locked --manifest-path FRESH_SNAPSHOT/Cargo.toml --test checkpoint_stream nine_orders_three_complete_pages_and_attacks -- --ignored --nocapture --test-threads=1
```

The recorded proof process allowed 290 seconds and 8 GiB sampled family RSS;
it completed in 2.077 seconds. It is a tiny order component, not a complete
market proof or a transaction-throughput benchmark.

Native commands are:

```text
checkpoint_stream prepare MANIFEST_INPUT FRESH_PREPARED_DIR
checkpoint_stream prove PREPARED_DIR PROOF_DIR
checkpoint_stream verify PROOF_DIR FRESH_REPORT
```

The prove action verifies exact existing files and generates only missing pages.
An interrupted native owner file blocks another run and requires inspection;
do not delete another process's owner or reset history to force progress.
Never submit the component files as financial network requests.

The actual Executor integration test uses `CHECKPOINT_STREAM_DRIVER`,
`CHECKPOINT_STREAM_PROOFS` and a fresh `CHECKPOINT_STREAM_INTEGRATION_OUT`:

```text
node --test executor/checkpointStream.test.mjs
```

Without `CHECKPOINT_STREAM_REUSE_ONLY=1`, it constructs one missing tail while
reusing the first two fixture proofs; budget that construction explicitly.
With the variable set, it reuses all original pages and generates no new proofs.
The final recorded run used reuse-only mode. Every native cryptographic check
still runs. This is same-machine component coordination, not cross-machine or
financial/account recovery acceptance.

## Remaining gates

Source scope needs a decision: final current-order state versus all intermediate
order/change/cancel events. The former needs a complete authenticated state
traversal/classifier, still application-owned work. The latter additionally
needs a complete source transcript/commitment and reviewed coverage verifier.
No missing capability is supplied by an RPC scan or a boolean success report.

Market contracts and SD-keys must bind global ordered root/seed/cursor to actual
calls, quantities, pricing, fees and refunds in each complete UPS. That integration,
ordinary-wallet acceptance and fresh live deployment are **not implemented or
accepted in this archive**. The existing deterministic/shared-vault business
semantics remain unchanged. No speedup, chain TPS or production claim is made.
