# Public runtime resource acquisition — 30 October 2026

This archive is a read-only resource/finality investigation, **not a financial
Executor run**. The generic archive tool's scope label does not authorize a
transaction. No secret wallet material, signing witness, executable, unknown
quarantine body or trust-setup archive is published.

Results:

- Actual proof-proxy Endcap verifier equals the frozen SDK byte-for-byte and
  its advertised fingerprint recomputes. The explicit Endcap-only projection
  is public; its identities equal the original response comparison.
- L1 StateManager checkpoint 20724 and the coordinator historical root agree
  under frozen word packing at one fixed RPC-observed finalized block.
- Account/storage-proof retrieval at that fixed hash rejects with `-32602`,
  `distance to target block exceeds maximum proof window`. Header consensus,
  deployed-source identity and canonical finality remain unverified.
- The four archived failing CST captures also reject the single acquired fixed
  client-role key. This excludes one wrong-role hypothesis; it does not provide
  the actual running CST key/records or attribute the original failures.
- Two focused metadata tests pass. No new proof, live settlement or ordinary
  wallet claim was produced. Qualified entropy and causal seed release remain
  unverified; all financial authority remains false.

[Full review and external delivery requirements](../../../docs/security/RUNTIME_PUBLIC_RESOURCES_20261030.md)
and [current team entry](../../../docs/security/MARKET_DEEP_VALIDATION_20261027.md).

## Inventory and hashes

`manifest.json` indexes 54 immutable gzip members and exact original/compressed
SHA256s. `files/public/` contains transport observations, public projections,
native resource comparisons, exact wrong-role results, binary/source identities,
all supervised build/inspection/test logs and sampled process-family RSS. The
final application source snapshot and lockfile identities are included. Original
unknown responses remain private quarantine and are referenced by digest only.

The separately preserved [summary supplement](../2026-10-30-runtime-public-resources-summary-v1/manifest.json)
contains the final summary, reproduction ledger and packaging observation. A
local summary assertion initially counted a configuration HTTP transport as
JSON-RPC; no extra RPC was sent. The original core archive remains unchanged.
The corrected total is 10 logical RPC reads, 3 configuration reads and 2 GitHub
metadata fetches. Three native build/test commands and four native inspection
processes completed. The redundant GitHub fetch and failed EIP-1186 request are
retained rather than hidden.

## Offline reproduction

Use the repository's unchanged frozen dependency workflow, toolchain
`nightly-2025-09-20`, `--offline --locked --release`, `CARGO_BUILD_JOBS=2`,
`RAYON_NUM_THREADS=2`, `PSY_NETWORK=testnet`,
`PSY_MARKET_TESTNET_PROFILE=mainnet-beta-20261027-v1`, and the selected frozen
`psy-sdk/psy-genesis/config.json` as `PSY_CONFIG_PATH`. Prepare a fresh application
snapshot with `batching/dependencies/prepare_mainnet_beta_application.py`; never
build against a different local Node checkout or overwrite a prior snapshot.

Build `inspect_public_runtime_resources` and
`diagnose_checkpoint_as_client_endcap`. Run the library tests filtered to
`public_runtime_resources::tests`. Unpack only into a fresh evidence directory:

```sh
gzip -dc files/public/endcap-circuits-projection.json.gz > "$FRESH/circuits.json"
"$BIN/inspect_public_runtime_resources" "$FRESH/circuits.json" "$FRESH/compared.json"
```

For the narrow wrong-role check, unpack the existing original 18504/18505 proof
members from
`../2026-10-30-checkpoint-pair-resource-audit-v1/files/public/` and the 20171/20172
members from
`../2026-10-30-checkpoint-protocol-cause-review-v1/files/public/current-cohort/`.
Then run once per pair:

```sh
"$BIN/diagnose_checkpoint_as_client_endcap" "$FRESH/circuits.json" \
  "$FRESH/18504.bin" "$FRESH/18505.bin" "$FRESH/role-report.json"
```

An Endcap success would still not authenticate a checkpoint or approved market
call stack. No remote verifier is installed by either command. Do not replay the
network acquisition scripts as part of offline reproduction, or use them as
funding/retry instructions. Native timings here cover resource inspection only;
there is no matched market performance, confirmation or arrival measurement.
