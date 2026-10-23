// Explicit recovery after the observed pre-broadcast admission timeout.
// No batch is renewed and no original financial request is retried.
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {marketHarness, formal, methodTask, exact} from './marketHarness.mjs';
import {financialHarness} from './financialHarness.mjs';
import {controllerDirectory} from './controllerDirectory.mjs';
import {prepareOwnerClaim} from '../client.mjs';
import {read, save} from '../../batching/admission/liveSupport.mjs';
import {publicState} from '../../executor/publicState.mjs';
import {decodeAmount,losslessJson} from '../../amm/u124/client.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
const [base] = process.argv.slice(2), h = await marketHarness(base);
const home = join(controllerDirectory(base),'recovery'), reg = read(join(home,'build/REGISTERED.json'));
const review = read(join(base,'public/RECOVERY-ADMISSION-FAILURE-STATE-v1.json'));
assert.equal(review.market.queue_count,0);
assert.equal(review.market.queue_phase,1);
assert.ok(review.checkpoint > review.market.queue_cutoff);
const failed = join(base,'runtime/compact/sepolia/1012928/8a57299c804a8edf5001b0b639c4b72afab42be9d0ee692a083484c702e0c398/proof-27c2cc9e-6786-46ef-80c3-b8f14c78189c');
const rejection = read(join(failed,'failure.json'));
assert.equal(rejection.broadcastMayHaveBeenAttempted,false);
assert.equal(rejection.phase,'prove-compact-calls');
for (const name of ['request.json','intent.json','receipt.json']) assert.equal(existsSync(join(failed,name)),false);
const m = h.markets[0], augmented = {...h,actors:{...h.actors,component:{id:reg.vaultId}}};
const b = await formal(augmented,m,'composition-recovery-hop-1',read(join(home,'public/composition-recovery-hop-1-admission-plan.json')),{performanceMetrics:true});
let f;
try {
  // Independent account preparations overlap. The only mutation is the
  // explicitly expired EMPTY epoch abort using its exact pending gas grant.
  const initializing = financialHarness(base,'recovery');
  const aborting = b.step('composition-recovery-hop-1-empty-abort-v1',methodTask('abort_empty_epoch'));
  const prepared = await Promise.allSettled([initializing,aborting]);
  if (prepared[0].status === 'fulfilled') f = prepared[0].value;
  const failedPreparation = prepared.find(r => r.status === 'rejected');
  if (failedPreparation) throw failedPreparation.reason;
  await f.journal.reconcile(f.adapter.reconcile);
  assert.equal((await f.journal.unresolved()).length,0);
  await f.ownerCancel();
  await f.step('cancel-1');
  await f.step('recover-1');
  const refundLabel='composition-recovery-hop-1-timeout-return-principal-v1';
  // An already persisted task must reconcile its original identity. A terminal
  // refund no longer appears in a fresh scan; absence cannot imply resending.
  if(!existsSync(join(base,'public',refundLabel+'-formal-task.json')) &&
     !existsSync(join(base,'public',refundLabel+'-formal-result.json'))) {
    const scan = await b.adapter.scan();
    assert.ok(scan.action && methodTask('recover_funding')(scan.action),
      'sender-bound refund requires reviewed available treasury gas; do not invent a top-up');
  }
  await b.step(refundLabel,methodTask('recover_funding'));
  await f.step('recovered-1');
  await f.step('return-input');
  const outbox = join(home,'public/FINAL-OWNER-OUTBOX-v1.json');
  const pending = existsSync(outbox) ? exact(outbox) : await prepareOwnerClaim(f.adapter);
  assert.equal(pending.status,'owner-signature-required');
  if(!existsSync(outbox))save(outbox,pending);
  await f.ownerClaim();
  assert.equal((await prepareOwnerClaim(f.adapter)).status,'owner-outboxes-claimed');
  const s = await f.adapter.snapshot(), model = f.adapter.model, V = reg.vaultId;
  const at = name => s.slot(V,reg.controllerId,model.controllerAbi.contract.state.find(x=>x.name===name).offset);
  assert.equal(await at('phase'),99n);
  const budget = await at('budget'), fees = await at('fees'), refund = await s.slot(V,0,3+2*reg.owner.userId);
  assert.equal(budget,fees+refund,'unexecuted order escrow returned completely');
  const receipts = new Map((await f.journal.records()).filter(r=>r.status==='included').map(r=>[r.taskId,r.result]));
  assert.equal([...receipts.values()].reduce((n,r)=>n+BigInt(r.receipt.data.result.fees_collected),0n),fees);
  const assets = await Promise.all([model.assetA,model.assetB].map(async asset=>({asset,
    balance:decodeAmount(await Promise.all([0,1].map(j=>s.slot(V,Number(asset),j))))})));
  assert.equal(await s.slot(V,0,0),0n);for(const a of assets)assert.equal(a.balance,0n);
  const report = {
    checkedAt:new Date().toISOString(),checkpoint:s.checkpoint,scenario:'recovery',
    outcome:'first-hop-admission-timeout-cancelled-and-refunded',marketFills:0,
    intentId:model.intent.id,input:model.intent.terms.input,owner:reg.owner.userId,
    vaultId:V,controllerId:reg.controllerId,received:{asset:model.assetA,amount:model.intent.terms.input.amount},
    routePrincipal:{asset:model.assetA,amount:model.intent.terms.input.amount},
    initializationRefund:{asset:model.assetB,amount:1n},
    nativeAccounting:{budget,controllerReceiptBurn:fees,ownerRefund:refund,netMarketEscrow:0n,
      scope:'original input/escrow fully returned; actual controller fees remain spent; ordinary/base/sponsor fees separately audited'},
    ordinaryOwnerClaimIncluded:true,controllerPhase:99,controllerNative:0n,controllerAssets:assets,atomic:false,
    failedProofSha256:sha256(readFileSync(join(failed,'failure.json'))),
    scope:'actual expired empty intake, no admission broadcast or market fill; explicit owner cancellation, empty abort and sender-bound refunds, ordinary owner received original QA-A/one-unit QA-B/native remainder; not the later partial-trade scenario'};
  const completed = join(home,'public/LIVE-ROUTE-COMPLETE-v1.json');
  if(!existsSync(completed))save(completed,report);
  else {
    const original=exact(completed);
    for(const name of ['scenario','outcome','intentId','received','routePrincipal','initializationRefund','nativeAccounting','ordinaryOwnerClaimIncluded','controllerPhase','controllerNative','controllerAssets','failedProofSha256'])
      assert.equal(losslessJson(report[name]),losslessJson(original[name]),'completed original refund changed: '+name);
    assert.ok(BigInt(report.checkpoint)>=original.checkpoint);
  }
  console.log('actual timed-out first hop refunded and ordinarily claimed');
} finally {
  if(f) await f.close();
  await b.close();
}
