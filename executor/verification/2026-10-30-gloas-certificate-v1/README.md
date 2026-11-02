# Actual Gloas certificates and conditional native verification

This archive verifies real public certificate **relations to an unreviewed
bootstrap**, not canonical finality or market payment acceptance. A coherent
same-provider bootstrap/signature can be circular evidence. Every authority
flag remains false. No private key, secret signing witness, wallet recovery
file, executable, new dependency or unknown quarantine body is published.

[Full review](../../../docs/security/GLOAS_CERTIFICATE_CONTINUATION_20261030.md)
and [exact upstream handoff](../../../docs/security/UPSTREAM_CHECKPOINT_RANDOMNESS_HANDOFF_20261030.json).

## Verified and missing

Actual committee membership, aggregate-key correspondence, 512-of-512 BLS
signature, finalized-root branch and Gloas execution-parent branches pass.
The native inspector rejects 21 modified certificates/policies. Three native
unit tests and three focused Executor tests pass. Actual owned-native report
binding and fresh-process reuse pass. An older, separately valid L1 packet is
rejected because its execution hash differs from the certificate.

No independent bootstrap anchor was approved. No positive certificate-plus-L1
state composition was tested: both exact-hash EIP-1186 queries hit the provider
proof window. No running kind-32 CST bundle was obtained. The public contracts
manifest has a different StateManager identity and was not adopted. No new
CFC/signature/Endcap UPS, native-wallet claim or live trade was performed. The
native BLS checks are not constraints in a spending circuit. No signature or
bitmap was used as a random seed, and no seed-release certificate was supplied.

`manifest.json` indexes 180 gzip members and exact original/compressed SHA256s,
totalling 778,001 compressed bytes. It includes exact public bootstrap/update
bytes, policy, successful/failed requests, all negative cases and reports,
owned-output receipts, frozen application/build identities and final sources.
The raw previous-period update is not published or represented as verified;
its acquisition metadata alone is included. Unknown raw reference bodies remain
in private quarantine. Original proof/request evidence is unchanged.

## Offline reproduction

Use the unchanged frozen SDK source workflow and prepare a fresh application
snapshot with `batching/dependencies/prepare_mainnet_beta_application.py`.
Retain SDK `c92880c8b6e2c8d392f19368bc8801a2584fd427`, existing Cargo.lock,
toolchain `nightly-2025-09-20`, the recorded Go setup, `PSY_NETWORK=testnet`,
`PSY_MARKET_TESTNET_PROFILE=mainnet-beta-20261027-v1`, frozen
`PSY_CONFIG_PATH`, `CARGO_BUILD_JOBS=2` and `RAYON_NUM_THREADS=2`.

```sh
python3 executor/acceptance/buildL1ProofInspector.py \
  --profile gloas-certificate-v1 --manifest "$FRESH/application/Cargo.toml" \
  --target "$SDK/target" --out "$FRESH/inspector"
"$FRESH/inspector/gloas-certificate-inspector-tests" --nocapture
node --test executor/consensusEvidence.test.mjs executor/l1Evidence.test.mjs
```

The recorded same-machine build reused an exact earlier Cargo artifact stream
with its reviewed SHA256. On a new machine, generate the stream with the command
above; do not reuse another machine's rlib paths or treat its binary hash as an
universal reproducibility guarantee. Libraries are selected from the locked
release-target compiler records, with fixed version and file-hash checks.
No manifest or dependency version change is needed.

Unpack `files/public/inspection-policy.json.gz`, `bootstrap.json.gz` and
`finality-update.json.gz` into a fresh directory, verify manifest hashes, and
pass the policy's SHA256 with the exact input files:

```text
gloas-certificate-inspector POLICY REVIEWED_POLICY_SHA256 BOOTSTRAP UPDATE FRESH_REPORT
```

The formal operator-only route is:

```text
node executor/consensusEvidence.mjs POLICY REVIEWED_POLICY_SHA256 BOOTSTRAP UPDATE NATIVE_DRIVER REVIEWED_DRIVER_SHA256 RUNTIME_DIRECTORY FRESH_REPORT
```

The report must equal owned native output and match all captured-byte digests.
Changing a report to say `canonicalFinalityVerified: true` rejects. Changing the
unreviewed policy to `anchorReviewed: true` also rejects; that bit is not an
approval mechanism. Different forks/committee periods require a separate reviewed
implementation rather than an automatic fallback.

The case-local mutation harness preserves all 21 rejection inputs, errors and
reports. Do not replay archived network acquisition scripts for offline
reproduction. Failed TLS/HTTP/bootstrap/tree lookups are retained. Source/public
reference hashes and missing material are separated from authenticated results.
Build/native timings are not market confirmation, arrival, TPS, physical-peak
memory or production measurements.
