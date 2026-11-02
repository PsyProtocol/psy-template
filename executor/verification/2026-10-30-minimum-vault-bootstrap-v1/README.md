# Fresh minimum-stream vault startup evidence

This bundle records **offline synthetic startup**, not deployment, ordinary actor
approval/claims, real settlement, chain finality or qualified randomness.
No financial write was made. Source/SDK/Node pins and existing contracts are
unchanged. The public UI remains gated.

## Accepted final key

Profile `source-covered-producer-minimum-bootstrap-v1` is a distinct v12 key over
unchanged v11 market bytecode. Final source is application-v9; application-v10
adds the VM rollback regression with byte-identical spending-circuit sources.

- Three complete UPSs pass the exact frozen Endcap verifier, full call stack,
  key/session/sig_hash, state and fee checks: AMM first use, Curve first use and
  Curve inventory initialization.
- First use proves the SDK registration start from stored zero GUSR; the virtual
  signature leaf is nonzero and distinct. Bootstrap ends at nonce one. Curve
  initialization links that endpoint to nonce two.
- Each bootstrap binds ten actual calls within 40 logical slots, preserving the
  original exact Native/FT seed equality checks. Activation occurs before the
  ordinary owner's treasury claim. FT seed refunds become Outboxes, not claimed
  ordinary-wallet balances.
- A coherent grant-only first-use attack, actual signature-domain/chain-anchor,
  dependency, nonce, stack and fee attacks reject. The key prevents public
  executors from consuming nonce zero through a grant-only preemption.
- VM tests separately verify post-activation nonce/cap/key rollback, excess
  Native/both FT seed rejection and replay. Excess rejection is not a completed
  preactivation refund path.
- Seven selected JavaScript regressions pass with no skips. Two legacy v10 key
  proofs and six coherent attacks replay without regeneration.

The three complete-UPS run took 498.384 s; one-second sampled process-family RSS
peaked at 2,215,744 KiB. Sampling includes shared pages and misses between-sample
peaks, so it is not physical peak. Acceptance intervals include attacks, Curve
is second in one process, and independent builds/read-only verification overlapped.
No matched speedup, steady throughput, network confirmation or ordinary arrival
measurement is claimed. Synthetic fees total 3.000038 PSY; actual fees are zero.

Ordinary actor approvals/funding in these fixtures are VM-only prerequisites.
AMM activation has no LP liquidity. V11's historical 38 complete UPSs are not
relabeled as v12 normal settlement acceptance.

## Current external observations

Seven readonly chain observations succeed with matching checkpoint-1/native
identities. At checkpoint 17738, 100 current faucet operator outboxes show no
payment to original recipient 223232. This is an unverified RPC observation,
not a finality/absence certificate or permission to resend the original request.
The original faucet request remains unresolved and its send lock is untouched.

New checkpoint proof bytes 17737/17738 still fail both frozen cached verification
paths at the polynomial identity check. No alternate key or configuration was
adopted. These results explain why live random admission remains closed, not why
Node must be changed. Compatible public proof/build-parameter evidence is needed.

## Reproduction and integrity

`SUMMARY.json` separates accepted, external and remaining application gates.
`index.json` maps each original relative name to its gzip copy, original/public/
compressed SHA256, redaction flag and byte size. Machine paths are projected to
`<case-root>`, `<application-root>`, `<evidence-root>` and `<home>`; originals were
not overwritten. No wallet state, private key, mnemonic or raw CFC/signing witness
is included. Public-session files are explicit public-field projections.

```python
import gzip, hashlib, json
from pathlib import Path
root = Path("executor/verification/2026-10-30-minimum-vault-bootstrap-v1")
for row in json.loads((root / "index.json").read_text()):
    compressed = (root / row["file"]).read_bytes()
    assert hashlib.sha256(compressed).hexdigest() == row["gzipSha256"]
    public = gzip.decompress(compressed)
    assert hashlib.sha256(public).hexdigest() == row["publicSha256"]
```

Restore explicit path mappings and materialize the frozen SDK using the owned
`batching/dependencies/prepare_mainnet_beta_application.py`. Build with
nightly-2025-09-20, release/offline/locked, two Cargo and Rayon threads, testnet
magic `1384803358401154921` and the explicit frozen config. The recorded command
runs exactly:

```
full_ups::stream_full_ups::minimum_bootstrap_full_ups::minimum_fresh_registration_activation_and_initialization
```

with `--ignored --exact --nocapture --test-threads=1`, `BATCH_BUILD=fixtures-v1`,
`BATCH_PROOF_PROFILE=compact-v1` and a fresh `MINIMUM_BOOTSTRAP_OUT`.
The standalone VM test is
`full_ups::stream_full_ups::minimum_bootstrap_full_ups::minimum_bootstrap_vm_rollback_and_exact_seed_checks`.
Do not reuse synthetic user/market IDs or requests on any network.

`audit_startup_v1.py` performs structural consistency checks on public data; it
is not an independent ZK verifier. Native verification is recorded separately.
Two failed trials and compile/test-scope mistakes remain retained. There were
five complete-UPS attempts against a declared limit of eight, three accepted.
Earlier trial fingerprints are not the final key. No automatic retry, old
request replacement, live deployment or UI enablement occurred.

See the [review report and exact release gates](../../../docs/security/MINIMUM_VAULT_BOOTSTRAP_20261030.md).
