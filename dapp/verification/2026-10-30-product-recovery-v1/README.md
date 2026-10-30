# Product recovery public evidence

This directory preserves the 30 October UI/recovery and read-only launcher
milestone. `MANIFEST.json` lists the original public artifacts and their exact
SHA256/size. `MANIFEST-supplement-v1.json` records the subsequent bounded runtime
check without changing the original inventory. This README is the index and is
not included in either inventory.

Read the [review report](../../../docs/security/PRODUCT_RECOVERY_INTEGRATION_20261030.md)
before interpreting results. No financial operation, proof generation,
deployment, real fill or ordinary-wallet claim occurred.

- `plan.json`: declared owner, baseline, zero financial/proof budget and stops.
- `checks*.json`, `*.log`: original/final application, gateway and build checks.
- `readiness-observation.json`: actual current-chain root/native mismatch.
- `browser-summary.json`, `orders-*.png`: desktop/mobile and closed wallet gate.
- `component-race-qa*.mjs`, `component-race-result*.json`: isolated-frame
  synthetic React tests. The v1 harness failure is retained; v2 passes. These are
  not extension payment acceptance or native complete proof tests.
- `duplicate-start.*`: actual second-launch rejection, listener owners unchanged.
- `early-failures.json`: other bounded tooling failures and their disposition.

Browser scripts have historical local paths/task-space identity. They are
capture evidence, not permission to take over another browser space. Reproduce
with a fresh dedicated session and a new evidence directory, preserving originals.

The real extension provider was not replaced, unlocked, reset or used for a
payment. Exact requests and wallet history were not exported. Publication uses
an explicit public-file scope; no secret witness, private key or mnemonic is
included. UI render results and fixture tests must not be reported as real
settlement, unbiased randomness, chain throughput or production completion.
