# NFT account bootstrap evidence

This directory contains a small hash index, not raw proof/binary payloads.
[The team report](../../../docs/security/NFT_ACCOUNT_BOOTSTRAP_20261104.md)
states the accepted synthetic scope and all live-release gaps.

Original recovery case: `$RECOVERY_ROOT/nft-deferred-bootstrap-20261104-v1`.
Its v20 failures, partial files, v21 main/alternative requests, ordinary-buyer
request, verifier reports, process RSS samples and exact source snapshots are
kept separately. A remote clone does not automatically contain those inputs.
No credential or signing witness belongs in this index or artifact distribution.

## Reproduction inputs

Use the selected dependency manifest in `batching/dependencies/selected.json`:
SDK `01b8f2b0a077367a7b9879baba1a72aea8ab5510`, client
`7058070057c3242b5d8b29e1a31d498aaa4202c0`, nightly-2025-09-20, testnet domain
1384803358401154921, two Rayon threads. Prepare a fresh application with
`batching/dependencies/prepare_selected_application.py`; never patch SDK/Node.
The reviewed original NFT source must compile byte-identically to the indexed
control artifact. All original Native/FT/NFT/market inputs must match the index.

Compile the new collection/key fixture using the explicit command in
`nft/ACCOUNT_INITIALIZATION.md`. Build `batch_lifecycle`,
`nft_deferred_bootstrap` and `funded_stream_wallet` from the frozen staged
application using `--offline --locked --release --features sdk-audit-v1`.
The integration-test build declares the funded binary explicitly while
`autobins=false`; the original source manifest and derived Cargo manifest are
separate files. Do not treat a mutable shared Cargo target as an archive.

Run the native policy/VM tests with the new fixture as `BATCH_BUILD`. For the
vault cohort set `BATCH_PROOF_PROFILE=compact-v1`, `FUNDED_PAIR_MARKETS=nftmarket`,
and `FUNDED_PAIR_OUT` to a fresh directory. Run exactly:

```text
batch_lifecycle \
  full_ups::stream_full_ups::funded_pair_full_ups::nft_account_bootstrap_trades_and_refunds \
  --exact --ignored --nocapture --test-threads=1
```

Remove `FUNDED_PAIR_VM_ONLY` and `FUNDED_PAIR_REPLAY` for that fresh proof case.
The separate ordinary test uses a fresh `ORDINARY_NFT_ACCOUNT_OUT` directory:

```text
batch_lifecycle \
  full_ups::ordinary_wallet::initialized_collection_first_buyer_complete_ups \
  --exact --ignored --nocapture --test-threads=1
```

The original declared budget is 16 complete UPSs, 7,200 aggregate proof-process
seconds, 12 GiB sampled family RSS and zero financial operations. Reproduction
requires its own predeclared budget and exclusive ownership; never accidentally
resume a live financial journal or overwrite this case.

For saved public consistency checks use
`audit-funded-pair.mjs ROOT --nft-account-v21`. For native Endcap/metadata checks
use `verify_saved_ups REQUEST FRESH_REPORT`; that tool alone does not validate
the user's approved stack or all state-delta cryptography. The formal driver
identity must reconstruct the indexed new key and preserve the old v19 key.

Host tests require explicit reviewed/candidate fixtures via
`NFT_BOOTSTRAP_REVIEWED_FIXTURES` and `NFT_BOOTSTRAP_CANDIDATE_FIXTURES`.
Saved-delta/row tests additionally require `NFT_BOOTSTRAP_AUDIT_STAGE` and
`FUNDED_PAIR_AUDIT_STAGE` pointing at the saved bootstrap directory. Legacy
client tests use the original reviewed fixture as `BATCH_BUILD`. A skipped
fixture test is not acceptance.
