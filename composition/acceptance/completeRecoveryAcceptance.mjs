// Continuation after an explicitly inspected pre-broadcast intake timeout.
// Existing success/timeout reports are prerequisites, never replayed operations.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {read,save,run} from '../../batching/admission/liveSupport.mjs';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {controllerDirectory} from './controllerDirectory.mjs';
const [base,release,inspector] = process.argv.slice(2);
assert.ok(base && release && inspector);
const root=dirname(base), home=controllerDirectory(base), here=dirname(fileURLToPath(import.meta.url));
const exact=p=>parseLosslessJson(readFileSync(p,'utf8'));
const wait=async p=>{for(let i=0;i<1080;i++){
  if(existsSync(p))return exact(p);
  await new Promise(r=>setTimeout(r,10000));
}throw Error('prerequisite unavailable; no financial request repeated: '+p);};
const terminal=report=>{
  assert.equal(report.ordinaryOwnerClaimIncluded,true);
  assert.equal(report.controllerPhase,99n);
  assert.equal(report.controllerNative,0n);
  for(const asset of report.controllerAssets)assert.equal(asset.balance,0n);
  assert.equal(report.atomic,false);
};
const success=await wait(join(home,'success/public/LIVE-ROUTE-COMPLETE-v1.json'));
terminal(success);
const recovery=await wait(join(home,'recovery/public/LIVE-ROUTE-COMPLETE-v1.json'));
terminal(recovery);
assert.equal(recovery.outcome,'first-hop-admission-timeout-cancelled-and-refunded');
assert.equal(recovery.marketFills,0n);
await wait(join(home,'partial-recovery/build/REGISTERED.json'));
const invoke=async (name,args,label)=>{
 const script=join(here,name),log=join(root,label+'.log'),plan=log+'-INPUTS.json';
 assert.ok(!existsSync(log)&&!existsSync(plan),'prior child invocation needs exact review');
 save(plan,{checkedAt:new Date().toISOString(),script,scriptSha256:sha256(readFileSync(script)),
   arguments:args,scope:'one explicit continuation; failure halts, no automatic re-prove/re-broadcast'});
 await run(process.execPath,[script,...args],log,{PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'});
};
await invoke('routeAccounting.mjs',[base,'COMPOSITION-TIMEOUT-AUDIT-v1'],'composition-timeout-accounting-v1');
assert.ok(!existsSync(join(home,'partial-recovery/route/executor.json')),
 'new route already exists; inspect exact original state, never replace it');
await invoke('routeSetup.mjs',[base,'partial-recovery',release,inspector],'composition-partial-route-setup-v1');
await invoke('executeRoute.mjs',[base,'partial-recovery'],'composition-partial-route-execute-v1');
const partialRecovery=exact(join(home,'partial-recovery/public/LIVE-ROUTE-COMPLETE-v1.json'));
terminal(partialRecovery);
assert.equal(partialRecovery.outcome,'second-hop-unaccepted-cancelled');
assert.equal(partialRecovery.marketFills,1n);
await invoke('routeAccounting.mjs',[base,'COMPOSITION-RECOVERY-AUDIT-v1'],'composition-final-accounting-v1');
save(join(base,'public/INITIALIZED-LIVE-ACCEPTANCE-COMPLETE-v1.json'),{
 checkedAt:new Date().toISOString(),success,recovery,partialRecovery,
 scope:'actual two-AMM success, expired empty-intake principal refund and first-trade/middle-asset compensation, all ordinary owner claims; separate UPSs, no cross-vault atomicity or production qualification'});
console.log('three actual terminal outcomes, ordinary claims and complete explicit cohort conservation');
