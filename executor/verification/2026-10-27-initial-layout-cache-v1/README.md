# Optional immutable initial-layout resource reuse

**An offline preparation bottleneck was reduced for a second deployer. This is
not a full UPS, deployment acceptance, market settlement or network TPS result.**
The opt-in candidate increased measured RSS and is not enabled by default.
No base market economics, contract bytecode, SD-key authorization, Node source,
SDK dependency, financial request or old deployment was changed.

## Implementation and safety scope

`amm/u124/vm-tests/src/layout_preflight.rs` previously keyed immutable code and
function-whitelist construction by deployer. Identical artifacts with different
owners reconstructed the same resources. The candidate profile
`PSY_INITIAL_CODE_CACHE=artifact-template-v1` caches a zero-owner immutable
template and binds the actual deployer on every returned request, including hits.
The default `owner-v1` retains the prior owner-keyed behavior. Unknown profiles
are rejected. Keys include profile, compiled network magic, resource owner,
height and exact circuit definitions. The existing eight-entry bound remains.

The cache is process-local under one compiled dependency/configuration identity.
It persists no transaction state, witness, nonce, signing context or old UPS.
Concurrent cache misses are not single-flighted; this experiment does not prove
cross-machine coordination or four-market cache acceptance. No disk resource
cache was added. Existing canonical ABI, deployer, code/whitelist, proof and all
layout endpoint/count validations remain mandatory. A static initial-layout
proof cannot substitute for a transaction-state proof.

## Measured comparison

Same machine, selected frozen SDK/configuration/Cargo.lock, optimized binaries,
two Rayon threads, real U124 FT compilation artifact and two public deployer
hashes. There was one sequential two-owner process per variant. No build or
browser QA overlapped the timed child processes. Host load and ordering effects
were uncontrolled; one sample does not establish a reliable overall speedup.
The first candidate attempt is preserved separately; the table uses the final
opt-in candidate, not the earlier attempt.

| Measurement | Baseline owner-v1 | Final opt-in candidate |
| --- | ---: | ---: |
| First owner preparation, new process | 118.987 s | 116.207 s |
| First owner complete canonical proof verification | 26.039 s | 25.727 s |
| First owner whole case, including rejection checks/persistence | 145.073 s | 141.981 s |
| Second owner preparation, same process | 22.565 s | 0.013 s |
| Second owner proof verification | 0.013 s | 0.011 s |
| Second owner whole case | 22.633 s | 0.074 s |
| Child process wall duration | 168.201 s | 142.559 s |
| OS maximum RSS, bytes | 2,721,693,696 | 3,430,858,752 |
| OS peak physical footprint, bytes | 4,736,201,344 | 4,749,259,200 |

Process wall time includes harness/test/process overhead; stage times must not
be added to it. SDK/application compilation is outside these child timings.
`/usr/bin/time -l` covers the measured child lifecycle. Maximum RSS is an OS
resident-set metric, distinct from peak physical footprint and from sampled
RSS; it is not a measurement of the whole machine or gateway/browser memory.
The native calls for the unchanged canonical-layout proof manager are visible
in the full logs, including recursive layout construction/proving. No complete
UPS recursion/endcap, submit/confirmation or ordinary claim timing was measured.
There were zero fills, retries of financial requests, fees or asset movements.

The second-owner preparation result supports reuse of this immutable resource
under these conditions. Cold preparation changed little and maximum RSS rose
about 26%; peak physical footprint also rose slightly. Consequently the original
profile stays default. **No memory reduction, end-to-end settlement acceleration,
four-market throughput or production conclusion is supported.**

## Verification and retained attempts

Each measured variant prepared two complete canonical initial-layout requests
from the real artifact, verified their full proofs and rejected changes to:
expected owner, request owner, code, field count, layout root and proof bytes.
Code/layout/owner endpoints agree between variants. Proof byte strings need not
be identical; both complete requests verify. A later final-source test reverified
the two preserved baseline requests under both profiles (four complete checks),
rejected the wrong owner and rejected an unknown cache profile. It generated no
new proof and was not included in the performance comparison.

The artifact SHA256 is
`476bc76fcd4b512f585cb1093de41611455cd58df323b8ea4bcc4f71a4163b0f`.
`MANIFEST.json` binds the original/public compressed bytes and preserves baseline,
initial candidate, final opt-in candidate, build/run logs, request JSONs, source
snapshots and binary hashes. `FINAL-SOURCE-CLOSURE-v1.json` rechecks all 1,466 SDK
files and records the precise application inputs for each retained binary.
The baseline snapshot has the measurement test with the original cache;
candidate-v2 adds the explicit opt-in/default policy. The later preserved-proof
snapshot adds only its independent verification test. Original runs and evidence
were not replaced or silently retimed.

## Reproduction

Restore the selected source snapshot and real artifact from the gzip allowlist
into a new directory. Rebind Cargo paths only to the same verified SDK, retain
the archived Cargo.lock/configuration and `PSY_NETWORK=localhost`, and use
`nightly-2025-09-20`. The library-only build avoids unrelated bins; it does not
skip the canonical layout proof. The checked-in ignored tests are deliberate
bounded, resource-heavy experiments, not default fast unit tests.

```sh
RAYON_NUM_THREADS=2 PSY_INITIAL_CODE_CACHE=owner-v1 \
  LAYOUT_REUSE_ARTIFACT=/absolute/artifact/compilation_artifact.json \
  LAYOUT_REUSE_OUT=/absolute/fresh/baseline \
  cargo +nightly-2025-09-20 test --release --locked --lib \
  layout_preflight::reuse_measurement::two_deployer_initial_layout_requests \
  -- --exact --ignored --nocapture --test-threads=1

RAYON_NUM_THREADS=2 PSY_INITIAL_CODE_CACHE=artifact-template-v1 \
  LAYOUT_REUSE_ARTIFACT=/absolute/artifact/compilation_artifact.json \
  LAYOUT_REUSE_OUT=/absolute/fresh/candidate \
  cargo +nightly-2025-09-20 test --release --locked --lib \
  layout_preflight::reuse_measurement::two_deployer_initial_layout_requests \
  -- --exact --ignored --nocapture --test-threads=1
```

For a comparable child-lifecycle timing, compile first and run the retained test
binary directly under `/usr/bin/time -l`, with the same arguments/environment,
one process at a time and a 15-minute limit. Include every result and failure.
Use `layout_preflight::preserved_reuse::complete_requests_remain_owner_bound_in_both_profiles`
with `LAYOUT_PRESERVED_INPUT` set to the extracted baseline requests and
`LAYOUT_PRESERVED_REPORT` to a fresh path for the additional verification test.
Never overwrite historical output directories.

## Open gates

The [fresh-chain preflight](../2026-10-27-new-chain-preflight-ui-v1/README.md) rejects
the current native schema/automatic fee-burn ABI with the unchanged SDK.
New-chain deployment, complete fresh UPS/key acceptance, browser wallet writes,
live four-market/double-pool fills and cold/warm end-to-end performance remain
open. This optional deployment resource change does not close those dependencies.
