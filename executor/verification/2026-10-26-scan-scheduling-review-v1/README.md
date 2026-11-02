# Scan scheduling experiment and guarded warmup

Sixteen actual historical-RPC samples are preserved: ABBA then predeclared BAAB, two fixed checkpoints and fresh leaf caches, same model/dependency and four-RPC bound. All baseline/candidate eligibility/action hashes match. No financial operation, proof, fee, deployment or asset movement occurred.

| checkpoint | baseline median seconds | candidate median seconds |
| --- | ---: | ---: |
| 373744 | 21.142 | 10.355 |
| 374013 | 16.707 | 30.743 |

**Decision: revert the broad concurrency candidate.** The favorable first-hop result does not justify an overall acceleration claim when the second-hop result is worse. All samples and failed/retried reads remain; there was no favorable-subset filtering or unlimited rerunning. Original candidate source is frozen in the archive. Only limb-read failure draining is retained; new scans still read fresh state, with all task/fee/nonce/dependency checks unchanged.

An opt-in guarded `adapter.warm()` and `service.prewarmResources` were added; default is false. Warming builds fixed circuits only, checks current bindings before/after, and never quotes, proves or sends. Reconcile-only mode and unresolved original broadcasts skip warming. This feature has no claimed live-route speed or memory benefit yet. A first regression caught uninitialized-journal access and was fixed using the journal lock; failure logs are retained.

46 final related regressions pass. The first historical benchmark startup failed before any RPC because archived acceptance config paths used the original working directory; the read-only benchmark now records this explicit convention. Neither the formal CLI loader nor old artifacts were altered. The startup summary is explicitly a summary, not fabricated raw stderr.

[Decision](DECISION.json) · [Originals and source closures](manifest.json) · [Execution dependencies](../../../composition/EXECUTION_DEPENDENCIES.md). SDK and Node unchanged. These are read-only scan and local safety results, not full UPS or real-route performance acceptance.
