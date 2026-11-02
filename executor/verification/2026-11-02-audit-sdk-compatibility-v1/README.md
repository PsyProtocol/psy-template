# Audit SDK compatibility evidence

[Review and limits](../../../docs/security/AUDIT_SDK_COMPATIBILITY_20261102.md).
Read-only SDK/source inspection and two fresh RPC observations; no SDK/Node
change, verifier installation, generated proof or financial operation.

Use `public/COMPARISON-v2.json` as the successful final comparison. Original v1
prefix-format failure and script are retained. `source/INPUTS-v1.json.gz` contains
exact fetched SDK/client source text, immutable refs/blob IDs and the missing/
corrected source-path lookup records. Its original/compressed digests are in
`source/INPUTS-ARCHIVE-v1.json`. Decompress only into a fresh directory.
The full original runtime circuit-registry response remains local and is bound
by `public/TRANSPORT-v1.json`; only its known public Endcap projection is published.

The v2 script compares all cap/digest bytes with the SDK-referenced Endcap and
cached circuit type 6. It independently recomputes the Poseidon fingerprint,
checks the existing frozen control and a changed digest, and recomputes 15 runtime
role fingerprints. The last check is not an audit-SDK comparison of all role keys,
whitelists or common data. No binary or complete proof is built or validated.

For offline reproduction, create a fresh directory with the archived input JSON,
public captured observations and existing frozen resource control, then run
`compare-audit-v2.mjs` with Node v24.22.1 and the already reviewed installed
`poseidon-goldilocks-lite` 0.2.3. Deliberately adjust the recorded absolute helper/
frozen-control paths to the matching local pinned copies. The script reads
inputs and writes new outputs with exclusive creation; it neither fetches nor
installs resources or sends transactions. Never replay live acquisition as part
of offline reproduction or replace an old request's dependency identity.

`manifest.json` hashes the complete public/source member list captured before
opening its output. No wallet, key, signing witness, credential or recovery file
is included.
