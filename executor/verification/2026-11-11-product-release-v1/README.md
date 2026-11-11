# Product review evidence — 11 November 2026

[Team report](../../../docs/security/PRODUCT_RELEASE_REVIEW_20261111.md) ·
[Public facts, exact source hashes and original artifact hashes](INDEX.json) ·
[All retained command and framing measurements](MEASUREMENTS.json)

The selected SDK/client and existing branches are unchanged. No financial
operation, replacement proof, account or live instance is created. Actual WASM
replays saved synthetic complete private/ordinary/first-session proofs. Fresh
read-only chain/Native/runtime-resource observations match the accepted capture.
The new explicitly selected browser profile is empty at observation; it is not
payment acceptance. The original browser renderer timeout was recovered in place.

Application cohort: 81 passed, no failures/skips. Final wallet cohort: 803 passed,
5 timeout failures, one existing skip; no timeout was increased or test removed.
The complete 4096-ticket/600-group recovery test remains an open release gate.
The initial staging build predates the final transport patch. Final build result
is recorded separately when complete, not inferred from that earlier success.

All slow samples and unsuccessful optimization attempts are retained externally.
The signature-cache attempt was reverted. Framing-only measurements do not prove
an end-to-end improvement. The host was heavily swapping with unrelated owner
workloads; those processes and wallets were not disturbed. RSS is sampled family
RSS, not unique physical peak memory. No chain TPS, p95, generalized speedup or
production claim follows from these results.

Raw logs, full proofs, verifier binaries and SDK copies remain in the named
external case. Git receives only this small summary and SHA256 inventory, never
keys, mnemonic phrases, receive randoms or signing witnesses.
