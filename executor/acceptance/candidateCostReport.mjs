// Reports observations, never estimates chain TPS from offline proving.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {join, relative} from 'node:path';
import {residentStartupRecords} from './residentCost.mjs';
import {ordinaryEvidenceDirectory} from './ordinaryEvidence.mjs';
import {save, read} from '../../batching/admission/liveSupport.mjs';
const [base, output] = process.argv.slice(2);
assert.ok(existsSync(join(base, 'public/maximum-complete-v1.json')), 'economic acceptance must finish before publishing its cost report');
const pairs = readdirSync(join(base, 'attempts')).filter(n => n.startsWith('maximum-') && n.endsWith('-cold-comparison')).map(n => {
 const p = join(base, 'attempts', n, 'comparison.json'), r = read(p);
 return {...r, source: relative(base, p), coldProcessOverheadMs: r.coldProcessTiming.wallMilliseconds - Number(r.coldTimingsMs.preflightTotal), preflightRatioColdOverWarm: Number(r.coldTimingsMs.preflightTotal) / Number(r.warmTimingsMs.preflightTotal)};
});
assert.equal(pairs.length, 8, 'commit and settlement for each of four markets');
const completion=read(join(base,'public/maximum-complete-v1.json'));
const ordinaryObservation=n=>{
 const dir = ordinaryEvidenceDirectory(base,n), included = read(join(dir, 'included.json')), timing = read(join(dir, 'timing.json')), server = included.receipt.data;
 return {task: n, source: relative(base, dir), userId: included.userId, contentHash: included.contentHash, checkpoint: included.checkpoint,
  clientProcessMs: timing.wallMilliseconds, clientFinishedAt: timing.finishedAt, commonIndexedObservedAt: included.checkedAt,
  acknowledgementToCommonIndexedObservationMs: Date.parse(included.checkedAt) - Date.parse(timing.finishedAt),
  serviceReceivedAt: server.received_at, serviceIncludedAt: server.included_at, serviceReportedLatencyMs: server.latency_ms,
  fee: String(server.result.fees_collected),
  scope: 'client process includes cold circuit/session, full ordinary UPS, HTTP acknowledgement; observation includes polling, services indexing and common-realm visibility; server timestamps use a separate clock'};
};
const ordinary=['bob','trader','charlie','dave'].flatMap(name=>['orders','consent','claim'].map(kind=>completion.ordinaryLabels?.[name]?.[kind]??'maximum-'+name+'-'+kind)).map(ordinaryObservation);
const selectedOrdinary=new Set(ordinary.map(r=>r.source));
const otherOrdinaryUps=readdirSync(join(base,'attempts')).filter(n=>n.startsWith('maximum-')&&existsSync(join(base,'attempts',n,'included.json'))&&!selectedOrdinary.has('attempts/'+n)).map(ordinaryObservation);
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
 const samples=residentStartupRecords(base,kind);assert.ok(samples.length>=1,'resident construction evidence missing');
 return {market:kind,starts:samples,startCount:samples.length,keyConstructionMs:samples.reduce((sum,r)=>sum+r.keyConstructionMs,0),sessionConstructionMs:samples.reduce((sum,r)=>sum+r.sessionConstructionMs,0),scope:'all recorded resident starts, including explicit restarts whose first proof is a later maintenance job; summed per-process construction, not parallel elapsed wall; excluded from warm job preflight totals; excludes factory identity checks and OS startup'};
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
 scope: 'actual isolated acceptance envelope: four ordinary order UPSs through final ordinary claim observations; includes admission, sponsorship, deliberately repeated cold proofs, preserved pre-send read failure and operator resume, indexing and common-checkpoint polling; not normal optimized service throughput or chain TPS'};
save(output, {schema: 1, generatedAt: new Date().toISOString(), pairs, sums, ordinary, otherOrdinaryUps, formal, residentColdResourceConstruction,
 testEnvelope,
 emptyIntakeTimeout:existsSync(join(base,'public/maximum-empty-intake-timeout-v1.json'))?read(join(base,'public/maximum-empty-intake-timeout-v1.json')):null,
 accountingSnapshots:['maximum-assets-pre-orders.json','maximum-assets-before.json','maximum-assets-after.json'].map(file=>{const value=read(join(base,'public',file));return{source:'public/'+file,checkpoint:value.checkpoint,observation:value.observation??null,scope:'explicit cohort asset accounting, separately measured from UPS proving and confirmation; final after-claim audit is outside the reported order-to-last-claim envelope'};}),
 readOnlyRpcProbe: existsSync(join(base, 'public/rpc-read-latency-probe-v1.json')) ? read(join(base, 'public/rpc-read-latency-probe-v1.json')) : null,
 methodology: {sameMachine: true, sameBinaryAndRayonThreads: true, sameCompleteCallStackFeeNonceStartAndEndState: true,
  pairOrder: ['warm', 'cold'], warmOnlyBroadcast: true, samplesPerMarketAndOperation: 1,
  originalFortyCallControlledComparisonCompleted: false, cargoColdBuildMeasuredInThesePairs: false,
  offlineProvingIsChainTps: false, chainTps: null,
  limitations: ['Sequential warm-then-cold single pairs are susceptible to cache and order bias; no confidence interval.', 'No second proof job is intentionally run during each pair; host load is recorded, not globally controlled.', 'Resident retains pinned circuit resources but creates a fresh user/checkpoint/nonce/state session for every request.', 'Ordinary wallet claim process and confirmation observations are measured separately; server latency 0 is not end-to-end finality.', 'Broadcast-process time combines full saved-proof verification, fresh RPC checks and HTTP acknowledgement; pure transport time is not isolated.', 'The deliberate cold comparison is additional acceptance overhead; task wall must not be called normal optimized latency.']}});
