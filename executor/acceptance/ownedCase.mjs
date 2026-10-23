// Owned QA case support; explicit completed repairs only, no automatic resigning.
import assert from'node:assert/strict';import{existsSync,readFileSync,readdirSync}from'node:fs';import{join}from'node:path';import{createHash}from'node:crypto';
import{cohort}from'./candidateHarness.mjs';import{assertPreSessionFailure}from'./ordinaryEvidence.mjs';
import{assertDurableRuntimeDirectory}from'../runtimeStorage.mjs';
import{LiveMarket}from'../../batching/admission/liveMarket.mjs';import{ordinary,confirmUps,read,save}from'../../batching/admission/liveSupport.mjs';
import{publicState}from'../publicState.mjs';import{parseLosslessJson,FEE_ESCROW as F}from'../../amm/u124/client.mjs';import{sponsorCalls}from'../../batching/v2/client.mjs';
export function ownedCase(parent,original,base){
 assertDurableRuntimeDirectory(base);
 const h0=cohort(parent,original),h={...h0,base},digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
 const markets=h0.markets.map(m=>new LiveMarket({base,config:h.config,build:m.build,registration:m.registration,policy:m.policy,contracts:m.contracts,ordinaryBinary:h.ordinaryBinary,compactBinary:h.binary,env:h.env,actors:h.actors}));
 const by=Object.fromEntries(markets.map(m=>[m.kind,m])),at=(s,m,u,n,i=0)=>{const f=m.abi.contract.state.find(f=>f.name===n);assert.ok(f,'field '+n);return s.slot(u,m.id,f.offset+i);};
const user=async(actor,label,calls)=>{
 const marker=join(base,'public/local-proof-recoveries',label+'.json');
 if(existsSync(marker)){
  // Read-only adoption of an explicitly reviewed, ALREADY INCLUDED repair.
  // This path never retries, signs or broadcasts a failed ordinary operation.
  const r=read(marker),old=join(base,'attempts',label),out=join(base,'attempts',r.replacementLabel);
  assert.equal(r.actor,actor);assert.equal(r.originalLabel,label);assert.match(r.replacementLabel,/^[a-z0-9-]+-reviewed-v[1-9][0-9]*$/);
  assert.deepEqual(readdirSync(old),['failure.json']);assert.equal(digest(h.ordinaryBinary),r.binarySha256);assert.equal(r.binarySha256,'65d16ecf29db6d7d8c0a8204df9219a52976b488efaafa0511a8100d68e2f22a');
  const failure=read(join(old,'failure.json'));if(failure.phase!=='prove-ordinary-calls')assertPreSessionFailure(join(old,'failure.json'));assert.equal(failure.broadcastMayHaveBeenAttempted,false);assert.equal(failure.automaticRetry,false);
  for(const [p,sha]of Object.entries(r.files))assert.equal(digest(join(base,p)),sha,'reviewed recovery artifact changed');
  const prior=parseLosslessJson(readFileSync(join(base,'public',label+'.json'),'utf8')),next=parseLosslessJson(readFileSync(join(base,'public',r.replacementLabel+'.json'),'utf8'));
  assert.deepEqual(next.calls,prior.calls);assert.deepEqual(next.contracts,prior.contracts);
  const included=parseLosslessJson(readFileSync(join(out,'included.json'),'utf8'));assert.equal(included.userId,BigInt(h.actors[actor].id));assert.equal(included.preflight.fullUpsVerified,true);assert.equal(included.status,'included');assert.ok(included.commonCheckpoint>=included.checkpoint);assert.equal(included.contentHash,included.receipt.data.content_hash);assert.equal(included.endUserLeafHash,included.preflight.core.state_transition.end_user_leaf_hash);
  return out;
 }
 const out=join(base,'attempts',label);
 if(existsSync(join(out,'preflight.json'))){if(!existsSync(join(out,'included.json')))await confirmUps(h.config,out);return out;}
 assert.ok(!existsSync(join(base,'public',label+'.json')),'partial input requires inspection before any replacement');
 return ordinary({base,config:h.config,binary:h.ordinaryBinary,secret:h.actors[actor].secret,name:label,calls,bindings:h.bindings,env:h.env});
};

 const fundExact=async(ms,label,purpose=2)=>{
  const marker=join(base,'public',label+'-ready.json');if(existsSync(marker))return;
  const input=join(base,'public',label+'.json'),calls=[],adopted=[],amount=purpose===1?2n*F:F;
  if(!existsSync(input)){
   const s=await publicState(h.config),id=h.actors.sponsor.id;
   for(const m of ms){const sent=await s.slot(id,0,3+2*m.vault),claimed=await s.slot(m.vault,0,4+2*id),settled=await at(s,m,m.vault,'settled_fee',id),nonce=await at(s,m,id,'sponsor_nonce');assert.equal(claimed,settled);
    if(sent!==claimed){assert.equal(sent-claimed,amount,'never blindly add another grant');assert.equal(await at(s,m,id,'sponsor_pool'),BigInt(m.vault));assert.equal(await at(s,m,id,'sponsor_amount'),amount);assert.equal(await at(s,m,id,'sponsor_purpose'),BigInt(purpose));assert.ok(nonce>await at(s,m,m.vault,'used_sponsorship',id));adopted.push({market:m.id,amount,nonce});}
    else calls.push(...sponsorCalls({marketId:BigInt(m.id),abi:m.abi,vaultId:BigInt(m.vault),nonce:nonce+1n,purpose:BigInt(purpose),amount}));
   }
  }
  if(calls.length||existsSync(input))await user('sponsor',label,calls);
  save(marker,{at:new Date().toISOString(),markets:ms.map(m=>m.id),amount,purpose,adopted,scope:'one exact new grant or verified existing unused grant; no blind top-up'});
 };
 const spec={...h.assetSpec,users:[...h.assetSpec.users,2036928]};assert.equal(new Set(spec.users).size,spec.users.length);
 return{...h,markets,by,at,user,fundExact,spec};
}
