// Read-only terminal acceptance for the known isolated two-AMM profile. Never
// prepares proofs, signs, submits, changes configuration or updates contracts.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {publicState} from '../../executor/publicState.mjs';
import {read,save,binding,contractBinding} from '../../batching/admission/liveSupport.mjs';
import {parseLosslessJson,decodeAmount} from '../../amm/u124/client.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {controllerDirectory} from './controllerDirectory.mjs';
import {COMPOSITION_MAGIC,COMPOSITION_SDK} from '../contract/runtimePolicy.mjs';
const [base,out]=process.argv.slice(2);
assert.ok(base&&out);
const exact=p=>parseLosslessJson(readFileSync(p,'utf8'));
const completedPath=join(base,'public/INITIALIZED-LIVE-ACCEPTANCE-COMPLETE-v1.json');
const completed=exact(completedPath),auditPath=join(base,'public/COMPOSITION-RECOVERY-AUDIT-v1.json'),audit=exact(auditPath);
const s=await publicState(join(base,'public/rpc.json'));
assert.equal(BigInt(s.network.magic),COMPOSITION_MAGIC);
assert.ok(BigInt(s.checkpoint)>=audit.checkpoint);
const expected=new Map(),pools=['hop-1','hop-2'].map(name=>{
 const p=join(base,'pools',name,'build'),r=read(join(p,'live-registration.json'));
 for(const b of r.contracts){const old=expected.get(b.contract.contractId);if(old)assert.deepEqual(old,b);expected.set(b.contract.contractId,b);}
 return {id:r.marketId,vault:r.vaultId,abi:read(join(p,'compiled/compilation_artifact.json')).abi};
});
const home=controllerDirectory(base),controllers=[];
const wide=(u,c,o)=>Promise.all([0,1].map(j=>s.slot(u,c,o+j))).then(decodeAmount);
for(const [name,done] of [['success',completed.success],['recovery',completed.recovery],['partial-recovery',completed.partialRecovery]]){
 assert.equal(done.ordinaryOwnerClaimIncluded,true);assert.equal(done.controllerPhase,99n);assert.equal(done.atomic,false);
 const local=join(home,name),reg=read(join(local,'build/REGISTERED.json')),o=read(join(local,'route/executor.json'));
 assert.equal(o.sdkManifestHash,COMPOSITION_SDK);assert.equal(BigInt(reg.vaultId),done.vaultId);assert.equal(BigInt(reg.owner.userId),done.owner);
 expected.set(reg.controllerId,contractBinding(reg.controllerId,reg.deployment.leaf));
 const abi=read(join(local,'route/controller-abi.json')),state=await s.fields(reg.vaultId,reg.controllerId,abi,['phase','owner','intent_nonce','consent_sent']);
 assert.equal(state.phase,99n);assert.equal(state.owner,done.owner);assert.equal(state.intent_nonce,1n);
 assert.equal(await s.slot(reg.vaultId,0,0),0n);
 const assets=[];for(const m of o.assetMetadata){const balance=await wide(reg.vaultId,m.contractId,0);assert.equal(balance,0n);assets.push({asset:m.contractId,balance});}
 const flows=audit.outboxes.filter(r=>r.from===done.vaultId||r.to===done.vaultId);
 assert.equal(flows.length,2*(audit.users.length-1));
 for(const f of flows){assert.equal(f.native,0n,'known-flow native residual');for(const t of f.ft)assert.equal(t.pending,0n,'known-flow FT residual');}
 controllers.push({scenario:name,controller:reg.controllerId,vault:reg.vaultId,owner:reg.owner.userId,state,assets,native:0n,knownDirectedFlowsWithoutResidual:flows.length});
}
const pHome=join(home,'partial-recovery'),review=exact(join(pHome,'route/PLAN-REVIEW.json'));
const traded=exact(join(base,'public/PARTIAL-FIRST-TRADE-SETTLED-v1.json')),reserves=[];
for(const [j,p] of pools.entries()){
 const offsets=new Map(p.abi.contract.state.map(f=>[f.name,f.offset]));
 const row={market:p.id,vault:p.vault,a:await wide(p.vault,p.id,offsets.get('reserve_a')),b:await wide(p.vault,p.id,offsets.get('reserve_b'))};
 const want=j===0?traded.reserves:{a:review.snapshots[1].reserveA,b:review.snapshots[1].reserveB};
 assert.equal(row.a,want.a,j===0?'no extra first-pool fill':'second pool must not trade');
 assert.equal(row.b,want.b,j===0?'no extra first-pool fill':'second pool must not trade');reserves.push(row);
}
const done=completed.partialRecovery,V=Number(done.vaultId),p2=pools[1];
const partial=controllers.find(r=>r.scenario==='partial-recovery');
// Base release clears its admission fields, so their terminal zeros alone do
// not prove absence of prior consent. The dedicated controller never resets
// consent_sent after preparing hop 2, and every actual controller UPS is known.
assert.equal(partial.state.consent_sent,0n);
const realm=s.network.realm_configs.find(r=>r.id===Math.floor(V/s.network.users_per_realm));
const leaf=await s.rpc(realm.rpc_url[0],'psy_get_user_leaf_data',{checkpoint_id:s.checkpoint,user_id:V},{exactIntegers:true});
const actualControllerReceipts=audit.newReceipts.filter(r=>r.userId===done.vaultId);
assert.equal(actualControllerReceipts.length,9);assert.equal(new Set(actualControllerReceipts.map(r=>r.contentHash)).size,9);assert.equal(leaf.nonce,9n);
const order=await s.fields(V,p2.id,p2.abi,['kind','nonce','admission_nonce','admission_epoch']);
assert.equal(order.kind,0n);assert.equal(order.nonce,1n);assert.equal(order.admission_nonce,0n);assert.equal(order.admission_epoch,0n);
const bindings=[];for(const [id,want] of expected){assert.deepEqual(await binding(s,id),want,'terminal code/layout/function identity changed');bindings.push(want);}
save(out,{checkedAt:new Date().toISOString(),checkpoint:s.checkpoint,acceptanceSha256:sha256(readFileSync(completedPath)),cohortAuditSha256:sha256(readFileSync(auditPath)),sdkManifestHash:COMPOSITION_SDK,controllers,reserves,unacceptedSecondOrder:order,secondHopConsentSent:partial.state.consent_sent,actualControllerNonce:leaf.nonce,knownControllerReceiptHashes:actualControllerReceipts.map(r=>r.contentHash),bindings,broadcast:false,
 scope:'terminal public state and known authorized cohort-directed residuals; first pool matches the recorded partial-case fill, second reserves unchanged, no second consent in the known nine-UPS controller lifecycle; exact current code/layout/function identities; not global inventory, independent finality/runtime attestation or cross-UPS atomicity'});
console.log('three terminal controllers, known-flow residuals, exact reserves and no second admission checked');
