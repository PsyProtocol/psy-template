// Read-only finalization after an explicitly resumed partial recovery. No
// financial child is started and no earlier runner/log is overwritten.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {run,save} from '../../batching/admission/liveSupport.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {controllerDirectory} from './controllerDirectory.mjs';
const [base]=process.argv.slice(2);assert.ok(base);
const home=controllerDirectory(base),exact=p=>parseLosslessJson(readFileSync(p,'utf8'));
const p=join(home,'partial-recovery/public/LIVE-ROUTE-COMPLETE-v1.json');
let ready=false;for(let i=0;i<1080;i++){if(existsSync(p)){ready=true;break;}await new Promise(r=>setTimeout(r,10000));}assert.ok(ready,'ordinary compensation claim still incomplete');
const [success,recovery,partialRecovery]=['success','recovery','partial-recovery'].map(name=>exact(join(home,name,'public/LIVE-ROUTE-COMPLETE-v1.json')));
for(const r of [success,recovery,partialRecovery]){assert.equal(r.ordinaryOwnerClaimIncluded,true);assert.equal(r.controllerPhase,99n);assert.equal(r.controllerNative,0n);assert.equal(r.atomic,false);for(const a of r.controllerAssets)assert.equal(a.balance,0n);}
assert.equal(recovery.marketFills,0n);assert.equal(partialRecovery.marketFills,1n);assert.equal(partialRecovery.outcome,'second-hop-unaccepted-cancelled');
const file=fileURLToPath(new URL('./routeAccounting.mjs',import.meta.url)),root=dirname(base),args=[base,'COMPOSITION-RECOVERY-AUDIT-v1'];
save(join(root,'composition-final-accounting-v2-INPUTS.json'),{checkedAt:new Date().toISOString(),script:file,scriptSha256:sha256(readFileSync(file)),arguments:args,broadcast:false});
await run(process.execPath,[file,...args],join(root,'composition-final-accounting-v2.log'),{});
save(join(base,'public/INITIALIZED-LIVE-ACCEPTANCE-COMPLETE-v1.json'),{checkedAt:new Date().toISOString(),success,recovery,partialRecovery,scope:'actual two-pool success, zero-fill expired-intake refund and one-fill middle-asset compensation, all ordinary final claims and exact known-cohort conservation; separate UPSs, no cross-vault atomicity or production qualification'});
console.log('three terminal actual outcomes and whole-cohort funding/fees conserved');
