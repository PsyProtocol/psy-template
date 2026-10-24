// Explicit continuation after a saved SDK session READ failure. No automatic
// financial retry; original included identities and failed artifacts remain.
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {financialHarness} from './financialHarness.mjs';
import {controllerDirectory} from './controllerDirectory.mjs';
import {prepareOwnerClaim} from '../client.mjs';
import {read,save} from '../../batching/admission/liveSupport.mjs';
import {parseLosslessJson,decodeAmount,FEE_ESCROW as F} from '../../amm/u124/client.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
const [base,failed,label]=process.argv.slice(2);assert.match(label??'',/^v[1-9][0-9]*$/);
const home=join(controllerDirectory(base),'partial-recovery'),reg=read(join(home,'build/REGISTERED.json'));
const rel=relative(join(home,'runtime/composition'),resolve(failed));assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));
const failure=read(join(failed,'failure.json'));assert.equal(failure.ok,false);assert.equal(failure.phase,'start-compact-session');assert.equal(failure.broadcastMayHaveBeenAttempted,false);assert.equal(failure.automaticRetry,false);assert.match(failure.reason,/^Connection error to https:\/\/realm1-stg\.psy-protocol\.xyz:/);
for(const name of ['request.json','intent.json','receipt.json','preflight.json'])assert.equal(existsSync(join(failed,name)),false,'no incomplete financial proof may be silently replaced');
const exact=p=>parseLosslessJson(readFileSync(p,'utf8'));
const principal=exact(join(base,'public/composition-partial-recovery-unaccepted-hop-2-return-principal-formal-result.json'));assert.equal(principal.result.status,'included');
const prior=['fund','open-1','consent-1','success-1','open-2','cancel-2','recover-2'];
const paths=prior.map(op=>join(home,'public','composition-partial-recovery-'+op+'-v1-formal-result.json'));
const hashes=Object.fromEntries(paths.map(p=>[p,sha256(readFileSync(p))]));
const f=await financialHarness(base,'partial-recovery');
try{
 await f.journal.reconcile(f.adapter.reconcile);assert.equal((await f.journal.unresolved()).length,0,'unknown original broadcast must reconcile first');
 const records=await f.journal.records(),broadcasts=records.filter(r=>r.status==='broadcast-intent');
 for(const p of paths){const r=exact(p);assert.equal(r.result.status,'included');assert.equal(r.task.intentId,f.adapter.model.intent.id);assert.ok(broadcasts.some(b=>b.taskId===r.taskId));}
 const allowed=[...prior,'recovered-2','return-middle'];
 for(const b of broadcasts){assert.equal(b.task.intentId,f.adapter.model.intent.id);assert.ok(allowed.includes(b.task.operation));}
 const unique=new Set(broadcasts.map(b=>b.taskId));assert.equal(unique.size,broadcasts.length);
 const before=await f.adapter.snapshot(),V=reg.vaultId,C=reg.controllerId,model=f.adapter.model,abi=model.controllerAbi;
 const at=n=>before.slot(V,C,abi.contract.state.find(x=>x.name===n).offset);
 const phase=await at('phase');assert.ok([5n,7n,99n].includes(phase));assert.equal(await at('owner'),model.intent.terms.owner);assert.equal(await at('intent_nonce'),1n);
 const realm=before.network.realm_configs.find(r=>r.id===Math.floor(V/before.network.users_per_realm)),leaf=await before.rpc(realm.rpc_url[0],'psy_get_user_leaf_data',{checkpoint_id:before.checkpoint,user_id:V},{exactIntegers:true});
 assert.equal(leaf.nonce,BigInt(unique.size),'only exact known included controller transitions may precede this continuation');
 save(join(home,'public','EXPLICIT-READ-RECOVERY-'+label+'.json'),{checkedAt:new Date().toISOString(),checkpoint:before.checkpoint,phase,nonce:leaf.nonce,originalTaskIds:[...unique],originalReportSha256:hashes,failureSha256:sha256(readFileSync(join(failed,'failure.json'))),sdkManifestHash:f.o.sdkManifestHash,scope:'explicit new process after observed pre-broadcast session read failure, exact included ledger and current nonce; original requests not replayed; fresh state/witness required'});
 await f.step('recovered-2');await f.step('return-middle');
 const outboxPath=join(home,'public/FINAL-OWNER-OUTBOX-v1.json'),pending=existsSync(outboxPath)?exact(outboxPath):await prepareOwnerClaim(f.adapter);
 assert.equal(pending.status,'owner-signature-required');if(!existsSync(outboxPath))save(outboxPath,pending);
 await f.ownerClaim();assert.equal((await prepareOwnerClaim(f.adapter)).status,'owner-outboxes-claimed');
 const s=await f.adapter.snapshot(),field=n=>s.slot(V,C,abi.contract.state.find(x=>x.name===n).offset);
 assert.equal(await field('phase'),99n);assert.equal(await s.slot(V,0,0),0n);
 const assets=await Promise.all([model.assetA,model.assetB].map(async asset=>({asset,balance:decodeAmount(await Promise.all([0,1].map(j=>s.slot(V,Number(asset),j))))})));
 for(const a of assets)assert.equal(a.balance,0n);
 const fees=await field('fees'),budget=await field('budget'),refund=await s.slot(V,0,3+2*reg.owner.userId),middle=decodeAmount(await Promise.all([0,1].map(j=>s.slot(V,C,abi.contract.state.find(x=>x.name==='middle').offset+j))));
 const amount=pending.pending.find(p=>p.asset===model.assetB)?.amount;assert.equal(amount,middle+1n);assert.equal(budget,fees+refund+F);
 const actual=new Map((await f.journal.records()).filter(r=>r.status==='included').map(r=>[r.taskId,r.result]));assert.equal(actual.size,9);assert.equal([...actual.values()].reduce((n,r)=>n+BigInt(r.receipt.data.result.fees_collected),0n),fees);
 for(const [p,hash] of Object.entries(hashes))assert.equal(sha256(readFileSync(p)),hash,'original included report changed');
 save(join(home,'public/LIVE-ROUTE-COMPLETE-v1.json'),{checkedAt:new Date().toISOString(),checkpoint:s.checkpoint,scenario:'partial-recovery',outcome:'second-hop-unaccepted-cancelled',marketFills:1,intentId:model.intent.id,input:model.intent.terms.input,received:{asset:model.assetB,amount},initializationRefund:{asset:model.assetB,amount:1n},routePrincipal:{asset:model.assetB,amount:middle},owner:reg.owner.userId,vaultId:V,controllerId:C,nativeAccounting:{budget,controllerReceiptBurn:fees,ownerRefund:refund,netMarketEscrow:F,scope:'exact controller budget/refund/receipt burn and filled first-hop escrow; ordinary/base/sponsor charges separately audited'},ordinaryOwnerClaimIncluded:true,controllerPhase:99,controllerNative:0n,controllerAssets:assets,atomic:false,scope:'first AMM trade confirmed; second hop cancelled without admission, sender-bound principal/escrow refund and ordinary owner claim; explicit read-failure continuation never replays first trade or original funding'});
 console.log('actual partial-trade compensation and ordinary owner claim complete after explicit read recovery');
}finally{await f.close();}
