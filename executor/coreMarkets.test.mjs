// Host/mock integration only. Driver doubles below do not build or verify a
// native proof, make RPC calls, approve a wallet request or move real funds.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readReviewedAbis} from '../tests/fixtures/reviewedAbis.mjs';
import {generateBatch,methodSpans} from '../batching/v2/generate.mjs';
import {members} from '../batching/v2/controller.mjs';
import {operationCalls} from '../batching/v2/policy.mjs';
import {CORE_PROFILE_KINDS,canonicalCorePolicy} from './coreMarketProfiles.mjs';
import {validateOptions} from './config.mjs';
import {scanCoreMarket} from './coreAmmReader.mjs';
import {createPublicWalletAdapter} from './publicWalletAdapter.mjs';
import {ExecutionJournal} from './journal.mjs';
import {sha256} from './requestBinding.mjs';
import {encodeAmount,parseLosslessJson,losslessJson,FEE_ESCROW} from '../amm/u124/client.mjs';

const h='a'.repeat(64),anchor='ab'.repeat(32),SDK='01b8f2b0a077367a7b9879baba1a72aea8ab5510',CLIENT='7058070057c3242b5d8b29e1a31d498aaa4202c0';
const profileFor=kind=>Object.keys(CORE_PROFILE_KINDS).find(p=>CORE_PROFILE_KINDS[p]===kind);
const fixtureAbis=readReviewedAbis().admission;
const write=async(p,v)=>{await writeFile(p,typeof v==='string'?v:losslessJson(v)+'\n');return p;};
async function fixture(kind,exercise){
 const directory=await mkdtemp(join(tmpdir(),'psy-core-market-route-'));let adapter;
 try{
  const historical=structuredClone(fixtureAbis.markets[kind]);
  const config=kind==='orderbook'?Object.fromEntries(['assetA','assetB','networkMagic'].map(k=>[k,historical.config[k]])):historical.config;
  const baseNames=new Set(methodSpans(generateBatch(kind,config)).map(x=>x.name));
  const abi=historical.artifact.abi;abi.contract.methods=abi.contract.methods.filter(m=>baseNames.has(m.name));
  const token=structuredClone(fixtureAbis.token.abi),nft=structuredClone(fixtureAbis.nft.abi);
  if(kind==='nftmarket'){
   nft.contract.state.push({name:'account_version',offset:603980958,felt_size:1,type:{kind:'primitive',name:'Felt'}});
   nft.contract.state_layout.field_count=15;nft.contract.state_layout.slot_count=603980959;
   nft.contract.state_layout.fields.push({field_id:15,name:'account_version',type:{kind:'primitive',name:'Felt'},start_slot:603980958,payload_offset:0,slot_count:1});
   nft.contract.methods.push({name:'prepare_account',method_id:1475740684,input_felt_count:0,output_felt_count:0,state_mutability:'external',inputs:[],outputs:[]});
  }
  const driverBytes='reviewed core driver double '+directory;
  const profile=profileFor(kind),assetIds=kind==='nftmarket'?[config.tokenId,config.nftId]:[config.assetA,config.assetB];
  const asset=id=>({contractId:id,codeRoot:h,layoutRoot:h,abi:join(directory,id===config.nftId?'nft.json':'token.json')});
  const raw={kind,profile,network:'testnet',testnetProfile:'sdk-audit-20261102-v1',chainRootAt1:anchor,
   contractId:1000,vaultId:100,publicKeyHash:h,fingerprint:h,codeRoot:h,layoutRoot:h,
   wallet:await write(join(directory,'driver'),driverBytes),walletSha256:sha256(driverBytes),
   rpcConfig:await write(join(directory,'rpc.json'),{}),abi:await write(join(directory,'abi.json'),abi),
   driverConfig:await write(join(directory,'config.json'),config),policy:join(directory,'policy.json'),
   dependencyBindings:join(directory,'bindings.json'),runtimeDirectory:join(directory,'runtime'),
   batchSponsorId:300,activationPayerId:201,automaticInitialize:true,users:[],
   ...(kind==='nftmarket'?{paymentToken:asset(assetIds[0]),collection:asset(assetIds[1])}:{assetA:asset(assetIds[0]),assetB:asset(assetIds[1])})};
  await write(join(directory,'token.json'),token);await write(join(directory,'nft.json'),nft);
  const options=validateOptions(raw),files={abi,config};
  files.policy=await canonicalCorePolicy(options,files,token,nft);await write(options.policy,files.policy);
  const dependencies=[0,...assetIds,1000].map(contractId=>({contract:{contractId,codeRoot:h,layoutRoot:h,stateTreeHeight:contractId===0?32:contractId===config.nftId?30:31},functionTreeRoot:h,layoutFieldCount:1,layoutSlotCount:1}));
  await write(options.dependencyBindings,dependencies);
  const offsets=new Map(abi.contract.state.map(f=>[f.name,f.offset])),values=new Map(),seen=[];
  const put=(u,c,o,n)=>values.set(`${u}:${c}:${o}`,BigInt(n)),set=(name,n,index=0,user=100)=>put(user,1000,offsets.get(name)+index,n);
  set('batch_ready',1);if(kind==='bondingcurve')set('phase',1);
  let chain=anchor,head=100,nonce=0,proofs=0,sends=0,included=false,driverCalls=0;
  const state={networkName:'testnet',get checkpoint(){return head;},network:{magic:config.networkMagic,users_per_realm:1048576,realm_configs:[{id:0,rpc_url:['https://r0.test']}],coordinator_configs:[{rpc_url:['https://c.test']}]},coordinator:'https://c.test',
   slot:async(u,c,o)=>{seen.push(u);return values.get(`${u}:${c}:${o}`)??0n;},
   contractLeaf:async id=>{const d=dependencies.find(x=>x.contract.contractId===id);return{code_root:d.contract.codeRoot,state_layout_root:d.contract.layoutRoot,state_tree_height:d.contract.stateTreeHeight,function_tree_root:d.functionTreeRoot,state_layout_field_count:d.layoutFieldCount,state_layout_slot_count:d.layoutSlotCount};},
   userIds:async()=>[100],contractStateRoot:async()=>'1'.repeat(64),
   rpc:async(_url,method,args)=>{if(method==='psy_get_checkpoint_leaf_data'){assert.deepEqual(args,{checkpoint_id:1});return{global_chain_root:chain};}if(method==='psy_get_user_leaf_data')return{nonce,public_key:h};if(method==='psy_get_user_tree_leaf_hash')return'0'.repeat(64);throw Error('unexpected mock RPC '+method);}};
  const runDriver=async(_binary,args)=>{
   driverCalls++;
   if(args[0]==='identity')return{stdout:JSON.stringify({profile:'compact-v1',fingerprint:h,publicKeyHash:h,sdkProfile:'sdk-audit-20261102-v1',sdkCommit:SDK,clientCommit:CLIENT})};
   assert.equal(args[0],'preflight');proofs++;const out=args[5];await mkdir(out);
   const pre={fullUpsVerified:true,exactStackAndSessionVerified:true,broadcast:false,callsSha256:sha256(await readFile(args[3])),guardSha256:sha256(await readFile(args[4])),core:{checkpoint_id:BigInt(head),new_user_leaf:{user_id:100n,public_key:h,nonce:BigInt(nonce)+1n},state_transition:{start_user_leaf_hash:'0'.repeat(64),end_user_leaf_hash:'2'.repeat(64)}}};
   await write(join(out,'preflight.json'),pre);await write(join(out,'request.json'),{user_ec_input:{core:pre.core}});
   await write(join(out,'prepared.json'),{version:1,policySha256:sha256(await readFile(args[1])),callsSha256:pre.callsSha256,guardSha256:pre.guardSha256,preflightSha256:sha256(await readFile(join(out,'preflight.json'))),requestSha256:sha256(await readFile(join(out,'request.json')))});
   return{stdout:'mock prepared metadata only',stderr:''};
  };
  const services={readState:async()=>state,runDriver,readReceipts:async()=>async()=>included?{status:'included',userId:100,checkpoint:head,contentHash:'1'.repeat(64),endUserLeafHash:'2'.repeat(64)}:{status:'unresolved'},submitDriver:async(_binary,args)=>{
   assert.equal(args[0],'broadcast-prepared');sends++;const out=args[7];await mkdir(out);const manifest=JSON.parse(await readFile(join(args[5],'prepared.json'),'utf8'));
   await write(join(out,'verification.json'),{fullUpsVerified:true,reproved:false,preparedManifestSha256:args[6],requestSha256:manifest.requestSha256});
   await write(join(out,'intent.json'),{requestSha256:manifest.requestSha256,endUserLeafHash:'2'.repeat(64),userId:100n,nonce:BigInt(nonce)+1n});included=true;head++;return{stdout:'mock broadcast only'};
  }};
  adapter=await createPublicWalletAdapter(options,services);
  await exercise({directory,raw,options,files,state,set,put,seen,adapter,services,
   journal:()=>new ExecutionJournal({directory:options.runtimeDirectory,network:'testnet',vaultId:100,fingerprint:h}),
   setChain:v=>chain=v,setHead:v=>head=v,get driverCalls(){return driverCalls;},get proofs(){return proofs;},get sends(){return sends;}});
 }finally{await adapter?.close();await rm(directory,{recursive:true,force:true});}
}

// Populate an already committed public snapshot, not an authenticated checkpoint.
// This exercises the formal route's reconstruction and exact prepared call order.
function freezeRows(x,kind,rows){
 x.set('batch_phase',1);x.set('batch_id',8);x.set('batch_cutoff',100);x.set('batch_expiry',120);
 for(let i=0;i<rows.length;i++){
  const row={kind:1n,pool:100n,nonce:1n,deadline:120n,cancelled:0n,order_checkpoint:90n,paid_a:0n,paid_b:0n,fee_delta:FEE_ESCROW,fee_sent:FEE_ESCROW,nft_sent:0n,nft_claimed:0n,nft_matches:0n,...rows[i]};
  x.set('frozen_owner',row.owner,i);
  for(const [name,width]of Object.entries(members(kind))){const n=BigInt(row[name]??0);if(width===2)encodeAmount(n).forEach((v,j)=>x.set('frozen_'+name+(j?'_hi':'_lo'),v,i));else x.set('frozen_'+name,n,i);}
  for(const name of ['paid_a','paid_b'])encodeAmount(row[name]).forEach((v,j)=>x.set('frozen_'+name+(j?'_hi':'_lo'),v,i));
  for(const name of ['fee_delta','fee_sent',...(kind==='nftmarket'?['nft_sent','nft_claimed','nft_matches']:[])])x.set('frozen_'+name,row[name],i);
  const assets=kind==='nftmarket'?[[x.files.config.tokenId,row.paid_a]]:[[x.files.config.assetA,row.paid_a],[x.files.config.assetB,row.paid_b]];
  for(const [asset,n]of assets)encodeAmount(n).forEach((v,j)=>x.put(Number(row.owner),asset,33554453+4*100+j,v));
  x.put(Number(row.owner),0,3+2*100,row.fee_sent);
  if(kind==='nftmarket'){x.put(Number(row.owner),x.files.config.nftId,1182+35*100+32,row.nft_sent);x.put(100,x.files.config.nftId,1182+35*Number(row.owner)+33,row.nft_claimed);}
 }
 x.setHead(101);
}
async function executeFrozen(x){
 const a=await x.adapter.scan();assert.equal(a.action.kind,'batch_settle');
 const task=a.action,request=parseLosslessJson(task.submission),calls=request.contract_calls,fields=[...request.software_defined_call.inputs];fields[73]=1000000000n;
 const fullCalls=operationCalls(x.files.policy,fields);assert.equal(fullCalls.length,40);assert.equal(fullCalls.at(-1).method_name,'burn');
 const compact=fullCalls.slice(0,-1).filter(c=>c.method_name!=='noop').map(({contract_id,method_name,inputs})=>({contract_id,method_name,inputs}));
 assert.deepEqual(calls.map(c=>({...c})),compact,'wire calls preserve complete ordered stack with only canonical noop padding removed');
 assert.equal(calls[0].method_name,'begin_batch');assert.equal(calls.at(-1).method_name,'finish_batch');
 assert.equal((await x.journal().execute({task,...x.adapter})).status,'included');
 assert.equal((await x.journal().execute({task,...x.adapter})).status,'already-included');
 assert.equal(x.proofs,1);assert.equal(x.sends,1);return calls;
}

test('bondingcurve: committed chronological buys update the quote for each following trade (mock I/O)',()=>fixture('bondingcurve',async x=>{
 const unit=BigInt(x.files.config.unit),base=BigInt(x.files.config.base),step=BigInt(x.files.config.step);
 // Canonical owner order differs from execution time order. The second buy is
 // bound to sold=1 and must not reuse the first quote/state observation.
 freezeRows(x,'bondingcurve',[
  {owner:201n,order_checkpoint:92n,lots:1n,expected_sold:1n,x:base+step,paid_b:base+step},
  {owner:202n,order_checkpoint:91n,lots:1n,expected_sold:0n,x:base,paid_b:base},
 ]);
 const calls=await executeFrozen(x),trades=calls.filter(c=>c.method_name==='settle_buy');
 assert.deepEqual(trades.map(c=>c.inputs),[[202n,1n,...encodeAmount(base),...encodeAmount(unit),1n],[201n,1n,...encodeAmount(base+step),...encodeAmount(unit),1n]]);
 assert.deepEqual(calls.filter(c=>c.contract_id===BigInt(x.files.config.assetA)&&c.method_name==='transfer').map(c=>c.inputs),[[202n,...encodeAmount(unit)],[201n,...encodeAmount(unit)]]);
}));

for(const timeTie of [false,true])test('orderbook: committed matches preserve '+(timeTie?'equal-price time priority':'price before time priority')+' (mock I/O)',()=>fixture('orderbook',async x=>{
 freezeRows(x,'orderbook',[
  {owner:201n,side:0n,x:100n,y:timeTie?100n:120n,paid_a:100n,order_checkpoint:timeTie?92n:90n},
  {owner:202n,side:0n,x:100n,y:100n,paid_a:100n,order_checkpoint:91n},
  {owner:203n,side:1n,x:timeTie?120n:130n,y:100n,paid_b:timeTie?120n:130n,order_checkpoint:timeTie?92n:90n},
  {owner:204n,side:1n,x:120n,y:100n,paid_b:120n,order_checkpoint:91n},
 ]);
 const calls=await executeFrozen(x),matches=calls.filter(c=>c.method_name==='match_orders');
 assert.deepEqual(matches.map(c=>c.inputs.slice(0,2)),timeTie?[[202n,204n],[201n,203n]]:[[202n,203n],[201n,204n]]);
 const rank=calls[0].inputs.slice(5);assert.deepEqual(rank,timeTie?[1n,0n,3n,2n]:[1n,0n,2n,3n]);
 assert.equal(new Set(rank).size,4,'every frozen member appears in the rank');
 assert.equal(calls.filter(c=>c.method_name==='transfer'&&c.contract_id===BigInt(x.files.config.assetA)).length,2);
 assert.equal(calls.filter(c=>c.method_name==='transfer'&&c.contract_id===BigInt(x.files.config.assetB)).length,2);
}));

for(const earlierExpired of [false,true])test('nftmarket: one listing has one buyer and '+(earlierExpired?'an expired priority buyer is refunded':'later competing buyer is refunded')+' (mock I/O)',()=>fixture('nftmarket',async x=>{
 const price=(1n<<70n)+17n;
 freezeRows(x,'nftmarket',[
  {owner:201n,kind:1n,price,nft_sent:1n,nft_matches:1n,order_checkpoint:89n},
  {owner:202n,kind:2n,price,paid_a:price,seller:201n,listing_nonce:1n,deadline:earlierExpired?99n:120n,order_checkpoint:90n},
  {owner:203n,kind:2n,price,paid_a:price,seller:201n,listing_nonce:1n,order_checkpoint:91n},
 ]);
 const calls=await executeFrozen(x),sales=calls.filter(c=>c.method_name==='settle_sale'),winner=earlierExpired?203n:202n,loser=earlierExpired?202n:203n;
 assert.deepEqual(sales.map(c=>c.inputs),[[201n,winner,...encodeAmount(price),1n,1n]],'exact one listing/price/nonces sale');
 assert.deepEqual(calls.filter(c=>c.contract_id===BigInt(x.files.config.nftId)&&c.method_name==='transfer').map(c=>c.inputs),[[0n,winner]],'one unique NFT delivery');
 const refunds=calls.filter(c=>c.method_name==='refund_funding');assert.equal(refunds.length,1);assert.equal(refunds[0].inputs[0],loser);
 assert.deepEqual(calls.filter(c=>c.contract_id===BigInt(x.files.config.tokenId)&&c.method_name==='transfer').map(c=>c.inputs).sort((a,b)=>Number(a[0]-b[0])),[[201n,...encodeAmount(price)],[loser,...encodeAmount(price)]].sort((a,b)=>Number(a[0]-b[0])),'seller payment plus complete high-limb loser refund');
}));

for(const kind of ['bondingcurve','orderbook','nftmarket']){
 test(kind+': exact selected core config refuses wrong kind/release/scope before work',()=>fixture(kind,async x=>{
  assert.equal(x.options.profile,profileFor(kind));assert.equal(x.options.admissionPlan,undefined);
  for(const change of [{kind:'amm'},{network:'sepolia'},{testnetProfile:'mainnet-beta-20261027-v1'},{chainRootAt1:'0'.repeat(64)},{admissionPlan:'global.json'},{usersFile:'universe.json'},{users:[1,2,3,4,5]},{producerSeedAcknowledgement:'producer-may-bias-v1'}])assert.throws(()=>validateOptions({...x.raw,...change}));
  const before=x.driverCalls;assert.equal((await x.adapter.scan()).action,null);assert.ok(x.seen.every(u=>u===100),'no account-universe scan');
  x.setChain('cd'.repeat(32));await assert.rejects(x.adapter.scan(),/chain instance changed/);assert.equal(x.driverCalls,before);assert.equal(x.sends,0);
 }));
 test(kind+': formal adapter uses exact native preparation and journal for first activation (mock I/O)',()=>fixture(kind,async x=>{
  x.set('batch_ready',0);x.put(201,0,3+2*100,FEE_ESCROW);x.put(201,kind==='nftmarket'?x.files.config.tokenId:x.files.config.assetA,33554453+4*100,1n);
  if(kind!=='nftmarket')x.put(201,x.files.config.assetB,33554453+4*100,1n);else x.put(201,x.files.config.nftId,0,1n);
  const task=(await x.adapter.scan()).action;assert.equal(task.kind,'batch_maintenance');
  const calls=parseLosslessJson(task.submission).contract_calls;
  if(kind==='nftmarket'){assert.ok(calls.some(c=>c.method_name==='prepare_account'));assert.ok(!calls.some(c=>c.method_name==='acknowledge'));}
  const result=await x.journal().execute({task,...x.adapter});assert.equal(result.status,'included');assert.equal(x.proofs,1);assert.equal(x.sends,1);
  assert.equal((await x.journal().execute({task,...x.adapter})).status,'already-included');assert.equal(x.proofs,1);assert.equal(x.sends,1);
 }));
 test(kind+': substituted policy, function roots and mutable hint overflow stop before proof (mock I/O)',()=>fixture(kind,async x=>{
  const before=x.driverCalls,leaf=x.state.contractLeaf;
  x.state.contractLeaf=async id=>({...await leaf(id),function_tree_root:id===1000?'b'.repeat(64):h});
  await assert.rejects(x.adapter.scan(),/live compact dependency changed/);assert.equal(x.driverCalls,before);
  x.state.contractLeaf=leaf;
  await assert.rejects(scanCoreMarket({...x.options,users:[1,2,3,4,5]},x.state,x.files),/four valid/);
  const substituted=structuredClone(x.files.policy);substituted.branches[0].calls[0].contract_id=999;
  await write(x.options.policy,substituted);
  await assert.rejects(createPublicWalletAdapter(x.options,x.services),/exact policy differs/);
  assert.equal(x.driverCalls,before);assert.equal(x.proofs,0);assert.equal(x.sends,0);
 }));
 test(kind+': frozen refunds ignore changed hints and preserve both U124 limbs (mock state)',()=>fixture(kind,async x=>{
  x.set('batch_phase',1);x.set('batch_id',7);x.set('batch_cutoff',100);x.set('batch_expiry',120);
  const paid=(1n<<70n)+17n,limbs=encodeAmount(paid);for(const[name,v]of Object.entries({frozen_owner:201,frozen_nonce:1,frozen_kind:kind==='nftmarket'?2:1,frozen_pool:100,frozen_deadline:99,frozen_paid_a_lo:limbs[0],frozen_paid_a_hi:limbs[1]}))x.set(name,v);
  const asset=kind==='nftmarket'?x.files.config.tokenId:x.files.config.assetA;
  limbs.forEach((n,i)=>x.put(201,asset,33554453+4*100+i,n));x.setHead(101);
  const a=await scanCoreMarket({...x.options,users:[999999]},x.state,x.files),b=await scanCoreMarket({...x.options,users:[]},x.state,x.files);
  assert.equal(a.action.kind,'batch_settle');assert.deepEqual(a.action,b.action);assert.ok(!x.seen.includes(999999));
  const calls=parseLosslessJson(a.action.submission).contract_calls;assert.ok(calls.some(c=>c.contract_id===BigInt(asset)&&c.method_name==='transfer'&&c.inputs[0]===201n&&c.inputs[1]===limbs[0]&&c.inputs[2]===limbs[1]));
  x.put(201,asset,33554453+4*100,limbs[0]+1n);assert.equal((await scanCoreMarket(x.options,x.state,x.files)).reason,'frozen-funding-drift-awaiting-expiry');
  x.setHead(121);assert.equal((await scanCoreMarket(x.options,x.state,x.files)).action.kind,'batch_expire');assert.equal(x.proofs,0);assert.equal(x.sends,0);
 }));
}
