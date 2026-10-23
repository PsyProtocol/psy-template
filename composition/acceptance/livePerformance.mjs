// Closed-case observations only. Financial identities come from the exact
// audited and independently verified requests, never from timing metadata.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {saveObservation} from '../../executor/observations.mjs';
import {summarizePhases} from '../../executor/acceptance/livePerformance.mjs';
import {controllerDirectory} from './controllerDirectory.mjs';

const exact = p => parseLosslessJson(readFileSync(p, 'utf8'));
const observation = p => JSON.parse(readFileSync(p, 'utf8'));
function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    assert.ok(!entry.isSymbolicLink(), 'report refuses symlinks');
    if (['.secrets', 'drivers'].includes(entry.name)) return [];
    const p = join(dir, entry.name);
    return entry.isDirectory() ? files(p) : [p];
  });
}
export function observedConfirmation(timing, included) {
  if (!timing) return null;
  const ack = Date.parse(timing.finishedAt), seen = Date.parse(included.checkedAt);
  assert.ok(Number.isFinite(ack) && Number.isFinite(seen) && seen >= ack,
    'invalid acknowledgement/observation interval');
  return seen - ack;
}
export function matchVerifiedReceipt(item, verified) {
  assert.equal(item.contentHash, verified.contentHash);
  assert.equal(item.userId, verified.userId);
  assert.equal(item.fee, verified.fee);
}
export function summarizePublicReads(rows) {
  const methods = {};
  for (const row of rows) {
    assert.equal(row.schema, 1);
    assert.equal(row.phase, 'public-rpc-read');
    assert.equal(typeof row.failed, 'boolean');
    assert.match(row.method, /^psy_get_/);
    const key = row.endpointHost+'/'+row.method;
    const entry = methods[key] ??= {attempts:0, failed:0, missingQueueTimings:0,
      missingRpcTimings:0, queueOperationSumMilliseconds:0, rpcOperationSumMilliseconds:0,
      maximumRpcMilliseconds:null};
    entry.attempts++;entry.failed += Number(row.failed);
    for (const [field, missing, sum] of [
      ['queueMilliseconds','missingQueueTimings','queueOperationSumMilliseconds'],
      ['rpcAndParseMilliseconds','missingRpcTimings','rpcOperationSumMilliseconds']]) {
      const value = row[field];
      if (value === null) entry[missing]++;
      else {
        assert.ok(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER);
        entry[sum] += value;
        if (field === 'rpcAndParseMilliseconds') entry.maximumRpcMilliseconds =
          entry.maximumRpcMilliseconds === null ? value : Math.max(entry.maximumRpcMilliseconds, value);
      }
    }
  }
  return {observedAttempts:rows.length, methods,
    scope:'observed physical JavaScript public-read attempts only; retries counted individually, concurrent/phase-nested sums are not elapsed wall; Rust SDK witness/proving reads and unobserved calls are not included'};
}
export function compositionPerformance(base, proofSummary, resourceSummary) {
  base = resolve(base);
  const inside = p => {
    const r = relative(base, resolve(p));
    assert.ok(r && !r.startsWith('..') && !isAbsolute(r), 'evidence outside case');
    return resolve(base, r);
  };
  const completePath = join(base, 'public/INITIALIZED-LIVE-ACCEPTANCE-COMPLETE-v1.json');
  const complete = exact(completePath);
  const completed = Object.fromEntries([['success',complete.success],['recovery',complete.recovery],
    ...(complete.partialRecovery ? [['partial-recovery',complete.partialRecovery]] : [])]);
  for (const scenario of Object.keys(completed)) {
    assert.equal(completed[scenario].ordinaryOwnerClaimIncluded, true);
    assert.equal(completed[scenario].controllerPhase, 99n);
    assert.equal(completed[scenario].controllerNative, 0n);
    for (const asset of completed[scenario].controllerAssets) assert.equal(asset.balance, 0n);
  }
  const auditPath = join(base, 'public/COMPOSITION-RECOVERY-AUDIT-v1.json');
  const audit = exact(auditPath), verified = exact(proofSummary);
  assert.equal(verified.auditSha256, sha256(readFileSync(auditPath)));
  assert.equal(verified.mutatedActualFeeRejected, true);
  assert.equal(verified.broadcast, false);
  const proofByHash = new Map(verified.rows.map(r => [r.contentHash, r]));
  assert.equal(proofByHash.size, verified.rows.length, 'duplicate proof identity');
  assert.equal(proofByHash.size, audit.newReceipts.length, 'incomplete actual proof verification');
  for (const row of audit.newReceipts) {
    assert.ok(proofByHash.has(row.contentHash), 'unverified actual receipt');
    matchVerifiedReceipt(row, proofByHash.get(row.contentHash));
  }
  const ownerAuditPath = join(base, 'public/COMPOSITION-OWNER-CLAIMS-AUDIT-v1.json');
  const ownerClaims = exact(ownerAuditPath);
  assert.equal(ownerClaims.broadcast, false);
  assert.equal(ownerClaims.verificationSummarySha256, sha256(readFileSync(proofSummary)));
  assert.deepEqual(ownerClaims.rows.map(r => r.scenario).sort(), Object.keys(completed).sort());
  for (const row of ownerClaims.rows) {
    assert.equal(row.owner, completed[row.scenario].owner);
    assert.equal(row.vault, completed[row.scenario].vaultId);
    assert.ok(proofByHash.has(row.contentHash));
    assert.equal(proofByHash.get(row.contentHash).requestSha256, row.requestSha256);
  }
  const ordinaryObservation = p => {
    const row = exact(p), timingPath = join(resolve(p, '..'), 'timing.json');
    const timing = existsSync(timingPath) ? exact(timingPath) : null;
    assert.ok(proofByHash.has(row.contentHash));
    return {file:relative(base, p), timing, checkpoint:row.checkpoint,
      includedObservedAt:row.checkedAt, contentHash:row.contentHash,
      fee:row.receipt.data.result.fees_collected,
      acknowledgementToIncludedCommonObservationMilliseconds:observedConfirmation(timing, row),
      scope:'ordinary wallet process wall includes build/read/proof/verification/HTTP; separate receipt/common observation includes polling'};
  };
  const routes = [];
  for (const scenario of Object.keys(completed)) {
    const home = join(controllerDirectory(base), scenario);
    const configuration = observation(join(home, 'route/executor.json'));
    const all = files(home), done = completed[scenario];
    const identities = {network:configuration.network, vaultId:configuration.vaultId,
      controllerId:Number(done.controllerId), walletSha256:configuration.walletSha256,
      sdkManifestHash:configuration.sdkManifestHash, fingerprint:configuration.fingerprint};
    const included = all.filter(p => /\/\d+-included\.json$/.test(p)).map(p => ({p, row:exact(p)}));
    const proofs = included.map(({p, row}) => {
      const siblings = files(resolve(p, '..')).filter(f => /\/\d+-broadcast-intent\.json$/.test(f));
      const broadcast = siblings.map(exact).findLast(r => r.taskId === row.taskId);
      assert.ok(broadcast && broadcast.task.intentId === done.intentId);
      const preflightPath = inside(join(String(broadcast.proof.preparedDirectory), 'preflight.json'));
      const preflight = exact(preflightPath), hash = row.result.receipt.data.content_hash;
      const checked = proofByHash.get(hash);
      assert.ok(checked, 'controller receipt not independently verified');
      assert.equal(preflight.fullUpsVerified, true);
      assert.equal(preflight.exactStackAndSessionVerified, true);
      assert.equal(preflight.core.state_transition.end_user_leaf_hash, checked.endUserLeafHash);
      assert.equal(preflight.core.new_user_leaf.nonce, checked.nonce);
      return {operation:broadcast.task.operation, taskId:row.taskId, contentHash:hash,
        preflight:relative(base, preflightPath), fee:checked.fee,
        actualCalls:preflight.actualCalls, timingsMilliseconds:preflight.timingsMilliseconds,
        broadcastIntentAt:broadcast.at, includedObservedAt:row.at,
        intentToIncludedObservationMilliseconds:observedConfirmation({finishedAt:broadcast.at}, {checkedAt:row.at}),
        scope:'durable broadcast-intent to receipt/common observation includes verification, fresh reads, HTTP and polling; not pure confirmation latency'};
    });
    const ordinary = all.filter(p => /\/attempts\/owner-[^/]+\/included\.json$/.test(p)).map(ordinaryObservation);
    const adapterStartups = all.filter(p => /\/ADAPTER-STARTUP-[^/]+\.json$/.test(p)).map(observation);
    assert.ok(adapterStartups.length > 0);
    for (const row of adapterStartups) assert.ok(Number.isFinite(Date.parse(row.startedAt)));
    const firstStartup = [...adapterStartups].sort((a,b) => Date.parse(a.startedAt)-Date.parse(b.startedAt))[0];
    const funding = ordinary.find(r => r.file.includes('/owner-fund-v1/'));
    const claim = ordinary.find(r => r.file.includes('/owner-claim-v1/'));
    assert.ok(funding && claim);
    const envelope = {
      adapterStartedAt:firstStartup.startedAt, ownerFundingStartedAt:funding.timing?.startedAt ?? null,
      ordinaryClaimObservedAt:claim.includedObservedAt,
      adapterStartToClaimObservationMilliseconds:observedConfirmation({finishedAt:firstStartup.startedAt}, {checkedAt:claim.includedObservedAt}),
      fundingStartToClaimObservationMilliseconds:funding.timing ? observedConfirmation({finishedAt:funding.timing.startedAt}, {checkedAt:claim.includedObservedAt}) : null,
      scope:'application adapter/ordinary funding starts to exact final ordinary receipt/common observation; includes cold setup, proofs, sponsor steps, queues, injected lifecycle tests and polling; earlier SDK build/deployment/LP excluded; not chain TPS or service SLO'};
    const sponsors = files(join(base, 'attempts')).filter(p =>
      p.endsWith('/included.json') && p.includes('/attempts/composition-'+scenario+'-')).map(ordinaryObservation);
    const baseStages = files(join(base, 'public')).filter(p =>
      p.endsWith('-formal-result.json') && p.includes('/composition-'+scenario+'-')).map(p => {
      const r = exact(p);
      assert.equal(r.result.status, 'included');
      const hash = r.result.receipt.data.content_hash, checked = proofByHash.get(hash);
      assert.ok(checked, 'base stage must independently verify');
      const preflight = exact(inside(join(resolve(String(checked.requestPath), '..'), 'preflight.json')));
      assert.equal(preflight.fullUpsVerified, true);
      assert.equal(preflight.exactStackAndSessionVerified, true);
      assert.equal(preflight.core.state_transition.end_user_leaf_hash, checked.endUserLeafHash);
      const submitted = r.submitMetricsFile ? exact(inside(String(r.submitMetricsFile))) : null;
      return {file:relative(base, p), kind:r.task.kind, contentHash:hash,
        checkpoint:r.result.checkpoint, fee:checked.fee, actualCalls:preflight.actualCalls,
        timingsMilliseconds:preflight.timingsMilliseconds,
        parentAttemptWallMilliseconds:r.wallMilliseconds,
        submitted,
        acknowledgementToIncludedCommonObservationMilliseconds:observedConfirmation(submitted, r)};
    });
    const phases = all.filter(p => p.includes('/runtime/performance/') && p.endsWith('.json')).map(observation);
    for (const row of phases) {
      assert.equal(row.scope.vaultId, identities.vaultId);
      assert.equal(row.scope.fingerprint, identities.fingerprint);
      assert.equal(row.scope.walletSha256, identities.walletSha256);
    }
    const publicReads = all.filter(p => p.includes('/runtime/rpc-performance/') && p.endsWith('.json')).map(observation);
    for (const row of publicReads) {
      assert.equal(row.scope.vaultId, identities.vaultId);
      assert.equal(row.scope.fingerprint, identities.fingerprint);
      assert.equal(row.scope.walletSha256, identities.walletSha256);
    }
    const marketSettlements = [];
    for (let hop = 1; hop <= Number(done.marketFills ?? (scenario === 'success' ? 2 : 1)); hop++) {
      const tag = 'composition-'+scenario+'-hop-'+hop;
      const frozen = exact(join(home, 'public', tag+'-admission-plan.json'));
      assert.equal(frozen.members.length, 1);
      assert.equal(frozen.members[0].owner, BigInt(identities.vaultId));
      const settled = exact(join(base, 'public', tag+'-settle-formal-result.json'));
      assert.equal(settled.task.kind, 'batch_settle');
      assert.equal(settled.result.status, 'included');
      const contentHash = settled.result.receipt.data.content_hash;
      assert.ok(proofByHash.has(contentHash), 'unverified base settlement');
      marketSettlements.push({hop, contentHash, checkpoint:settled.result.checkpoint,
        parentAttemptWallMilliseconds:settled.wallMilliseconds,
        fee:proofByHash.get(contentHash).fee,
        scope:'one frozen composition member; confirmed base settlement and subsequent controller payout are both required'});
    }
    const warmPath = join(home, 'public/WARM-FUND-TO-OPEN-v1.json');
    const warmTransition = existsSync(warmPath) ? exact(warmPath) : null;
    const restartPath = join(home, 'public/PROCESS-RESTART-COMPLETE-v1.json');
    let processRestart = existsSync(restartPath) ? exact(restartPath) : null;
    const resumedPath = join(home, 'public/PROCESS-RESTART-RESUMED-v1.json');
    if (!processRestart && existsSync(resumedPath)) {
      const point = exact(join(home,'public/PROCESS-RESTART-POINT-v1.json'));
      const resumed = exact(resumedPath);
      assert.equal(done.outcome,'first-hop-admission-timeout-cancelled-and-refunded');
      assert.equal(done.marketFills,0n);
      processRestart = {configSha256:resumed.configSha256, resumed,
        checkpoint:point, supervisorCompleted:false, terminalOutcome:done.outcome,
        scope:'planned worker restart and exact receipt reconciliation succeeded; later admission proof expired before broadcast; original supervisor halted and separate explicit refund helper completed; not uninterrupted route completion'};
    }
    if (scenario === 'recovery' && existsSync(join(base, 'public/RECOVERY-PROCESS-RESTART-PLAN-v1.json'))) {
      assert.equal(warmTransition?.warmTransitionVerified, true, 'planned warm network transition not verified');
      assert.ok(processRestart, 'planned real worker restart not verified');
      if (processRestart.attempts) assert.equal(processRestart.attempts.length, 2);
      else assert.equal(processRestart.supervisorCompleted,false);
      assert.notEqual(processRestart.resumed.oldPid, processRestart.resumed.newPid);
      assert.equal(processRestart.resumed.exactOriginalReceiptsReconciled, true);
      assert.equal(processRestart.resumed.unresolved, 0n);
      assert.equal(processRestart.configSha256, sha256(readFileSync(join(home, 'route/executor.json'))));
    }
    routes.push({scenario, identities, completion:done, envelope, proofs, ordinary, sponsors, baseStages, marketSettlements,
      initialResourceTransition:warmTransition, processRestart,
      publicReads:summarizePublicReads(publicReads),
      adapterStartups,
      residentJobs:all.filter(p => /\/RESIDENT-(quote|prove)-[^/]+\.json$/.test(p)).map(observation),
      phases:summarizePhases(phases),
      failedAttempts:all.filter(p => p.endsWith('/failure.json')).map(p => relative(base, p))});
  }
  return {schema:1, generatedAt:new Date().toISOString(),
    acceptanceSha256:sha256(readFileSync(completePath)), auditSha256:verified.auditSha256,
    proofSummarySha256:sha256(readFileSync(proofSummary)),
    ownerClaimsAuditSha256:sha256(readFileSync(ownerAuditPath)), ownerClaims, routes,
    actualMarketFills:Object.fromEntries(routes.map(r => [r.scenario, r.marketSettlements.length])),
    cohortFeesSinceConstituentBaseline:audit.newBurn,
    feeScope:'all audited cohort receipts since constituent baseline, including bootstrap/LP/sponsorship; not solely composition fees',
    sampledResources:resourceSummary ? observation(resourceSummary) : null,
    limits:{coldBinaryBuild:null, chainTps:null, matchedLiveBeforeAfterSpeedup:null,
      exactServerFinalityLatency:null, productionReady:false,
      phaseWalls:'nested/overlapping; do not add as elapsed wall',
      residentStartup:'same startup descriptor repeats in later jobs; count only firstJobInProcess',
      proofTimings:'driver phase walls may include fresh witness/state IO; they are not isolated cryptographic CPU times',
      memory:'parent RSS endpoints and optional sampled known wallet processes; not per-stage or true process-tree peaks',
      scope:'two-AMM A-to-B-to-A cross-UPS workflow; deterministic finite queues, ordinary owner claims and actual intermediate-asset compensation; no cross-vault atomicity'}};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [base, proofs, out, resources] = process.argv.slice(2);
  assert.ok(base && proofs && out);
  saveObservation(out, compositionPerformance(base, proofs, resources));
}
