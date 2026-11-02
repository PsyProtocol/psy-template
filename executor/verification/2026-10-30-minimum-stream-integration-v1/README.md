# AMM/Curve minimum-frontier integration evidence

This is **offline synthetic acceptance**, not a deployment, network receipt,
ordinary-wallet signature/claim, qualified beacon, finality certificate or a
production release. No financial operation occurred. The actual Executor route
is prepare-only. Orderbook/NFT priority semantics are unchanged.

## Accepted results

- Frozen mainnet-beta SDK `c92880c8b6e2c8d392f19368bc8801a2584fd427`;
  all 2,756 source pins rechecked. No SDK/Node change.
- New v11 profile `source-covered-producer-minimum-stream-v1`.
- 40 complete-UPS attempts: two retained failures and **38 accepted** final
  proofs, 19 per market. Each market has five members, three synthetic fills,
  cancellation/slippage refunds, 4+1 build/pop/settlement and recovery forks.
- Exact common/verifier, key, ordered calls, session, sig_hash, endpoints and
  actual net-word fees checked. Asset/Native-fee conservation passed.
- Five grouped standalone page proofs are separate supporting evidence.
- Two final saved key proofs plus two legacy saved key proofs reverified without
  regenerating CFCs or Endcaps; six coherent legacy attacks rejected.
- Actual native planner pages/queue match accepted complete UPS plans. Ten
  native input substitutions rejected. Durable Executor replay and same-epoch
  reselection rejection exercised without signing/broadcasting.
- Sixteen selected JavaScript regressions passed, zero failures/skips.

The final full-UPS process took 3,336.860 seconds. One-second sampled process-family
RSS peaked at 1,977,552 KiB; shared pages are included, so this is not physical
peak. Normal ten-UPS acceptance intervals were 661.466 s AMM / 661.066 s Curve,
excluding resource builds 126.399 / 107.669 s. Curve is second in the same process
and may reuse global SDK caches; it is not an independent cold start. Normal
vault burns were 10.000137 / 10.000142 synthetic PSY, excluding ordinary owner,
claim, deployment and registration costs. Acceptance intervals include attack
probes. No matched speedup, confirmation, arrival, p95 or chain TPS is measured.

## Files and verification

`SUMMARY.json` states the measured scope and remaining gates. `index.json` maps
original source names to gzip files, original/public/compressed SHA256 and
redaction status. All gzip streams were round-trip checked before publication.
Machine paths are projected to `<case-root>`, `<application-root>`,
`<evidence-root>` and `<home>`; hashes distinguish redacted public copies from
unchanged originals. Restore these explicit path mappings when rerunning scripts.
No wallet state, private key, mnemonic or raw CFC/signing witness is included.
The `public-session.json` files are explicit public-field projections; proof
bytes are public. Snapshots retain earlier broken candidates as historical
failures, never final-key evidence.

To inspect without running anything:

```python
import gzip, hashlib, json
from pathlib import Path
root = Path("executor/verification/2026-10-30-minimum-stream-integration-v1")
for row in json.loads((root / "index.json").read_text()):
    compressed = (root / row["file"]).read_bytes()
    assert hashlib.sha256(compressed).hexdigest() == row["gzipSha256"]
    public = gzip.decompress(compressed)
    assert hashlib.sha256(public).hexdigest() == row["publicSha256"]
```

The recorded final `run.py` command and application-v13 sources reproduce the
bounded full-UPS run with the frozen SDK and fixtures-v3; application-v14 builds
the final native replay helpers and unchanged legacy test. Use fresh output
paths, two Cargo/Rayon threads, release/offline/locked and nightly-2025-09-20.
Do not rerun this as a network job or reuse synthetic identities on a real chain.
Saved-key replay defaults to existing proof bytes; generation requires an
explicit synthetic-only opt-in. `prepare_native_v1.py` reconstructs the SDK
synthetic checkpoint tree and first requires exact equality to the original
source path. `native_route_v1.mjs` exercises the default native Executor planner.
Neither authenticates a live finality/entropy trust anchor.

The JavaScript public evidence audit checks structural consistency and digests;
it is **not** an independent cryptographic verifier. Actual cryptographic
acceptance is recorded by the frozen native full-UPS verifier and saved-key
replay. The seven fresh read-only RPC observations are not financial approval,
finality or deployed-instance acceptance.

## Release gates

1. Empty-vault registration, initial fee grant and activation/bootstrap need
   complete UPS acceptance with actual fresh-instance identities.
2. Owned live signing, exact-once broadcast and original-request reconciliation
   are not implemented by the public preparation route.
3. Real whole-source deadline, lifetime-cap remainder and funding fit must pass;
   the owner may need to replenish fees. Lifetime cap alone does not guarantee
   service or an owner-independent refund path.
4. New-instance resources and ordinary-wallet signatures/claims remain untested.
5. Native checkpoint seed is producer-controlled. Future index membership does
   not establish low bias, unpredictability, finality or that the seal was
   accepted before the seed became available. Tip foreign-state freshness and
   the historical 6085/6086 verifier cohort issue remain separate boundaries.

See [the review report](../../../docs/security/MINIMUM_STREAM_INTEGRATION_20261030.md).
