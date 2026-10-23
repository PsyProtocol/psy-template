# Source closure and exact-request recovery checkpoint (2026-10-23)

This archive preserves 465 public files, with original and gzip SHA256, from
`psy-market-recovery-20261023` on the same development machine. No wallet files,
private keys or executable binaries are included. Originals are not overwritten.

## Closed evidence

- 60 JS boundary/transport/recovery tests pass. Component compiler/inspector IO
  is stubbed in boundary tests; it is not a cryptographic or network claim.
- Actual frozen-SDK `artifact_identity` derives all six code/layout/function and
  size identities matching included QA FT 2483. Its compiler source/artifact
  provenance is retained separately in the original QA-A bootstrap.
- `verify_initial_request` independently verifies saved initial layout requests;
  actual wrong-owner, count and proof mutations reject (three negative cases).
- App-only offline `prepare_initial_request` and identity tools built with the
  same frozen SDK and Cargo.lock. Completed binaries were copied/sealed before
  their release hashes were recorded. Original binaries remain intact.
- Source/compiler/full integer IR/ABI/base SD-key closure is mandatory at formal
  financial adapter startup. This does not authenticate running node images or
  replace the user's approved registry/tool-release trust boundary.
- Ordinary copied inclusion reports preserve U124 integers losslessly. RPC IDs
  and checkpoints alone are converted to bounded JS numbers.

## Unknown initial deployments

The first case has been quarantined locally. Its exact QA-B hash remains
`601e19d3b5122ba6655368dfeee4e60abd97ce6b29e3c3eff7e67ad7cc93beda`.
No market orders, FT issuance or controller funding took place there. A 404 is
not a rejection, cancellation or assurance that the request can never execute.
Read-only reconciliation cannot activate a quarantined case.

The executed first-case direct submit is preserved in the earlier build-v8
source snapshot on the host: pretty wire, 60 s timeout. Current successor code
uses lossless compact wire and a 900 s timeout; this source change is not an
account of what the first case executed. A same-SDK ordinary app release v2
sampled before linker completion was explicitly WITHDRAWN and never used;
sealed completed release v3 is the reviewed ordinary executable.

An independent successor changes QA-B's canonical issuer (406720 rather than
1717440). Its unknown initial deployment is recorded in a later checkpoint,
not claimed included by this archive. No unknown request is resent automatically.
The original known QA-A 2483 is the only included composition asset at this
checkpoint. No new controller or market has received funds.

## Transport experiment

One coordinator read RPC per condition returned HTTP 200: 77 bytes / 1,141 ms;
10,818,090 bytes / 4,971 ms. Raw request, response and observations are retained.
These single observations do not support a generic payload-size failure theory,
prove deployment validation latency, or demonstrate financial TPS. They are not
a matched proof-performance comparison or a network identity attestation.

## Reproduce/check

Run with Node 24:

    node --test --test-concurrency=1 composition/*.test.mjs composition/acceptance/*.test.mjs batching/admission/ordinaryReport.test.mjs
    python3 executor/acceptance/verifyCompactArchive.py executor/verification/2026-10-23-composition-source-closure-v1

The source snapshot contains the exact application files and dependency-manifest
hash. Build logs/tool digests identify the completed offline binaries; binaries
are reproducible from the fixed SDK snapshot but are deliberately not shipped.
Actual financial route acceptance, matched cold/warm end-to-end measurements,
other three composition adapters, runtime/upgrade evidence, certified randomness
and cross-host duplicate-prover coordination remain open. No production finding
is inferred from the passing test count or this artifact-integrity check.
