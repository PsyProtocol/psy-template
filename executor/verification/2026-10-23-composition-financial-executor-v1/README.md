# Financial composition Executor candidate — 2026-10-23

Same branch `markets-batch-capacity-recovery-20261020`, frozen SDK manifest
`0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425`.
The manifest preserves original and gzip hashes; unpack copies to a fresh directory.
No secrets, wallet recovery material or sealed binaries are included.

## Evidence actually established

- Independent financial scanner / formal durable journal / dedicated driver.
- Owner-pinned controller rejects a different user publishing or occupying the
  one-shot execution account. Legacy unpinned source is rejected by the adapter.
- Canonical issuer decimals and renounced administration are checked in actual
  controller bytecode before custody/trading; both QA assets use 18 decimals.
- Six bytecode regressions, one dedicated first-funder regression; 18 signature
  operation templates and 18 stack/session/fee/fresh-account attacks checked.
- Eight newly generated linked controller UPS requests independently reverified
  against the frozen Node end-cap verifier and public metadata endpoints.
- A→B→A: 4,611,686,018,427,387,921 → 3,738,416,797,288,011,079 →
  3,141,711,878,267,176,122 atomic units. Market arithmetic executes in the VM;
  intermediate Outbox cannot be spent before the separate controller claim.
- Terminal replay rejected; A/B/native execution balances all zero. Ordinary
  owner final claims execute bytecode in this harness, **not ordinary full UPS**.

The bytecode includes the new owner/metadata guards. Key policy JSON differs
only in formatting from the separately proved signature policy (see equivalence
record); controller state/proofs were newly produced, never reused.

## Measurements

Full process: 489.61 s, Darwin maximum RSS 6,762,348,544 bytes. Cold circuit
construction 125.229 s. Eight controller proofs total 326.067 s, individual
32.489–50.932 s; actual controller burn total 8.000069 test-PSY-equivalent units,
plus two 1.0001 market escrows. These are **synthetic offline** costs, not fees
actually charged by the network. Some cold work overlapped offline compilation /
inspection; no matched old/new performance, network TPS or speedup is inferred.
Use `composition-owner-performance-v1.json` and raw REPORT for exact values.

## Reproduce

Materialize the existing frozen SDK using its repository instructions. Build
`amm/u124/vm-tests` with its unchanged lockfile, nightly-2025-09-20, localhost
compile domain and the archived source/config hashes. No Node worktree edits.

Set COMPOSITION_BUILD to the unpacked `composition-owner-fixture-v1`,
COMPOSITION_METADATA_GUARD=1 and RAYON_NUM_THREADS=2. Run `composition_funds`
regular tests. Run `composition_owner` with COMPOSITION_OWNER_GUARD=1. For full
proofs set COMPOSITION_UPS_OUT to a **nonexistent** persistent output directory
and run `composition_funds full_ups::two_pool_controller_workflow_full_ups
--exact --ignored --test-threads=1 --nocapture`. Verify each saved request with
`verify_saved_ups REQUEST FRESH_REPORT`; it performs no RPC or mutation.
JS regression command: `node --test composition/*.test.mjs executor/residentProver.test.mjs`.

## Open gates

This archive is not a deployed composition, complete market-workflow UPS test,
ordinary full-proof final claim, network economic/competition/recovery acceptance,
or production certification. Base market and ordinary actions in this harness
are VM-only. The financial adapter has mock-transport recovery regressions;
new-instance real acceptance is a separate running case. Four-market routing,
NFT policies, wider paths, authenticated future randomness and multi-host proof
coordination remain outside this first two-AMM profile. Historical foreign
snapshots and external upgrade/runtime identity trust boundaries remain explicit.
