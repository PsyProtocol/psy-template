// Explicit isolated-testnet driver. Uses fresh, root-bound deployments only.
// A failed/unknown submission stops the driver; it never retries a mutation.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {read,save,run,binding,contractBinding,ordinary,confirmUps,confirmRegistration} from './liveSupport.mjs';
import {publishRegistration} from './registrationPublication.mjs';
import {bindAdmission} from './build.mjs';
import {scanAdmission,queueMaintenance} from './reader.mjs';
import {publicState} from '../../executor/publicState.mjs';
import {call,parseLosslessJson,FEE_ESCROW} from '../../amm/u124/client.mjs';
import {sponsorCalls} from '../v2/client.mjs';
export class LiveMarket {
 constructor({base,config,build,policy,registration,contracts,ordinaryBinary,compactBinary,env,actors}){Object.assign(this,{base,config,build,policy,registration,contracts,ordinaryBinary,compactBinary,env,actors});const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');for(const [p,h]of Object.entries(read(join(build,'BUILD.json')).files))assert.equal(hash(join(build,p)),h,'frozen build changed');assert.equal(hash(join(build,'bound/policy.json')),read(join(build,'bound/BOUND.json')).policySha256,'bound policy changed');this.artifact=read(join(build,'compiled/compilation_artifact.json'));this.abi=this.artifact.abi;this.driverConfig=read(join(build,'config.json'));assert.equal(policy.market_id,registration.marketId);assert.deepEqual(policy.config,this.driverConfig);this.bindings=new Map(contracts.map(c=>[c.contract.contractId,c]));assert.equal(this.bindings.size,contracts.length,'duplicate dependency binding');this.kind=policy.market;this.id=policy.market_id;this.vault=registration.vaultId;}
 options(){return {kind:this.kind,contractId:this.id,vaultId:this.vault,rpcConfig:this.config,batchSponsorId:this.actors.sponsor.id,activationPayerId:this.actors.bob.id,automaticInitialize:true,batchExpiryCheckpoints:96};}
 async scan(name){const result=await scanAdmission(this.options(),publicState,{abi:this.abi,config:this.driverConfig,policy:this.policy});save(join(this.base,'public',name+'.scan.json'),result);return result;}
 async user(actor,name,calls){return ordinary({base:this.base,config:this.config,binary:this.ordinaryBinary,secret:this.actors[actor].secret,name,calls,bindings:this.bindings,env:this.env});}
 async compact(name,request,validUntilCheckpoint,{confirm=true}={}){
  const s=await publicState(this.config);for(const c of this.contracts)assert.deepEqual(await binding(s,c.contract.contractId),c,'frozen root changed');
  const {fingerprint,publicKeyHash,vaultId}=this.registration;
  const guard={identity:{version:1,network:s.networkName,marketId:this.id,vaultId,fingerprint,publicKeyHash,contracts:this.contracts.map(c=>c.contract)},dependencies:this.contracts,validUntilCheckpoint};
  const input=join(this.base,'public',name+'.calls.json'),guardPath=join(this.base,'public',name+'.guard.json'),out=join(this.base,'attempts',name);save(input,request);save(guardPath,guard);
  const timing=await run(this.compactBinary,['submit',join(this.build,'bound/policy.json'),this.config,input,guardPath,out],join(this.base,name+'.log'),this.env);save(join(out,'timing.json'),timing);if(confirm)await confirmUps(this.config,out);return out;
 }
 async action(name){const scan=await this.scan(name);assert.ok(scan.action,'no executable action: '+scan.reason);return this.compact(name,parseLosslessJson(scan.action.submission),Number(scan.action.validUntilCheckpoint));}
 async sponsor(name,purpose){const s=await publicState(this.config),f=this.abi.contract.state.find(x=>x.name==='sponsor_nonce');assert.ok(f);const nonce=await s.slot(this.actors.sponsor.id,this.id,f.offset)+1n;return this.user('sponsor',name,sponsorCalls({marketId:BigInt(this.id),abi:this.abi,vaultId:BigInt(this.vault),nonce,purpose:BigInt(purpose),amount:BigInt(purpose)===1n?2n*FEE_ESCROW:FEE_ESCROW,nativeProtocol:this.policy.native_protocol??'legacy-v1'}));}
 async maintenance(name,method,a,b=0n){await this.sponsor(name+'-fund',2);const s=await publicState(this.config);return this.compact(name,queueMaintenance(this.policy,{name:method,payer:BigInt(this.actors.sponsor.id),a:BigInt(a),b:BigInt(b)}),s.checkpoint+96);}
 order(name,args){return call(BigInt(this.id),this.abi,name,args);}
 async snapshot(name){const s=await publicState(this.config),names=['batch_ready','batch_id','batch_phase','queue_epoch','queue_phase','queue_cutoff','queue_count','queue_root','queue_history','queue_owner','queue_nonce','queue_outcome','batch_root','frozen_cancelled','frozen_nonce','consumed','reserve_a','reserve_b','total_shares','phase','sold_lots','quote_reserve'];const fields={};
  await Promise.all(names.map(async n=>{const f=this.abi.contract.state.find(x=>x.name===n);if(!f)return;const width=n==='consumed'?0:['queue_owner','queue_nonce','queue_outcome','queue_root','queue_history','batch_root','frozen_cancelled','frozen_nonce'].includes(n)?4:['reserve_a','reserve_b','total_shares','quote_reserve'].includes(n)?2:1;fields[n]=await Promise.all(n==='consumed'?['bob','trader'].map(a=>s.slot(this.vault,this.id,f.offset+this.actors[a].id)):Array.from({length:width},(_,i)=>s.slot(this.vault,this.id,f.offset+i)));}));
  const roots=Object.fromEntries(await Promise.all([...this.bindings.keys()].map(async id=>[id,await s.contractStateRoot(this.vault,id)])));const result={checkpoint:s.checkpoint,vault:this.vault,market:this.id,fields,roots};save(join(this.base,'public',name+'.state.json'),result);return result;
 }
}
export async function registerMarket({base,config,build,deployment,dependencies,compactBinary,env,admissionMode='single-v1'}){
 assert.equal(deployment.preflight.initialLayoutVerified,true);const id=deployment.contractId;bindAdmission({build,marketId:id,out:join(build,'bound'),admissionMode});const policy=read(join(build,'bound/policy.json'));
 const name='register-'+policy.market+'-vault-v1',out=join(base,'attempts',name);await run(compactBinary,['register',join(build,'bound/policy.json'),config,out],join(base,name+'.log'),env);
 return reconcileRegisteredMarket({base,config,build,deployment,dependencies});
}
// Read-only restart after registration. Never issues a registration request.
export async function reconcileRegisteredMarket({base,config,build,deployment,dependencies}){
 const id=deployment.contractId,policy=read(join(build,'bound/policy.json')),out=join(base,'attempts','register-'+policy.market+'-vault-v1');assert.equal(policy.market_id,id);
 const receipt=read(join(out,'receipt.json')),request=read(join(out,'request.json'));let vaultId;
 for(let i=0;i<120;i++){const s=await publicState(config),ids=await s.userIds(receipt.publicKeyHash);assert.ok(ids.length<=1,'ambiguous vault registration');if(ids.length){vaultId=ids[0];break;}await new Promise(r=>setTimeout(r,10000));}assert.ok(vaultId,'vault registration unresolved');
 const s=await publicState(config),marketBinding=await binding(s,id),l=deployment.leaf;assert.deepEqual(marketBinding,contractBinding(id,l),'deployed market metadata changed');
 const required=[...new Set(policy.branches.flatMap(b=>b.calls.map(c=>c.contract_id)))].sort((a,b)=>a-b),map=new Map([...dependencies,marketBinding].map(b=>[b.contract.contractId,b]));const contracts=required.map(id=>{const b=map.get(id);assert.ok(b,'reviewed dependency absent '+id);return b;});for(const b of contracts)assert.deepEqual(await binding(s,b.contract.contractId),b);
 const evidence=await confirmRegistration(config,vaultId,receipt.publicKeyHash);
 const mode=read(join(build,'bound/BOUND.json')).admissionMode;const registration=await publishRegistration({includedPath:join(out,'included.json'),livePath:join(build,'live-registration.json'),registration:{checkpoint:s.checkpoint,marketId:id,vaultId,...(mode?{admissionMode:mode}:{}),publicKeyHash:receipt.publicKeyHash,fingerprint:request.public_key.fingerprint,publicKeyParam:request.public_key.public_key_param,contracts,coordinatorMappingVerified:true,indexedReceiptVerified:true,...evidence}});return {policy,registration,contracts};
}
