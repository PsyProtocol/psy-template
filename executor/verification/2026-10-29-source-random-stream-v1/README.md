# Complete-source producer random stream: public evidence

Read [SUMMARY.json](SUMMARY.json), [index.json](index.json),
[PUBLISHED-AUDIT.json](PUBLISHED-AUDIT.json) and the
[team report](../../../docs/security/SOURCE_RANDOM_STREAM_UPS_20261029.md).

Only `fixtures-v4`, application/bin v4 and `full-ups-v3` are the final candidate.
Earlier v10-labelled artifacts/keys are retained prototypes, not interchangeable
identities or deployment candidates. No contract/key/vault was registered,
updated or funded; no transaction was sent. These are synthetic checkpoint UPSs,
not current-network receipts or ordinary-wallet signed claims.

## Evidence levels and retained failures

- Native complete-source planning and Executor preparation use the actual sealed
  binary for both AMM and Curve. Same-epoch reselection fails. Native completion
  followed by a simulated missing journal commit recovers the exact original
  source, seed and plan in a fresh directory. Coordination doubles separately
  cover partial output conflicts, local competitors and cached-artifact tampering.
- Seven native input substitutions reject before output: draw height/root/seed,
  wrong network, source omission, window mismatch and source-manifest tampering.
- An actual historical checkpoint-stat CFC authenticates D at a later context;
  the report distinguishes this from a full UPS. No raw CFC witness is archived.
- Final complete UPSs verify actual CFC bytecode, standalone SD-key/session/call
  binding, fixed Endcap/common resources, exact fee and exported state endpoints.
  Both markets cover all eight accounts/five eligible members, order 4+1 and
  settle 4+1. Separate forks cover late refunds, unseeded expiry/refunds and
  expired partial ordering with same-seed reconstruction/full refunds.
- Ordinary claims execute actual VM bytecode. Their wallet signatures, network
  receipts, confirmation/claim latency and actual final wallet balances are not
  established. The public structural audit is not another ZK verifier.
- Saved-key replay verifies the original key proofs and rejects coherent changed
  priority stacks/signature preimages. It does not regenerate CFCs or Endcaps.
  Legacy compatibility results are separate from new v10 acceptance.

The first compiler candidate failed on whole-array assignment; new generation
retains the existing scalar lowering. The first full run stopped after three
accepted UPSs when the fixture rewound its checkpoint. The second stopped after
three accepted UPSs because a historical checkpoint leaf lacked the corresponding
old global-state tree preimages. Final fixtures reconstruct those historical
preimages; no authentication check was deleted and no SDK code changed.

An early broad JS command omitted the required archived inputs for three older
integration suites. Their guard failures remain recorded; those suites are not
reported as newly passed. Targeted final tests include legacy policy byte equality.
The first native-crash harness failed in its post-check by calling JSON.stringify
on BigInt; the fresh corrected harness uses lossless equality and retains the
original runtime. All other generation/build failures and slow runs are preserved.

## Reproduction

Use frozen SDK mainnet-beta `c92880c8b6e2c8d392f19368bc8801a2584fd427`, client
`b280d714a8f0930c61962c885374ea63ea63d274`, backend
`736572e9dd3ca93566471cf5a2a1cb67a13fe01d`, nightly-2025-09-20,
release/offline/locked, two Cargo jobs and two Rayon threads. Recheck all 2,756
frozen files. Application source pins and exact compiler/test/planner binary
hashes are archived. No upstream patch or dependency migration is involved.

Unpack indexed gzip files into a fresh case directory and verify both compressed
and public hashes. Original hashes additionally identify unredacted originals.
Replace `<case-root>`, `<application-root>`, `<evidence-root>` and `<home>` only
in redacted machine-local paths in reproduction scripts/manifests. Artifacts,
public proof bytes and their identity digests remain exact. Do not alter originals.

Create a fresh test-only application using
`batching/dependencies/prepare_mainnet_beta_application.py`. Explicitly declare
`compile_random_stream`, `random_stream_plan` and `final_state_coverage` bin targets
in that snapshot's Cargo manifest, as in archived application v4. Compile the
`batch_lifecycle` integration test with `--no-run --message-format=json` and retain
the exact produced executable. Never use the generic compiler in place of the
owned checkpoint-stat intrinsic lowering.

```text
node batching/checkpoint-stream/random-build.mjs
     REVIEWED_COMPILE_RANDOM_STREAM REVIEWED_INPUT FRESH_FIXTURES

BATCH_BUILD=FRESH_FIXTURES BATCH_PROOF_PROFILE=compact-v1
RANDOM_STREAM_OUT=FRESH_FULL_UPS
BATCH_LIFECYCLE random_stream_complete_set_order_settlement_and_recovery
                --ignored --nocapture --test-threads=1

node batching/checkpoint-stream/audit-random-evidence.mjs FRESH_FULL_UPS
```

`random_stream_plan REVIEW SNAPSHOT PINNED_HISTORY_ROOT DRAW_OPENING POLICY
FRESH_OUTPUT` only prepares. The archived native planner/attack/route scripts
record exact reviewed inputs and lossless JSON behavior. Test RPC capture is
read-only and does not establish finality. Financial execution remains gated.
The original plan bounds are 34 final UPSs plus six accepted prototype prefixes,
one historical CFC probe, 4,800 seconds, 8 GiB sampled family RSS, stop on first
failure, zero financial operations. Key replay has its own no-new-UPS bounds.

## Trust, liveness and performance limits

The native producer can bias or withhold its statistic. Actual inclusion before
seed release and external finality are not authenticated. A sorted partial prefix
can omit a lower-ranked member and block completion; no trade can occur until
full ordering, and same-seed refund reconstruction is available, but repeated
hostile prefixes can consume fees. That liveness/fee-griefing problem is not
closed by a successful honest recovery test. Do not enable live funding merely
because the proof count is complete. The live v10 native spending driver and
fresh source/deadline/fee admission remain application work.

Source completeness is finite final-state completeness, not global admission or
raw-block transaction history. No market pricing, Book/NFT priority, shared-vault
or cross-UPS atomicity boundary changes. Local locks are not cross-machine proof.

Reported proof intervals exclude separately reported cold resources. Whole-case
wall time includes forks, VM claims, failures and overhead as applicable; do not
sum nested CFC/key/Endcap timings again. One-second process-family RSS includes
shared pages and can miss short peaks; it is not physical footprint. Compilation,
network confirmation, ordinary-wallet arrival and matched deterministic/random
performance comparison are separate. No chain TPS, p95, general speedup or
production-readiness conclusion is supported.

Both market resource constructions occur in the same process, AMM first and
Curve later. The raw phase label `cold-stream-resource-build` denotes new
per-market CM/key/source resources, not two independent new-process cold starts.
Global immutable caches can already be warm for Curve. No controlled cold/warm
comparison is claimed; the raw samples and phase labels are preserved unchanged.
