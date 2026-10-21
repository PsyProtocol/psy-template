// Bounded explicit QA recovery through the production adapter/journal. No
// unknown send is retried and no old proof/task window is rewritten.
import assert from 'node:assert/strict';import {existsSync,readdirSync} from 'node:fs';import {join} from 'node:path';
import {read,save} from '../../batching/admission/liveSupport.mjs';import {publicState} from '../publicState.mjs';
import {parseLosslessJson,FEE_ESCROW as F} from '../../amm/u124/client.mjs';import {sponsorCalls} from '../../batching/v2/client.mjs';
import {runRecoveryRounds} from './recoveryRounds.mjs';import {recoveryGrant} from './recoveryGrant.mjs';
export async function enrolledRecovery(h,services,{prefix,owners,maxGrantsPerMarket=2,maxRounds=12},readState=publicState) {
 assert.match(prefix,/^[a-z][a-z0-9-]+$/);assert.ok(owners.length>0&&owners.every(id=>Number.isSafeInteger(id)&&id>0));
 assert.ok(Number.isSafeInteger(maxGrantsPerMarket)&&maxGrantsPerMarket>0&&maxGrantsPerMarket<=4);
 const files=()=>readdirSync(join(h.base,'public')),done=m=>files().some(n=>n.startsWith(prefix+'-'+m.kind+'-done-'));
 const independent=async jobs=>{const r=await Promise.allSettled(jobs.map(f=>f()));const fail=r.find(x=>x.status==='rejected');if(fail)throw fail.reason;};
 await runRecoveryRounds({maxRounds,isComplete:()=>h.markets.every(done),scanRound:async round=>{
  const work=[],needsGas=[];
  for(let i=0;i<services.length;i++){
   const f=services[i],m=h.markets[i],label=prefix+'-'+m.kind+'-'+round;
   if(done(m)||existsSync(join(h.base,'public',label+'-formal-result.json')))continue;
   const scan=await f.adapter.scan();
   if(!scan.action){
    if(scan.reason==='recovery-gas-sponsorship-required'){
     assert.equal(scan.fundingRequest.requiredTotal,(2n*F).toString());
     const markers=files().filter(n=>n.startsWith(prefix+'-gas-')&&n.endsWith('-ready.json')).map(n=>read(join(h.base,'public',n))).filter(r=>r.markets.includes(m.id));
     assert.ok(existsSync(join(h.base,'public',prefix+'-gas-'+round+'-ready.json'))||markers.length<maxGrantsPerMarket,'bounded sponsorship exhausted; inspect');needsGas.push(m);work.push({f,m,label,op:'fund_gas'});continue;
    }
    assert.ok(['admission-plan-not-next-epoch','epoch-complete'].includes(scan.reason),'unresolved recovery: '+scan.reason);
    save(join(h.base,'public',prefix+'-'+m.kind+'-done-'+round+'.json'),{checkedAt:new Date().toISOString(),scope:'explicit enrolled hint exhaustion only; final asset audit still required'});continue;
   }
   const op=parseLosslessJson(scan.action.submission).contract_calls.find(c=>['fund_gas','recover_funding','recover_nft'].includes(c.method_name));assert.ok(op,'unexpected recovery operation');
   if(op.method_name!=='fund_gas')assert.ok(owners.some(id=>BigInt(id)===op.inputs[0]),'sender outside recovery scope');work.push({f,m,label,op:op.method_name});
  }return {work,needsGas};
 },executeRound:async({work,needsGas},round)=>{
  if(needsGas.length){
   const label=prefix+'-gas-'+round,marker=join(h.base,'public',label+'-ready.json');
   if(!existsSync(marker)){
    for(const f of services){await f.journal.reconcile(f.adapter.reconcile);assert.equal((await f.journal.unresolved()).length,0,'unknown send blocks new sponsorship');}
    const input=join(h.base,'public',label+'.json'),adopted=[],calls=[];
    if(!existsSync(input)){
     const s=await readState(h.config),id=h.actors.sponsor.id;
     for(const m of needsGas){const at=n=>s.slot(id,m.id,m.abi.contract.state.find(x=>x.name===n).offset),own=n=>s.slot(m.vault,m.id,m.abi.contract.state.find(x=>x.name===n).offset+id);
      const values=await Promise.all([s.slot(id,0,3+2*m.vault),s.slot(m.vault,0,4+2*id),own('settled_fee'),at('sponsor_pool'),at('sponsor_amount'),at('sponsor_nonce'),own('used_sponsorship'),at('sponsor_purpose')]);
      const grant=recoveryGrant(Object.fromEntries(['sent','claimed','settledFee','pool','amount','nonce','used','purpose'].map((k,i)=>[k,values[i]])),m.vault);
      if(grant.adopt)adopted.push({market:m.id,vault:m.vault,...grant});else calls.push(...sponsorCalls({marketId:BigInt(m.id),abi:m.abi,vaultId:BigInt(m.vault),nonce:grant.nonce,purpose:2n,amount:grant.amount}));
     }
    }
    if(calls.length||existsSync(input))await h.user('sponsor',label,calls);
    save(marker,{completedAt:new Date().toISOString(),markets:needsGas.map(m=>m.id),amountPerMarket:2n*F,adopted});
   }
  }
  await independent(work.map(({f,label,op})=>()=>f.step(label,t=>t.kind==='batch_maintenance'&&parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name===op))));
 }});
}
