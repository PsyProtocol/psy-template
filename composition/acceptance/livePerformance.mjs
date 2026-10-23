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
export function compositionPerformance(base, proofSummary, resourceSummary) {
  base = resolve(base);
  const inside = p => {
    const r = relative(base, resolve(p));
    assert.ok(r && !r.startsWith('..') && !isAbsolute(r), 'evidence outside case');
    return resolve(base, r);
  };
  const completePath = join(base, 'public/INITIALIZED-LIVE-ACCEPTANCE-COMPLETE-v1.json');
  const complete = exact(completePath);
  for (const scenario of ['success', 'recovery']) {
    assert.equal(complete[scenario].ordinaryOwnerClaimIncluded, true);
    assert.equal(complete[scenario].controllerPhase, 99n);
    assert.equal(complete[scenario].controllerNative, 0n);
    for (const asset of complete[scenario].controllerAssets) assert.equal(asset.balance, 0n);
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
  const routes = [];
  for (const scenario of ['success', 'recovery']) {
    const home = join(controllerDirectory(base), scenario);
    const configuration = observation(join(home, 'route/executor.json'));
    const all = files(home), done = complete[scenario];
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
        intentToIncludedObservationMilliseconds:Date.parse(row.at)-Date.parse(broadcast.at),
        scope:'durable broadcast-intent to receipt/common observation includes verification, fresh reads, HTTP and polling; not pure confirmation latency'};
    });
    const ordinary = all.filter(p => /\/attempts\/owner-[^/]+\/included\.json$/.test(p)).map(p => {
      const row = exact(p), timingPath = join(resolve(p, '..'), 'timing.json');
      const timing = existsSync(timingPath) ? exact(timingPath) : null;
      assert.ok(proofByHash.has(row.contentHash));
      return {file:relative(base, p), timing, checkpoint:row.checkpoint,
        fee:row.receipt.data.result.fees_collected,
        acknowledgementToIncludedCommonObservationMilliseconds:observedConfirmation(timing, row),
        scope:'ordinary wallet process wall includes build/read/proof/verification/HTTP; separate receipt/common observation includes polling'};
    });
    const phases = all.filter(p => p.includes('/runtime/performance/') && p.endsWith('.json')).map(observation);
    for (const row of phases) {
      assert.equal(row.scope.vaultId, identities.vaultId);
      assert.equal(row.scope.fingerprint, identities.fingerprint);
      assert.equal(row.scope.walletSha256, identities.walletSha256);
    }
    const marketSettlements = [];
    for (let hop = 1; hop <= (scenario === 'success' ? 2 : 1); hop++) {
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
    routes.push({scenario, identities, completion:done, proofs, ordinary, marketSettlements,
      adapterStartups:all.filter(p => /\/ADAPTER-STARTUP-[^/]+\.json$/.test(p)).map(observation),
      residentJobs:all.filter(p => /\/RESIDENT-(quote|prove)-[^/]+\.json$/.test(p)).map(observation),
      phases:summarizePhases(phases),
      failedAttempts:all.filter(p => p.endsWith('/failure.json')).map(p => relative(base, p))});
  }
  return {schema:1, generatedAt:new Date().toISOString(),
    acceptanceSha256:sha256(readFileSync(completePath)), auditSha256:verified.auditSha256,
    proofSummarySha256:sha256(readFileSync(proofSummary)), routes,
    actualMarketFills:Object.fromEntries(routes.map(r => [r.scenario, r.marketSettlements.length])),
    cohortFeesSinceConstituentBaseline:audit.newBurn,
    feeScope:'all audited cohort receipts since constituent baseline, including bootstrap/LP/sponsorship; not solely composition fees',
    sampledResources:resourceSummary ? observation(resourceSummary) : null,
    limits:{coldBinaryBuild:null, chainTps:null, matchedLiveBeforeAfterSpeedup:null,
      exactServerFinalityLatency:null, productionReady:false,
      phaseWalls:'nested/overlapping; do not add as elapsed wall',
      residentStartup:'same startup descriptor repeats in later jobs; count only firstJobInProcess',
      memory:'parent RSS endpoints and optional sampled known wallet processes; not per-stage or true process-tree peaks',
      scope:'two-AMM A-to-B-to-A cross-UPS workflow; deterministic finite queues, ordinary owner claims and actual intermediate-asset compensation; no cross-vault atomicity'}};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [base, proofs, out, resources] = process.argv.slice(2);
  assert.ok(base && proofs && out);
  saveObservation(out, compositionPerformance(base, proofs, resources));
}
