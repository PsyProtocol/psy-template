# Four-market candidate acceptance runbook

This runbook covers the owned staging QA case, not a production deployment or
an instruction to update any existing contract. Use the existing branch
`markets-batch-capacity-recovery-20261020`. Original requests, proofs, failures,
journals and outputs are immutable; a nonzero exit requires inspection and
receipt reconciliation before an explicitly reviewed continuation.

## Inputs and scope

- Parent case: `/tmp/psy-market-candidate-live-20261021-v3`.
- Fresh bulk replacement case: `/tmp/psy-market-candidate-bulk-live-20261021-v2`.
  The v1 attempt is retired: a content-hash lookup aliased an old occurrence;
  vault 1169600 remains unactivated and is included in the replacement audit.
- Original asset/actor case: `/tmp/psy-market-isolated-live-20261020-v1`.
- Frozen signing release: `candidate-release-v4.json`; do not use the default
  release or substitute the newly rebuilt diagnostic binaries.
- Assets: QA FT-A **2464**, QA FT-B **2466** (18 decimals), QA NFT **2467**
  (two identities), faucet **test PSY** (9 decimals). Existing **pUSDT unused**.
- NFT **2469 retired**; corrected **2472** is the earlier baseline. Fresh
  candidates additionally lock consented terms until terminal epoch evidence.
- Wallet keys remain at the original local private paths. Public archives do
  not contain them. Another operator must use its own explicitly funded QA
  identities and fresh manifests rather than copy these identities' journals.

The prepared case freezes compiler, wallet bytes, SDK source/lock/toolchain,
four complete seven-call UPS gates, signature mutation gates and the additional
preceding-vault cohort. `PREPARED-BULK-v1.json` is offline preparation, not a
successful deployment marker. The replacement asset audit has 19 explicit accounts and
all their pairwise pending transfers; it is not a global inventory proof.

## Gates before another financial interval

1. Finish the parent case. Require
   `public/maximum-partial-cancel-refund-complete-v1.json`, actual ordinary
   claims, original FT/native/NFT principal restored and native decrease equal
   to included fees. Its `maximumCapacityPassed` must remain false.
2. Complete the scheduled same-binary fixed-40 versus compact whole-UPS
   comparison in `/tmp/psy-market-profile-comparison-20261021-v1`. Inspect its
   `COMPARISON.json` and every raw log/report. Never run another financial
   proof concurrently with these measurements. A missing report is not a pass.
   Once it is complete, run `node executor/acceptance/analyzeProofCosts.mjs
   /tmp/psy-market-profile-comparison-20261021-v1
   /tmp/psy-market-profile-comparison-20261021-v1/COST-ANALYSIS.json` to separate
   cold resources, warm full proofs, noop steps and end-cap intervals. Its input
   report hashes, all four complete profile pairs, fee equality and full-UPS
   endpoints must pass; VM-only or incomplete evidence is rejected.
3. Confirm no other process is using the owned wallets or vaults. Preserve and
   reconcile unknown sends before starting another step. These checks do not
   certify Node's atomic submission behavior.

## Ordered real acceptance commands

Run from the repository root, one command at a time. Inspect each completion
marker and indexed receipt before proceeding; do not run this block blindly
after an interrupted attempt.

```sh
export PSY_CANDIDATE_RELEASE_FILE=candidate-release-v4.json
export QA_BULK_CASE=/tmp/psy-market-candidate-bulk-live-20261021-v2
export QA_ORIGINAL_CASE=/tmp/psy-market-isolated-live-20261020-v1

node executor/acceptance/candidateDeploymentIdentities.mjs "$QA_BULK_CASE"
node executor/acceptance/candidateDeploy.mjs "$QA_BULK_CASE" "$QA_ORIGINAL_CASE" /tmp/psy-ordinary-diagnostics-binaries-20261021-v14/isolated_wallet /tmp/psy-executor-resident-binaries-20261021-v3/compact_market_wallet all-four-v1
node executor/acceptance/candidateBootstrap.mjs "$QA_BULK_CASE" "$QA_ORIGINAL_CASE"
node executor/acceptance/candidateTrading.mjs "$QA_BULK_CASE" "$QA_ORIGINAL_CASE" liquidity
node executor/acceptance/candidateTrading.mjs "$QA_BULK_CASE" "$QA_ORIGINAL_CASE" maximum
node executor/acceptance/candidateCostReport.mjs "$QA_BULK_CASE" "$QA_BULK_CASE/public/maximum-cost-report-v1.json"
node executor/acceptance/candidateRecovery.mjs "$QA_BULK_CASE" "$QA_ORIGINAL_CASE"
node executor/acceptance/candidateNftCompetition.mjs "$QA_BULK_CASE" "$QA_ORIGINAL_CASE"
```

Deployment accepts only fresh initial layouts and registers new keys/vaults.
Create the deployment-identity release only once; if it exists, verify and skip
its creation rather than regenerate. These four owned keys are unregistered and
unfunded, with private files excluded from Git. The deployment command verifies
the public profiles/release and rejects historical IDs or inclusion checkpoints.
Bootstrap reuses owned asset holders, accounts existing pending native funding,
funds the actual NFT holder and initializes Curve inventory against the new AMM
vault. It does not issue another QA asset supply or change MCP wallet policies.

Maximum admission uses the real `executor/run.mjs once --expected-task` CLI.
Its four authenticated consents become one seven-call UPS per market. Commit
and settlement use the formal adapter/journal with measured resident/cold
proof pairs. Max support is four members: AMM/Curve four fills each,
Orderbook/NFT two fills each. Only the normal warm proof may be broadcast;
historical-source calibration artifacts are read-only and rejected for send.

The omitted-user stage checks immediate release before consent, rejection
while consent is locked, empty-epoch timeout, exact bounded recovery grants,
sender-bound returns and ordinary-wallet claims. The NFT stage checks two
buyers/one listing, a cancelled second listing, expiry and same-set refreeze,
two independently prepared valid proofs with **scheduled** winner submission,
stale-loser refusal, deliberately lost parent response and duplicate recovery.
It does **not** send two conflicting RPC requests simultaneously.

## Required evidence and reporting

Preserve complete calls/request/proof/guard/session and dependency identities,
raw response/intent, exact indexed receipt, common realm checkpoint, state
roots, original plus final account/outbox snapshots and actual collected fees.
Archive completed selections using `archiveCompact.py`, then verify original
and compressed hashes with `verifyCompactArchive.py --original-base ...`.
Do not snapshot active directories or include `.secrets`, executables or wallet
recovery material. Commit source, necessary regressions, selected evidence and
updated review ledger; push the existing branch at each completed milestone.

Cost reporting separates cold Cargo build, fresh circuit resources, warm full
UPS preflight, recursive/end-cap stages, saved-proof verification/send, indexed
common-state confirmation and ordinary-wallet claims. The comparison excludes
ordinary fixture setup; the real acceptance envelope includes deliberately
repeated cold proofs, polling and operational recovery. Neither is chain TPS
or proof of a faster complete economic lifecycle. Report sample/order/load and
missing measurements rather than reconstructing them.

## Remaining release boundaries

Deterministic ordering stays enabled. Authenticated future randomness,
finalized seal-before-reveal, bias/withholding rules and seed-preserving recovery
are external protocol requirements. Finite queue completeness does not cover
pre-admission refusal, operator service or global censorship. Source-checkpoint
cutoffs alone do not certify actual inclusion deadlines. Shared journal locks
do not constrain clients bypassing the journal.

Simultaneous shared-network RPC collision is gated on atomic/fenced admission
and a controlled isolated-runtime two-writer test. The reviewed SDK publication,
running-service identity, unique network domain, effective upgrade authorization
and atomic code/layout version binding also remain separate gates. See
`MARKET_BATCH_EXTERNAL_GATES_20261021.md`. Passing this runbook is staging QA
evidence, not independent audit or production-readiness certification.
