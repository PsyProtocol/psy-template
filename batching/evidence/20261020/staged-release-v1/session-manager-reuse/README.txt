Application-only end-cap verification reuse

Old frozen clients remain at /tmp/psy-market-compatible-binaries-20261020-v1.
New frozen clients: /tmp/psy-market-session-reuse-binaries-20261020-v1.
build-manifest.json pins the exact source, SDK manifest, Cargo.lock and binaries.
No contract artifact, spending policy/fingerprint or Node source is changed.

The new path obtains verifier-only data from the existing session manager and
requires equality with the fixed reviewed Node verifier. It verifies the entire
proof with that verifier plus the fixed Node UserEndCap common data. It does
not trust a verifier/common-data object supplied in the request. The SDK trait
does not expose the common-data object: structural object comparison is not
reported as performed. Full proof verification uses the pinned common data.
Caller stack, session, fee, endpoint, nonce, window and dependency checks remain.

Offline regression: 8 preserved real ordinary/compact UPS requests verified;
mutated proof PI and metadata transaction count rejected for each; wrong-domain
proof and wrong manager key rejected. See stored-proof-regression.json.
The 47.68-second test includes circuit-manager construction and verification of
existing proofs. It is NOT new proof generation or a performance comparison.

Reproduce with the pinned SDK/toolchain/config and a fresh target/result path:
cargo +nightly-2025-09-20 test --offline --locked --release --test live_verifier --no-run
Run the emitted test binary with --ignored --nocapture --test-threads=1,
RAYON_NUM_THREADS=4, LIVE_VERIFIER_FIXTURES pointing at the public isolated
request tree, and LIVE_VERIFIER_RESULT pointing at a new JSON output.
Build network is localhost (explicit regtest domain); runtime endpoint profile
is staging-bundled-regtest-20261020-v1. See the pinned build manifest.

Real acceptance proceeds with the new clients. No cold/warm speedup percentage
is claimed from overlapped live jobs. The earlier sequential ABBA comparison
remains the controlled full-proof comparison for fixed40 versus compact calls.
