// Reports observations, never estimates chain TPS from offline proving.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {join, relative} from 'node:path';
import {createHash} from 'node:crypto';
import {save, read} from '../../batching/admission/liveSupport.mjs';
const [base, output] = process.argv.slice(2);
assert.ok(existsSync(join(base, 'public/maximum-complete-v1.json')), 'economic acceptance must finish before publishing its cost report');
const pairs = readdirSync(join(base, 'attempts')).filter(n => n.startsWith('maximum-') && n.endsWith('-cold-comparison')).map(n => {
 const p = join(base, 'attempts', n, 'comparison.json'), r = read(p);
 return {...r, source: relative(base, p), coldProcessOverheadMs: r.coldProcessTiming.wallMilliseconds - Number(r.coldTimingsMs.preflightTotal), preflightRatioColdOverWarm: Number(r.coldTimingsMs.preflightTotal) / Number(r.warmTimingsMs.preflightTotal)};
});
assert.equal(pairs.length, 8, 'commit and settlement for each of four markets');
const ordinary = readdirSync(join(base, 'attempts')).filter(n => /^maximum-.*-(orders|consent|claim)$/.test(n)).map(n => {
 const dir = join(base, 'attempts', n), included = read(join(dir, 'included.json')), timing = read(join(dir, 'timing.json')), server = included.receipt.data;
 return {task: n, source: relative(base, dir), userId: included.userId, contentHash: included.contentHash, checkpoint: included.checkpoint,
  clientProcessMs: timing.wallMilliseconds, clientFinishedAt: timing.finishedAt, commonIndexedObservedAt: included.checkedAt,
  acknowledgementToCommonIndexedObservationMs: Date.parse(included.checkedAt) - Date.parse(timing.finishedAt),
  serviceReceivedAt: server.received_at, serviceIncludedAt: server.included_at, serviceReportedLatencyMs: server.latency_ms,
  fee: String(server.result.fees_collected),
  scope: 'client process includes cold circuit/session, full ordinary UPS, HTTP acknowledgement; observation includes polling, services indexing and common-realm visibility; server timestamps use a separate clock'};
});
const formal = readdirSync(join(base, 'public')).filter(n => /^maximum-.*-formal-result\.json$/.test(n)).map(n => {
 const r = read(join(base, 'public', n));
 const submit = r.submitMetricsFile ? read(r.submitMetricsFile) : null;
 return {task: n, kind: r.task.kind, contentHash: r.result.contentHash, checkpoint: r.result.checkpoint, taskWallMs: r.wallMilliseconds,
  savedProofVerifyFreshChecksAndAckMs: submit?.processWallMilliseconds ?? null,
  acknowledgementToCommonIndexedObservationMs: submit ? Date.parse(r.checkedAt) - Date.parse(submit.finishedAt) : null,
  fee: String(r.result.receipt.data.result.fees_collected), serviceReceivedAt: r.result.receipt.data.received_at,
  serviceIncludedAt: r.result.receipt.data.included_at, serviceReportedLatencyMs: r.result.receipt.data.latency_ms,
  scope: 'task wall includes preflight, optional deliberately repeated cold comparison, saved-proof verification, broadcast, polling and indexed/common visibility; not optimized production latency'};
});
const residentColdResourceConstruction = ['amm', 'orderbook', 'bondingcurve', 'nftmarket'].map(kind => {
 const r = read(join(base, 'public', 'maximum-' + kind + '-start-formal-result.json'));
 const taskHash = createHash('sha256').update(r.task.submission + '\n' + r.task.validUntilCheckpoint).digest('hex');
 const reg = read(join(base, 'markets-v1', kind, 'live-registration.json'));
 const dir = join(base, 'runtime/compact/sepolia', String(reg.vaultId), taskHash), samples = [];
 for (const n of readdirSync(dir).filter(n => n.endsWith('.preflight.log'))) for (const line of readFileSync(join(dir, n), 'utf8').split('\n')) {
  if (!line.startsWith('PSY_COMPACT_SERVER ')) continue;
  const value = JSON.parse(line.slice(19)); if (value.ready) samples.push({source: relative(base, join(dir, n)), ...value});
 }
 assert.equal(samples.length, 1, 'one first-start resource record per maximum resident process');
 return {market: kind, ...samples[0], scope: 'initial key/circuit manager construction before the first proof request; excluded from warm job preflight totals; excludes factory identity checks and OS startup'};
});
const sums = ['amm', 'orderbook', 'bondingcurve', 'nftmarket'].map(market => {
 const p = pairs.filter(x => x.market === market); assert.equal(p.length, 2);
 const warmMs = p.reduce((s, x) => s + Number(x.warmTimingsMs.preflightTotal), 0);
 const fills = ['orderbook', 'nftmarket'].includes(market) ? 2 : 4;
 return {market, acceptedMembers: 4, economicFills: ['orderbook', 'nftmarket'].includes(market) ? 2 : 4,
  warmCommitSettlementMs: warmMs,
  offlineFullProofFillsPerSecond: fills * 1000 / warmMs,
  rateScope: 'complete warm commitment plus settlement preflight only, excluding admission, confirmation and claims; not network TPS',
  coldCommitSettlementMs: p.reduce((s, x) => s + Number(x.coldTimingsMs.preflightTotal), 0)};
});
const starts = ordinary.filter(x => x.task.endsWith('-orders')).map(x => Date.parse(read(join(base, x.source, 'timing.json')).startedAt));
const ends = ordinary.filter(x => x.task.endsWith('-claim')).map(x => Date.parse(x.commonIndexedObservedAt));
assert.equal(starts.length, 4); assert.equal(ends.length, 4);
const started = Math.min(...starts), finished = Math.max(...ends), fills = sums.reduce((sum, x) => sum + x.economicFills, 0);
const testEnvelope = {startedAt: new Date(started).toISOString(), finishedAt: new Date(finished).toISOString(), wallMilliseconds: finished - started,
 economicFills: fills, observedTestFillsPerSecond: fills * 1000 / (finished - started),
 scope: 'actual isolated acceptance envelope: four ordinary order UPSs through final ordinary claim observations; includes admission, sponsorship, deliberately repeated cold proofs, indexing and common-checkpoint polling; not normal optimized service throughput or chain TPS'};
save(output, {schema: 1, generatedAt: new Date().toISOString(), pairs, sums, ordinary, formal, residentColdResourceConstruction,
 testEnvelope,
 readOnlyRpcProbe: existsSync(join(base, 'public/rpc-read-latency-probe-v1.json')) ? read(join(base, 'public/rpc-read-latency-probe-v1.json')) : null,
 methodology: {sameMachine: true, sameBinaryAndRayonThreads: true, sameCompleteCallStackFeeNonceStartAndEndState: true,
  pairOrder: ['warm', 'cold'], warmOnlyBroadcast: true, samplesPerMarketAndOperation: 1,
  originalFortyCallControlledComparisonCompleted: false, cargoColdBuildMeasuredInThesePairs: false,
  offlineProvingIsChainTps: false, chainTps: null,
  limitations: ['Sequential warm-then-cold single pairs are susceptible to cache and order bias; no confidence interval.', 'No second proof job is intentionally run during each pair; host load is recorded, not globally controlled.', 'Resident retains pinned circuit resources but creates a fresh user/checkpoint/nonce/state session for every request.', 'Ordinary wallet claim process and confirmation observations are measured separately; server latency 0 is not end-to-end finality.', 'Broadcast-process time combines full saved-proof verification, fresh RPC checks and HTTP acknowledgement; pure transport time is not isolated.', 'The deliberate cold comparison is additional acceptance overhead; task wall must not be called normal optimized latency.']}});
