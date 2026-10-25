# Fixed verifier and transport candidate: offline evidence

SDK remains the selected 2026-10-20 session-bound snapshot. All 1466 consumed source hashes match; the pre-existing user Node diff is unchanged. The immutable native source, Cargo manifest/lock, resolved dependency paths, release hashes and build logs are retained.

OFFLINE-VERIFIER-TIMINGS.json measures verification of the same two previously included actual ordinary/market UPSs, in fresh/cached/cached/fresh order. The median resource-plus-complete-verification cost is 3098.54 ms fresh, 3119.93 ms on the first cache access, and 3.545 ms warm (3 samples). Each full proof is verified anew. This is neither proof-generation nor network confirmation throughput.

Tests: 74 JS regressions, 3 additional fee-only shape/financial-codec tests; 3 native transport tests; 2 native fixed-resource tests; a preserved-real-proof regression with 8 positive verifications plus tampered proofs/metadata, wrong network after warmup, and unsupported mode rejection. The native wait budget is bounded (30/120 seconds), connection setup is capped at 10 seconds, redirects and automatic protocol retries are disabled. Physical connection reuse has not been measured. Current live matched-trade acceptance remains incomplete.

SUBMISSION-TIMEOUT-DIAGNOSIS.json proves one raw submission hit the old 30-second client limit by matching the exact suppressed public transport-error digest and the measured 30.0198-second phase. This does not prove receipt, final rejection or discard at the server.

Only a public fee-only nonce-retirement summary is included. Its signed request/proof and the unresolved original cancellation are NOT published: their nonce is still unresolved and recovery authorization is pending. The summary says prepared-only/broadcast=false; it is not an actual transaction or a completed refund.

`manifest.json` inventories exact originals and gzip SHA256. READABLE-COPIES.json maps readable files to the same bytes. Archive integrity, offline crypto checks and real network acceptance are separate evidence scopes.
