import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
import {scanAdmission,queueMaintenance}from'./reader.mjs';import{parseLosslessJson,FEE_ESCROW}from'../../amm/u124/client.mjs';
import {makeAdmissionPolicy} from './prepare.mjs';
const root=process.env.ADMISSION_BUILD;if(!root)throw Error('fresh ADMISSION_BUILD required');
function setup(kind){const artifact=JSON.parse(readFileSync(`${root}/${kind}/compiled/compilation_artifact.json`)),policy=JSON.parse(readFileSync(`${root}/${kind}/policy.json`)),config=JSON.parse(readFileSync(`${root}/${kind}/config.json`));const map=new Map(artifact.abi.contract.state.map(x=>[x.name,x.offset])),values=new Map();const set=(u,name,n,i=0)=>values.set(`${u}:1000:${map.get(name)+i}`,BigInt(n));const V=100,S=300;
 for(const[n,v]of Object.entries({batch_phase:0,batch_ready:1,queue_phase:2,queue_epoch:9,queue_count:4,queue_cutoff:90,batch_id:4,batch_expiry:150}))set(V,n,v);if(kind==='bondingcurve')set(V,'phase',1);
 for(let i=0;i<4;i++){set(V,'queue_root',i+1,i);set(V,'queue_owner',200+i,i);set(V,'queue_nonce',i+1,i);}
 set(S,'sponsor_pool',V);set(S,'sponsor_amount',2n*FEE_ESCROW);set(S,'sponsor_nonce',1);set(S,'sponsor_purpose',1);set(V,'used_sponsorship',0,S);set(V,'settled_fee',0,S);values.set(`${S}:0:${3+2*V}`,2n*FEE_ESCROW);
 const s={checkpoint:100,slot:async(u,c,o)=>values.get(`${u}:${c}:${o}`)??0n};const options={kind,contractId:1000,vaultId:V,batchSponsorId:S,users:[201],batchMemberLimit:1,batchExpiryCheckpoints:64};return {s,options,files:{abi:artifact.abi,policy,config},set};}
test('four markets commit every sealed member despite omitted discovery hints',async()=>{for(const kind of ['amm','orderbook','bondingcurve','nftmarket']){const x=setup(kind),r=await scanAdmission(x.options,async()=>x.s,x.files),f=parseLosslessJson(r.action.submission).software_defined_call.inputs;assert.equal(f[2],4n);assert.deepEqual(f.slice(5,9),[200n,201n,202n,203n]);assert.deepEqual(f.slice(9,13),[1n,2n,3n,4n]);assert.equal(parseLosslessJson(r.action.submission).contract_calls.length,2);assert.equal(r.action.profile,'compact-v1');assert.equal(r.action.proofVerified,false);}});
test('malformed/duplicated sealed scope fails instead of being silently repaired',async()=>{for(const mutate of [x=>x.set(100,'queue_owner',200,1),x=>x.set(100,'queue_nonce',0,2),x=>x.set(100,'queue_count',5)]){const x=setup('amm');mutate(x);await assert.rejects(()=>scanAdmission(x.options,async()=>x.s,x.files));}});
test('unsealed or terminal queue is never replaced with hint selection',async()=>{for(const phase of [0,1,3]){const x=setup('orderbook');x.set(100,'queue_phase',phase);assert.equal((await scanAdmission(x.options,async()=>x.s,x.files)).action,null);}});
test('open and empty terminal RPC snapshots never claim a sealed or proof-verified set',async()=>{
 for(const kind of ['amm','orderbook','bondingcurve','nftmarket'])for(const [phase,count,sealed]of [[0,0,false],[1,1,false],[2,4,true],[3,4,true],[3,0,false]]){
  const x=setup(kind);x.set(100,'queue_phase',phase);x.set(100,'queue_count',count);
  const {scope}=await scanAdmission(x.options,async()=>x.s,x.files);
  assert.equal(scope.queuePhase,BigInt(phase));assert.equal(scope.sealed,sealed);assert.equal(scope.proofVerified,false);assert.match(scope.source,/RPC snapshot/);
 }
});
test('queue maintenance carries full sponsored prefix without padding calls',()=>{const x=setup('amm');for(const name of ['start_epoch','admit_entry','seal_epoch','abort_empty_epoch']){const r=queueMaintenance(x.files.policy,{name,payer:300n,a:9n,b:120n});assert.equal(r.contract_calls.length,3);assert.deepEqual(r.contract_calls.map(c=>c.method_name),['fund_gas','simple_claim',name]);}});
test('shared policy builder preserves frozen fixtures and binds new deployment ID',()=>{
 const token=JSON.parse(readFileSync(`${root}/token/compilation_artifact.json`)),nft=JSON.parse(readFileSync(`${root}/nft/compilation_artifact.json`));
 for(const kind of ['amm','orderbook','bondingcurve','nftmarket']){
  const {files}=setup(kind),build=id=>makeAdmissionPolicy(kind,id,files.config,files.abi,token.abi,nft.abi);
  assert.deepEqual(build(1000),files.policy,'refactor must not change existing policy bytes');
  const rebound=build(2463);
  // Replace only identity fields, never constants (fee/amount/network).
  const expected=structuredClone(files.policy);expected.market_id=2463;
  function visit(x){if(!x||typeof x!=='object')return;if(x.contract_id===1000)x.contract_id=2463;for(const v of Object.values(x))visit(v);}
  visit(expected);assert.deepEqual(rebound,expected);
 }
});
