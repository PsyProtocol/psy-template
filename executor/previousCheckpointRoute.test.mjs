// Coordination doubles only. Complete cryptographic acceptance is a separate
// native UPS test; these reports must never be described as network receipts.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {validateOptions} from './config.mjs';import {createPublicWalletAdapter} from './publicWalletAdapter.mjs';
import {ExecutionJournal} from './journal.mjs';import {executeCycle} from './worker.mjs';
import {sha256} from './requestBinding.mjs';
import {losslessJson,parseLosslessJson,encodeAmount,FEE_ESCROW as F} from '../amm/u124/client.mjs';
const root=process.env.PREVIOUS_FIXTURES;assert.ok(root,'fresh previous-checkpoint fixtures required');
const read=async p=>JSON.parse(await readFile(p,'utf8')),put=(p,v)=>writeFile(p,losslessJson(v)+'\n',{flag:'wx'});
for(const kind of ['amm','bondingcurve'])test(`${kind}: formal producer route persists one proof/send and reconciles exact identity after restart`,async()=>{
 const dir=await mkdtemp(join(tmpdir(),'psy-previous-route-'));
 try{
  const policy=await read(join(root,kind,'policy.json')),config=policy.config,abi=(await read(join(root,kind,'compiled/compilation_artifact.json'))).abi;
  const token=(await read(join(root,'token/compilation_artifact.json'))).abi,V=100,C=1000,slots=new Map(),offsets=new Map(abi.contract.state.map(f=>[f.name,f.offset]));
  const set=(name,i,v)=>{assert.ok(offsets.has(name));slots.set(offsets.get(name)+i,BigInt(v));};
  const wide=(name,v)=>encodeAmount(v).forEach((n,j)=>set(name,j,n));
  for(const[n,v]of Object.entries({batch_phase:1,batch_id:1,batch_expiry:200,processor_draw:101,batch_cutoff:100,batch_count:2}))set(n,0,v);
  for(let i=0;i<4;i++){
   set('batch_root',i,i+1);
   for(const[n,v]of Object.entries({owner:i<2?200+i:0,nonce:1,kind:1,side:0,deadline:200,cancelled:0,order_checkpoint:100,lots:1,limit_mode:1,expected_sold:0,pool:V,fee_delta:F}))if(offsets.has('frozen_'+n))set('frozen_'+n,i,v);
   for(const[n,v]of Object.entries({x:kind==='amm'?10n**20n:2n*10n**18n,y:1n,z:0n,paid_a:kind==='amm'?10n**20n:0n,paid_b:kind==='amm'?0n:2n*10n**18n}))encodeAmount(v).forEach((a,j)=>set(`frozen_${n}_${j?'hi':'lo'}`,i,a));
  }
  if(kind==='amm')for(const n of ['reserve_a','reserve_b','total_shares'])wide(n,10n**24n);else{set('phase',0,1);set('sold_lots',0,0);wide('quote_reserve',0n);}
  for(const[n,v]of Object.entries({'abi.json':abi,'policy.json':policy,'config.json':config,'token.json':token,'rpc.json':{},'plan.json':{version:1,type:'previous-checkpoint-members',members:[{owner:200,nonce:'1'},{owner:201,nonce:'1'}]}}))await put(join(dir,n),v);
  const bindings=[...new Set(policy.branches.flatMap(b=>b.calls.map(c=>c.contract_id)))].map(id=>({contract:{contractId:id,codeRoot:'a'.repeat(64),layoutRoot:'b'.repeat(64),stateTreeHeight:id===0?32:31},functionTreeRoot:'c'.repeat(64),layoutFieldCount:1,layoutSlotCount:4}));
  await put(join(dir,'bindings.json'),bindings);await writeFile(join(dir,'driver'),'producer route test double');
  const asset=id=>({contractId:id,codeRoot:'a'.repeat(64),layoutRoot:'b'.repeat(64),abi:join(dir,'token.json')});
  const o=validateOptions({kind,profile:'previous-checkpoint-seeded-v1',network:'testnet',testnetProfile:'mainnet-beta-20261027-v1',producerSeedAcknowledgement:'producer-may-bias-v1',contractId:C,vaultId:V,batchSponsorId:300,codeRoot:'a'.repeat(64),layoutRoot:'b'.repeat(64),publicKeyHash:'d'.repeat(64),fingerprint:'e'.repeat(64),wallet:join(dir,'driver'),walletSha256:sha256('producer route test double'),abi:join(dir,'abi.json'),driverConfig:join(dir,'config.json'),policy:join(dir,'policy.json'),rpcConfig:join(dir,'rpc.json'),dependencyBindings:join(dir,'bindings.json'),admissionPlan:join(dir,'plan.json'),runtimeDirectory:join(dir,'runtime'),assetA:asset(config.assetA),assetB:asset(config.assetB)});
  o.performanceMetrics=true;validateOptions(o);let proofs=0,sends=0,included=false;
  const state={checkpoint:110,coordinator:'readonly',networkName:'testnet',network:{magic:config.networkMagic,users_per_realm:1048576,realm_configs:[{id:0,rpc_url:['https://r0.test.invalid']}]},slot:async(u,c,i)=>{assert.equal(u,V);assert.equal(c,C);return slots.get(i)??0n;},userIds:async()=>[V],contractLeaf:async id=>{const b=bindings.find(b=>b.contract.contractId===id);return {code_root:b.contract.codeRoot,state_layout_root:b.contract.layoutRoot,state_tree_height:b.contract.stateTreeHeight,function_tree_root:b.functionTreeRoot,state_layout_field_count:b.layoutFieldCount,state_layout_slot_count:b.layoutSlotCount};},rpc:async(_url,method)=>method==='psy_get_checkpoint_leaf_data'?{stats:{random_seed:'0'.repeat(63)+'b'}}:method==='psy_get_user_leaf_data'?{nonce:4,public_key:o.publicKeyHash}:'f'.repeat(64)};
  const run=async(_bin,args)=>{
   if(args[0]==='identity')return {stdout:JSON.stringify({profile:'compact-v1',fingerprint:o.fingerprint,publicKeyHash:o.publicKeyHash,orderingModel:o.profile,producerInfluence:true,qualifiedRandomness:false})};
   if(args[0]==='producer-order'){const input=await read(args[2]);assert.deepEqual(input.nonces,['1','1','0','0']);await put(args[3],{profile:o.profile,rank:[1,0,2,3],qualifiedRandomness:false,broadcast:false});return {stdout:''};}
   const out=args[5];await mkdir(out);const fields=parseLosslessJson(await readFile(args[3],'utf8')).software_defined_call.inputs;assert.equal(fields[3],101n);
   if(args[0]==='quote'){await put(join(out,'quote.json'),{fee:1000030000,endcapSigned:false,broadcast:false});return {stdout:''};}
   assert.equal(args[0],'preflight');proofs++;
   const pre={fullUpsVerified:true,exactStackAndSessionVerified:true,broadcast:false,orderingModel:o.profile,producerInfluence:true,qualifiedRandomness:false,producerSourceCheckpoint:101,callsSha256:sha256(await readFile(args[3])),guardSha256:sha256(await readFile(args[4])),core:{checkpoint_id:101,new_user_leaf:{user_id:V,public_key:o.publicKeyHash,nonce:5},state_transition:{start_user_leaf_hash:'f'.repeat(64),end_user_leaf_hash:'2'.repeat(64)}}};
   await put(join(out,'preflight.json'),pre);await put(join(out,'request.json'),{coordinationTestOnly:true});await put(join(out,'prepared.json'),{version:1,policySha256:sha256(await readFile(args[1])),callsSha256:pre.callsSha256,guardSha256:pre.guardSha256,preflightSha256:sha256(await readFile(join(out,'preflight.json'))),requestSha256:sha256(await readFile(join(out,'request.json')))});return {stdout:''};
  };
  const submit=async(_bin,args)=>{sends++;assert.equal(args[0],'broadcast-prepared');const out=args[7],m=await read(join(args[5],'prepared.json'));await mkdir(out);await put(join(out,'verification.json'),{fullUpsVerified:true,reproved:false,preparedManifestSha256:args[6],requestSha256:m.requestSha256});await put(join(out,'intent.json'),{requestSha256:m.requestSha256,endUserLeafHash:'2'.repeat(64),userId:V,nonce:5});return {stdout:''};};
  const create=()=>createPublicWalletAdapter(o,{readState:async()=>state,readReceipts:async()=>async()=>included?{status:'included',userId:V,checkpoint:110,contentHash:'1'.repeat(64),endUserLeafHash:'2'.repeat(64)}:{status:'unresolved'},runDriver:run,submitDriver:submit});
  const journal=()=>new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,vaultId:V,fingerprint:o.fingerprint});
  const a=await create();assert.equal((await executeCycle({adapter:a,journal:journal()})).status,'unresolved');assert.equal(proofs,1);assert.equal(sends,1);
  const b=await create();assert.equal((await executeCycle({adapter:b,journal:journal()})).status,'unresolved');assert.equal(proofs,1);assert.equal(sends,1);
  included=true;const reconciled=await journal().reconcile(b.reconcile);assert.equal(reconciled[0].result.status,'included');assert.equal(proofs,1);assert.equal(sends,1);
  const metrics=await Promise.all((await readdir(join(o.runtimeDirectory,'performance',o.network,String(V)))).map(n=>read(join(o.runtimeDirectory,'performance',o.network,String(V),n))));assert.ok(metrics.some(m=>m.phase==='initialize'));assert.ok(metrics.some(m=>m.phase==='prove'));assert.ok(metrics.every(m=>m.scope.walletSha256===o.walletSha256));
  await a.close?.();await b.close?.();
 }finally{await rm(dir,{recursive:true,force:true});}
});
