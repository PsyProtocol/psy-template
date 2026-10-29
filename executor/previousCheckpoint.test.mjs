import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {join} from 'node:path';
import {scanPrevious,validatePreviousPlan} from './previousCheckpointReader.mjs';
import {PREVIOUS_TAG,processorRequest,validateProcessorFields} from '../batching/checkpoint-processor/policy.mjs';
import {parseLosslessJson,FEE_ESCROW,encodeAmount} from '../amm/u124/client.mjs';
import {validateOptions} from './config.mjs';
const root=process.env.PREVIOUS_FIXTURES;assert.ok(root,'fresh previous-checkpoint fixtures required');
const read=async p=>JSON.parse(await readFile(join(root,p),'utf8'));
test('producer plan is explicit, bounded and canonical',()=>{
 validatePreviousPlan({version:1,type:'previous-checkpoint-members',members:[{owner:200,nonce:'1'},{owner:201,nonce:'1'}]});
 for(const members of [[{owner:200,nonce:'1'}],[{owner:200,nonce:'1'},{owner:200,nonce:'2'}],[{owner:200,nonce:'01'},{owner:201,nonce:'1'}]])assert.throws(()=>validatePreviousPlan({version:1,type:'previous-checkpoint-members',members}));
 assert.throws(()=>validatePreviousPlan({version:1,type:'previous-checkpoint-members',members:[],seed:'chosen'}));
});
for(const market of ['amm','bondingcurve'])for(const count of [2,3,4])test(`${market} ${count}: fixed source, padded nonces, ranked prices and exact fee`,async()=>{
 const policy=await read(`${market}/policy.json`),abi=(await read(`${market}/compiled/compilation_artifact.json`)).abi;assert.equal(policy.version,4);
 const map=new Map(abi.contract.state.map(f=>[f.name,f.offset])),slots=new Map(),V=100,C=1000;
 const set=(n,i,v)=>slots.set(map.get(n)+i,BigInt(v));const wide=(n,v)=>encodeAmount(v).forEach((a,j)=>set(n,j,a));
 for(const[n,v]of Object.entries({batch_phase:1,batch_id:1,batch_expiry:200,processor_draw:101,batch_cutoff:100,batch_count:count}))set(n,0,v);
 [1n,2n,3n,4n].forEach((v,i)=>set('batch_root',i,v));if(market==='amm'){wide('reserve_a',10n**24n);wide('reserve_b',10n**24n);wide('total_shares',10n**24n);}else{set('phase',0,1);set('sold_lots',0,0);wide('quote_reserve',0n);}
 for(let i=0;i<4;i++){
  const fields={owner:i<count?200+i:0,nonce:1,kind:1,side:0,deadline:200,cancelled:0,order_checkpoint:100,lots:1,limit_mode:1,expected_sold:0,pool:V,fee_delta:FEE_ESCROW};
  for(const[n,v]of Object.entries(fields))if(map.has('frozen_'+n))set('frozen_'+n,i,v);
  for(const[n,v]of Object.entries({x:market==='amm'?10n**20n:2n*10n**18n,y:1n,z:0n,paid_a:market==='amm'?10n**20n:0n,paid_b:market==='amm'?0n:2n*10n**18n}))encodeAmount(v).forEach((a,j)=>set('frozen_'+n+'_'+(j?'hi':'lo'),i,a));
 }
 let checkpoint=110,quotes=0;const rank=[...Array(count)].map((_,i)=>count-1-i).concat([...Array(4-count)].map((_,i)=>count+i));
 const state={checkpoint,coordinator:'readonly',slot:async(u,c,o)=>{assert.equal(u,V);assert.equal(c,C);return slots.get(o)??0n;},rpc:async(_url,method,args)=>{assert.equal(method,'psy_get_checkpoint_leaf_data');assert.equal(args.checkpoint_id,101);return {stats:{random_seed:'0'.repeat(63)+'b'}};}};
 const options={kind:market,vaultId:V,contractId:C};const files={abi,policy,config:policy.config};
 const hooks={deriveOrder:async input=>{assert.equal(input.checkpoint,'101');assert.deepEqual(input.owners.slice(count),Array(4-count).fill('0'));assert.deepEqual(input.nonces.slice(count),Array(4-count).fill('0'));return rank;},quote:async task=>{quotes++;const f=parseLosslessJson(task.submission).software_defined_call.inputs;assert.equal(f[78],PREVIOUS_TAG);assert.equal(f[73]+f[79],BigInt(count)*FEE_ESCROW);return 1000030000n;}};
 const result=await scanPrevious(options,async()=>state,files,hooks);assert.equal(quotes,1);const f=parseLosslessJson(result.action.submission).software_defined_call.inputs;
 assert.equal(f[3],101n);assert.equal(f[73],1000030000n);assert.equal(f[79],BigInt(count)*FEE_ESCROW-f[73]);validateProcessorFields(policy,f);
 const calls=processorRequest(policy,f).contract_calls;assert.deepEqual(calls.filter(c=>c.method_name==='claim_batch_member').map(c=>c.inputs[0]),Array.from({length:count},(_,i)=>BigInt(200+i)));
 const first=calls.findIndex(c=>['swap_0','settle_limit_buy'].includes(c.method_name));assert.ok(first>0);assert.equal(calls[first].inputs[0],BigInt(200+rank[0]));
 state.checkpoint=100;assert.equal((await scanPrevious(options,async()=>state,files,hooks)).reason,'awaiting-fixed-previous-checkpoint');
 state.checkpoint=201;const expired=await scanPrevious(options,async()=>state,files,hooks);assert.equal(parseLosslessJson(expired.action.submission).software_defined_call.inputs[0],3n);assert.equal(quotes,1);
 const wrong=[...f];wrong[78]=0n;assert.throws(()=>processorRequest(policy,wrong));
 state.checkpoint=110;set('processor_draw',0,102);
 await assert.rejects(scanPrevious(options,async()=>state,files,hooks),/original commit context/);
 assert.equal(quotes,1,'inconsistent source stops before quote');
});
test('native producer mode requires explicit local trust acknowledgement',()=>{
 const asset=id=>({contractId:id,codeRoot:'a'.repeat(64),layoutRoot:'b'.repeat(64),abi:'abi.json'});
 const base={kind:'amm',profile:'previous-checkpoint-seeded-v1',network:'testnet',testnetProfile:'mainnet-beta-20261027-v1',contractId:1000,vaultId:100,batchSponsorId:300,publicKeyHash:'c'.repeat(64),fingerprint:'d'.repeat(64),codeRoot:'a'.repeat(64),layoutRoot:'b'.repeat(64),walletSha256:'e'.repeat(64),wallet:'wallet',abi:'abi',rpcConfig:'rpc',driverConfig:'config',policy:'policy',dependencyBindings:'deps',admissionPlan:'plan',runtimeDirectory:'runtime',assetA:asset(42),assetB:asset(43),producerSeedAcknowledgement:'producer-may-bias-v1'};
 assert.equal(validateOptions(base).batchMemberLimit,4);
 for(const patch of [{producerSeedAcknowledgement:undefined},{producerSeedAcknowledgement:'unbiased'},{kind:'orderbook'},{batchExpiryCheckpoints:1},{network:'mainnet'},{ordering:'random'},{randomSeed:'11'}])assert.throws(()=>validateOptions({...base,...patch}));
});
