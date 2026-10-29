# Complete-source global paired frontier and actual fill evidence

Public **offline synthetic** evidence for the distinct policy v8 profile
`source-covered-pair-global-frontier-v1`. It binds global frozen-source
Orderbook price/time and NFT buyer selection, cross-page state continuation,
actual match/sale calls and expiry refunds into SD-key and complete UPSs.
`trading_enabled` describes the offline candidate; `live_authorization` remains
false. Existing v7 refund keys, Node, SDK and old deployed contracts are unchanged.

See [the report](../../../docs/security/GLOBAL_PAIR_FRONTIER_20261029.md),
`SUMMARY.json` and `REVIEW.json`. Fixture IDs and public all-one key parameters
are synthetic test inputs, not current testnet identities or private wallet keys.

## Evidence map

- `run/fixtures-v3/`: final new source, compiler bytecode, ABI, roots, independent
  foreign-read audit and versioned policy. Earlier failed/non-final fixtures are
  separate and do not validate the final key.
- `run/components-v1/`: 14 conditional frontier component proofs and 12 rejected
  invalid witnesses, including near-U124-maximum values. These are not complete
  source discovery, authorization or transaction proofs.
- `run/full-ups-v1/`: 42 original SDK- and fixed-verifier-accepted full UPSs,
  21 per market. Each market has five members, two actual bytecode fills,
  ten scan pages, unmatched tail refund, sender-enrolled recovery, no-match
  carry and an unaccepted source-timeout fork.
- `run/reuse-v1/`: exact full-proof revalidation with proving fallback disabled.
  Expired-trade rejection and exact original NFT payload assertions run here.
- `run/legacy-pair-key-v1/` and `run/legacy-amm-curve-key-v1/`: saved legacy key
  proof revalidation and coherent alternative-stack rejections. No positive
  legacy CFC/UPS proofs are regenerated.
- `run/public/`: declared budget, identities, all sampled process-memory traces,
  compile/test logs, original-file hashes, exact-replay audit, independent
  priority-reference audit and retained preparation/audit failures.
- `run/builds/`: immutable application source snapshots, Cargo pins, dependency
  export manifests and original/replay binary SHA256 identities.

The original normal path has 18 phases per market. Additional proofs fork after
`trade-1` for no-match scan/carry and after `open` for source timeout; they must
not be represented as one linear account-state chain. The full process wall
time includes all forks and builds. Per-phase original measurements are retained
even when the precise proof is revalidated later.

Ordinary-recipient claims execute actual bytecode in VM only. They have no
ordinary-wallet signatures, network receipts, live confirmation or UI acceptance.
FT balances/Outboxes, exact native recipient refunds/per-UPS fees and NFT payloads
are checked within the scope stated in the report. No real assets or fees are
spent. Endcap acceptance is accompanied by actual key/call/session bindings;
a standalone structural audit is not a cryptographic verifier.

## Integrity and reproduction

Verify and decompress into a **fresh** directory:

```sh
python3 unpack.py /absolute/fresh/evidence-directory
```

The index records original/public/compressed SHA256, size and path redaction.
Duplicate public bytes share a compressed blob. Text paths may be redacted;
request and proof bytes remain exact. All 338 original full-run files are also
bound by `run/public/ORIGINAL-FULL-UPS-BEFORE-REPLAY.json` and the replay audit.
Do not overwrite local originals or pass these synthetic requests to an RPC.

The root `SUMMARY.json` and `REVIEW.json` are convenience copies of the indexed
versions under `run/public/`. `package_public.py` records the allowlist, and
`unpack.py` verifies every indexed compressed/public artifact. Follow the report
and original wrapper for frozen toolchain, thread count, network configuration
and native test commands. Structural checking is separately reproducible:

```sh
node batching/checkpoint-stream/audit-global-pair-evidence.mjs \
  /absolute/fresh/evidence-directory/run/full-ups-v1
```

No raw CFC/signing witness, real private key, mnemonic phrase or wallet recovery
file is included. The public key-proof and complete UPS bytes are proofs, not
secret signing witness material.

## Remaining limits

Priority covers the authenticated remaining order set frozen at C. It is not
proof of all market admissions, censorship resistance or fresh global reranking
after cancellation/funding changes. A later-invalidated source winner can stall
trading until canonical expiry refunds. Complete O(N²) scanning per fill can
exceed the practical C+32 window for large sets. Finality, qualified randomness,
inclusion-tip freshness and live financial Executor/wallet acceptance remain
open. Individual UPS atomicity does not make an epoch or multiple vaults atomic.
No speedup, reliable p95, TPS, cross-machine or production claim follows.
