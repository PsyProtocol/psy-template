# Paired-market source coverage and continuous refund UPS evidence

This bundle contains **public offline synthetic fixtures and proofs**, not
network deployments, wallet recovery material or live financial requests.
See `SUMMARY.json`, `REVIEW.json` and
[the report](../../../docs/security/PAIR_SOURCE_STREAM_UPS_20261029.md).
Numeric contract/account IDs and the public all-one SD-key parameter are test
fixtures, not current testnet identities or a private wallet key.

The final profile is policy v7, `source-covered-pair-terminal-refund-v2`.
Trading and live authorization remain disabled. Complete source coverage and
cross-page refunds do not establish global whole-order price/time matching,
NFT buyer selection, finality, qualified randomness or inclusion-tip freshness.

`run/final-ups-v1/` is a **byte-exact derived union**: Orderbook from the retained
`full-ups-v9` continuation and NFT from standalone `full-ups-v10`.
`run/public/MERGE-PROVENANCE-v1.json` binds every copied file. Orderbook's first
seven exact proofs originated in `full-ups-v8`, were reverified under the same
fingerprint/history/state, then reused. Their original generation costs remain
recorded. This is not one uninterrupted cold/warm process or a speedup claim.

All earlier failed/non-final runs and identities remain separate. The early
NFT compiler role mismatch, wrong pre-deposit sequence, cancelled recovery gap,
unselected absent funding subtree, inactive historical height witness, and test
mint-ID correction are described in `run/public/FAILURES.json`. Pre-correction
keys and bookkeeping proofs do not validate a corrected refund key.

`run/pair-reuse-v1/` revalidates exact saved full proofs without proving fallback;
a changed global context must fail before VM execution. `run/pair-key-replay-v1/`
verifies exact final key proofs and rejects coherent alternative stacks and
signature preimages. `run/baseline-key-replay-v1/` checks existing AMM/Curve key
compatibility without regenerating their positive CFC/UPS proofs.

Ordinary recipient claims use actual claim bytecode in the VM. They do **not**
have ordinary-wallet signatures or network receipts. All final fixtures have
zero fills; these costs are not genuine trading throughput, confirmation or TPS.
The FT ledgers/Outboxes, actual NFT payloads, exact native recipient refunds and
proven per-request fees are checked within their documented scope.

Verify/decompress into a fresh directory:

```sh
python3 unpack.py /absolute/new/evidence-directory
```

The index binds original/public bytes, compressed bytes and sizes. Public logs
and manifests may have local paths redacted; original SHA256 values remain.
Requests and cryptographic proof bytes are preserved. Archive integrity and
`audit-pair-evidence.mjs` structural checks do not replace cryptographic
verification or authorize an Executor/wallet broadcast. Rebuild using the frozen
SDK/toolchain and explicit native test commands in the report.

Raw CFC/signing witnesses, real private keys, mnemonic phrases and wallet
restoration files are not included. Local CFC diagnostics are projected to
public definition/result fields only.
