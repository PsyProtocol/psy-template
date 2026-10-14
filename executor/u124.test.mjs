import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateOptions} from './config.mjs';
import {createPublicWalletAdapter} from './publicWalletAdapter.mjs';
import {scanU124,proposeU124Action} from './u124Reader.mjs';
import {ExecutionJournal} from './journal.mjs';
import {executeCycle} from './worker.mjs';
import {submissionLeaf} from './driverProcess.mjs';
import {makePolicy} from '../amm/u124/policy.mjs';
import {encodeAmount,parseLosslessJson,FEE_ESCROW,initialShares,curveQuote} from '../amm/u124/client.mjs';
const U=10n**18n, config={assetA:42,assetB:43,issuer:5,target:400,cap:20,liquidity:10,threshold:20,unit:String(U),base:String(U),step:String(U/10n)};
const token=(await import('../token/wide/verification-2026-10-12/compiled-reviewed/compilation_artifact.json',{assert:{type:'json'}})).default.abi;
async function fixture(kind,fn){
 const directory=await mkdtemp(join(tmpdir(),'psy-u124-adapter-'));
 try{
  const abi=JSON.parse(await readFile(new URL(`./fixtures/u124/${kind}.abi.json`,import.meta.url),'utf8'));
  const policy=makePolicy(kind,1000,config,abi,token);
  const paths={abi:join(directory,'market.json'),policy:join(directory,'policy.json'),driverConfig:join(directory,'config.json'),tokenAbi:join(directory,'token.json')};
  for(const[key,data]of [['abi',abi],['policy',policy],['driverConfig',config],['tokenAbi',token]])await writeFile(paths[key],JSON.stringify(data));
  const asset=id=>({contractId:id,codeRoot:'a'.repeat(64),layoutRoot:'d'.repeat(64),abi:paths.tokenAbi});
  const options=validateOptions({kind,profile:'u124',network:'test',contractId:1000,vaultId:100,codeRoot:'c'.repeat(64),layoutRoot:'d'.repeat(64),publicKeyHash:'a'.repeat(64),fingerprint:'b'.repeat(64),wallet:'driver',rpcConfig:'rpc.json',runtimeDirectory:directory,assetA:asset(42),assetB:asset(43),abi:paths.abi,policy:paths.policy,driverConfig:paths.driverConfig,users:[200,201]},directory);
  const slots=new Map(),field=name=>abi.contract.state.find(f=>f.name===name);
  const set=(u,c,o,n)=>slots.set(`${u}:${c}:${o}`,n);
  const scalar=(u,n,x,index=0)=>set(u,1000,field(n).offset+index,x);
  const pair=(u,n,x,index=0)=>encodeAmount(x).forEach((limb,i)=>set(u,1000,field(n).offset+2*index+i,limb));
  const funding=(u,a=0n,b=0n)=>{set(u,0,203,FEE_ESCROW);for(const[c,amount]of [[42,a],[43,b]])encodeAmount(amount).forEach((v,i)=>set(u,c,33554453+400+i,v));};
  const order=(u,{kind=1n,side=0n,x=U,y=U,z=0n,lots=1n,sold=0n,deadline=200n,nonce=1n}={})=>{
   for(const[n,v]of Object.entries({kind,pool:100n,side,deadline,nonce}))scalar(u,n,v);
   for(const[n,v]of Object.entries({x,y,z}))pair(u,n,v);
   if(options.kind==='bondingcurve'){scalar(u,'lots',lots);scalar(u,'expected_sold',sold);}
  };
  const state={networkName:'test',checkpoint:100,userIds:async()=>[100],contractLeaf:async id=>({code_root:id===1000?'c'.repeat(64):'a'.repeat(64),state_layout_root:'d'.repeat(64),state_tree_height:31}),slot:async(u,c,o)=>slots.get(`${u}:${c}:${o}`)??0n};
  const context={options,abi,policy,config,pool:{},orders:[],checkpoint:100,kind,vaultId:100,issuer:{feeDelta:0n,aDelta:0n}};
  await fn({directory,options,abi,policy,state,set,scalar,pair,funding,order,context});
 }finally{await rm(directory,{recursive:true,force:true});}
}
const paidOrder=(change={})=>({payerId:200,kind:1n,pool:100n,side:0n,x:U,y:1n,z:0n,nonce:1n,consumed:0n,deadline:200n,feeDelta:FEE_ESCROW,aDelta:U,bDelta:0n,...change});
test('U124 config requires two pinned asset roots, ABIs, policy and exact driver config',()=>{
 const base={kind:'amm',profile:'u124',network:'test',contractId:1000,vaultId:100,codeRoot:'c'.repeat(64),layoutRoot:'d'.repeat(64),publicKeyHash:'a'.repeat(64),fingerprint:'b'.repeat(64),rpcConfig:'rpc.json',wallet:'driver',abi:'abi.json',runtimeDirectory:'runtime',policy:'policy.json',driverConfig:'config.json',assetA:{contractId:42,codeRoot:'a'.repeat(64),layoutRoot:'b'.repeat(64),abi:'a.json'},assetB:{contractId:43,codeRoot:'a'.repeat(64),layoutRoot:'b'.repeat(64),abi:'b.json'}};
 assert.equal(validateOptions(base,'/tmp').assetA.abi,'/tmp/a.json');
 for(const bad of [{profile:'other'},{policy:undefined},{assetA:{...base.assetA,contractId:0}},{assetB:base.assetA},{assetA:{...base.assetA,privateKey:'secret'}},{kind:'launchamm'}])assert.throws(()=>validateOptions({...base,...bad}));
});
test('AMM plans preserve high limbs and choose executable settlement, exact payer refund and withdrawal cancellation',()=>fixture('amm',async({context})=>{
 const n=10n**28n;context.pool={reserve_a:0n,reserve_b:0n,total_shares:0n};context.orders=[paidOrder({kind:2n,x:n,y:n,z:1n,aDelta:n,bDelta:n})];
 const action=proposeU124Action(context);assert.equal(action.kind,'add_liquidity');const request=parseLosslessJson(action.submission);
 assert.deepEqual(request.contract_calls[0].inputs,[200n,...encodeAmount(n),...encodeAmount(n),...encodeAmount(initialShares(n,n)),1n]);
 context.pool={reserve_a:50n*U,reserve_b:50n*U,total_shares:50n*U};context.orders=[paidOrder()];assert.equal(proposeU124Action(context).kind,'swap_0');
 context.orders=[paidOrder({y:100n*U})];assert.equal(proposeU124Action(context).kind,'refund_swap_0');
 context.orders=[paidOrder({aDelta:U+1n})];assert.equal(proposeU124Action(context),null);
 context.orders=[paidOrder({kind:3n,x:U,ownedShares:U,y:1n,z:1n})];assert.equal(proposeU124Action(context).kind,'remove_liquidity');
 context.orders[0].deadline=99n;assert.equal(proposeU124Action(context).kind,'cancel_remove');
}));
test('Orderbook exact funded orders match with peer nonce; expired or underfunded orders cannot fill',()=>fixture('orderbook',async({context})=>{
 context.orders=[paidOrder({x:8n*U,y:10n*U,aDelta:8n*U}),paidOrder({payerId:201,side:1n,x:10n*U,y:8n*U,aDelta:0n,bDelta:10n*U,nonce:3n})];
 const action=proposeU124Action(context);assert.equal(action.kind,'match_orders');assert.equal(parseLosslessJson(action.submission).software_defined_call.inputs[11],3n);
 context.orders[1].bDelta=9n*U;assert.equal(proposeU124Action(context),null);
 context.orders[0].deadline=99n;assert.equal(proposeU124Action(context).kind,'cancel_0');
 context.orders[0].consumed=1n;assert.equal(proposeU124Action(context),null);
}));
test('Curve initialization, stale refunds, exact buy/sell and graduation use signed amounts',()=>fixture('bondingcurve',async({context})=>{
 context.pool={phase:0n,sold_lots:0n,quote_reserve:0n};context.automaticInitialize=true;context.issuer={feeDelta:FEE_ESCROW,aDelta:30n*U};assert.equal(proposeU124Action(context).kind,'initialize');
 context.pool={phase:1n,sold_lots:0n,quote_reserve:0n};context.orders=[paidOrder({lots:1n,expected_sold:0n,bDelta:U,aDelta:0n})];assert.equal(proposeU124Action(context).kind,'settle_buy');
 context.pool={phase:1n,sold_lots:1n,quote_reserve:U};assert.equal(proposeU124Action(context).kind,'refund_buy');
 context.orders=[paidOrder({kind:2n,lots:1n,expected_sold:1n})];assert.equal(proposeU124Action(context).kind,'settle_sell');
 context.orders[0].deadline=99n;assert.equal(proposeU124Action(context).kind,'refund_sell');
 context.orders=[];context.automaticGraduation=true;context.pool={phase:1n,sold_lots:20n,quote_reserve:curveQuote(config,0n,20n).quoted};assert.equal(proposeU124Action(context).kind,'graduate');
 context.issuer.feeDelta=0n;assert.equal(proposeU124Action(context),null);
}));
test('scanner decodes pairs/strides at one snapshot and does not derive balances with Number',()=>fixture('amm',async({options,state,pair,funding,order})=>{
 const n=10n**28n+17n;order(200,{kind:2n,x:n,y:n,z:1n});funding(200,n,n);
 const scan=await scanU124(options,async()=>state);assert.equal(scan.orders[0].x,n);assert.equal(scan.orders[0].aDelta,n);assert.equal(scan.action.kind,'add_liquidity');
 pair(100,'reserve_a',1n);await assert.rejects(scanU124(options,async()=>state),/AMM A backing/);
}));
test('adapter uses explicit preflight and verified-submit, records lost response and recovers exact log after restart',()=>fixture('amm',async({options,state,order,funding,scalar,directory})=>{
 order(200,{kind:2n,x:U,y:U,z:1n});funding(200,U,U);let submits=0,reads=[];const leaf='e'.repeat(64);
 const dependencies={readState:async()=>state,readReceipts:async()=>async query=>{reads.push(query);return query.endUserLeafHash===leaf?{status:'included',userId:100,checkpoint:101,contentHash:'f'.repeat(64),endUserLeafHash:leaf}:{status:'unresolved'};},
  runDriver:async(_,args)=>args[0]==='fingerprint'?{stdout:options.fingerprint}:{stdout:JSON.stringify({fullUpsVerified:true,submitted:false,marketId:1000,fingerprint:options.fingerprint,fee:1000000000})},
  submitDriver:async(_,args,{logFile})=>{assert.equal(args[0],'verified-submit');submits++;const output=JSON.stringify({fullUpsVerified:true,submitted:false,marketId:1000,fingerprint:options.fingerprint,fee:1000000000,endUserLeafHash:leaf})+'\n'+JSON.stringify({status:'broadcast_intent',userId:100,nonce:1,endUserLeafHash:leaf});await writeFile(logFile,output);scalar(100,'consumed',1n,200);const error=Error('response lost');error.stdout=output;throw error;}};
 const adapter=await createPublicWalletAdapter(options,dependencies);const journal=new ExecutionJournal({directory,network:'test',vaultId:100,fingerprint:options.fingerprint,fee:1000000000});
 assert.equal((await executeCycle({adapter,journal})).status,'included');assert.equal(submits,1);assert.equal((await executeCycle({adapter,journal})).status,'idle');assert.equal(submits,1);
 scalar(100,'consumed',0n,200);const task=(await adapter.scan()).action,proof=await adapter.prepareSubmission(task,await adapter.prove(task));
 const recovered=new ExecutionJournal({directory:join(directory,'crash'),network:'test',vaultId:100,fingerprint:options.fingerprint,fee:1000000000});
 await recovered.locked(async()=>{await recovered.append({status:'broadcast-intent',taskId:'crashed',task,proof});await writeFile(proof.submissionLog,JSON.stringify({fullUpsVerified:true,submitted:false,marketId:1000,fingerprint:options.fingerprint,fee:1000000000,endUserLeafHash:leaf})+'\n'+JSON.stringify({status:'broadcast_intent',userId:100,nonce:2,endUserLeafHash:leaf}));});
 const restarted=await createPublicWalletAdapter(options,dependencies);assert.equal((await recovered.reconcile(restarted.reconcile))[0].result.status,'included');assert.equal(submits,1);
 assert.equal(reads.at(-1).endUserLeafHash,leaf);
}));
test('proof rejection is not broadcast recovery; an older no-submit result cannot clear a newer ambiguous attempt',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'psy-u124-no-submit-'));
 try{
  const journal=new ExecutionJournal({directory,network:'test',vaultId:100,fingerprint:'b'.repeat(64)}),task={nonce:1};
  const args={task,prove:async()=>({}),isCurrent:async()=>true,submit:async()=>({submissionStatus:'not-submitted',reason:'stale'}),reconcile:async()=>assert.fail('must not reconcile a known rejection')};
  assert.equal((await journal.execute(args)).status,'not-submitted');assert.equal((await journal.unresolved()).length,0);
  // Same task ID as the previous attempt, but its newest intent has no result.
  const records=await journal.records(),id=records.find(r=>r.status==='not-submitted').taskId;
  await journal.locked(()=>journal.append({status:'broadcast-intent',taskId:id,task}));
  await journal.reconcile(async()=>({status:'unresolved'}));assert.ok((await journal.unresolved()).some(x=>x.taskId===id));
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('U124 leaf parser keeps intent hashes after response loss and rejects contradictory identities',()=>{
 const leaf='e'.repeat(64),intent=JSON.stringify({status:'broadcast_intent',endUserLeafHash:leaf});assert.equal(submissionLeaf(intent),leaf);
 assert.equal(submissionLeaf('submitted market transaction '+leaf),leaf);
 assert.throws(()=>submissionLeaf(intent+'\nsubmitted market transaction '+'f'.repeat(64)),/conflicting/);
});
test('Curve graduation fixes AMM seed payer, targets, fee, minimum, deadline and nonce, and waits for both fee donors',()=>fixture('bondingcurve',async({abi,context})=>{
 const {validateConfig,validateBootstrapAmm}=await import('../amm/u124/build.mjs');
 const ammAbi=JSON.parse(await readFile(new URL('./fixtures/u124/amm.abi.json',import.meta.url),'utf8'));
 const bootstrap={ammContractId:1001,ammVaultId:400,funderId:6,openAddMethodId:ammAbi.contract.methods.find(m=>m.name==='open_add').method_id,codeRoot:'a'.repeat(64),layoutRoot:'b'.repeat(64)};
 const bound={...config,bootstrap};validateConfig(bound);validateBootstrapAmm(bootstrap,1001,ammAbi);
 assert.throws(()=>validateBootstrapAmm({...bootstrap,openAddMethodId:bootstrap.openAddMethodId+1},1001,ammAbi));
 assert.throws(()=>validateBootstrapAmm(bootstrap,1002,ammAbi));
 for(const change of [{ammVaultId:401},{funderId:config.issuer},{funderId:config.target},{codeRoot:'invalid'}])assert.throws(()=>validateConfig({...bound,bootstrap:{...bootstrap,...change}}));
 const policy=makePolicy('bondingcurve',1000,bound,abi,token),branch=policy.branches.find(b=>b.name==='graduate');
 assert.equal(branch.calls.length,9);
 const fields=[BigInt(branch.branch),200n,0n,...encodeAmount(21n*U),...encodeAmount(10n*U),0n,0n,0n,0n,0n,1000000000n];
 const {operationCalls}=await import('../amm/u124/policy.mjs');const calls=operationCalls(policy,fields);
 assert.deepEqual(calls[1].inputs,[5n]);assert.deepEqual(calls[2].inputs,[6n]);
 assert.deepEqual(calls[3].inputs,[400n,...encodeAmount(21n*U)]);
 assert.deepEqual(calls[4].inputs,[400n,...encodeAmount(10n*U)]);
 assert.deepEqual(calls[5].inputs,[400n,FEE_ESCROW]);
 assert.equal(calls[6].contract_id,1001n);assert.equal(calls[6].method_name,'open_add');
 assert.deepEqual(calls[6].inputs,[400n,...encodeAmount(10n*U),...encodeAmount(21n*U),1n,0n,4294967295n,1n]);
 assert.equal(policy.branches.some(b=>b.calls.some(c=>c.method_name==='open_remove')),false);
 context.config=bound;context.policy=policy;context.automaticGraduation=true;context.orders=[];
 context.pool={phase:1n,sold_lots:20n,quote_reserve:curveQuote(config,0n,20n).quoted};context.issuer={feeDelta:FEE_ESCROW,bootstrapFee:0n};
 assert.equal(proposeU124Action(context),null);
 context.issuer.bootstrapFee=FEE_ESCROW+1n;assert.equal(proposeU124Action(context),null);
 context.issuer.bootstrapFee=FEE_ESCROW;context.issuer.bootstrapFeeCursor=0n;assert.equal(proposeU124Action(context),null);context.issuer.bootstrapFeeCursor=FEE_ESCROW;assert.equal(proposeU124Action(context).kind,'graduate');
 context.pool.phase=2n;context.pool.quote_reserve=0n;assert.equal(proposeU124Action(context),null);
}));
test('an interrupted parent can release an explicit child rejection, but cannot release an incomplete proof log',()=>fixture('amm',async({options,state,order,funding,directory})=>{
 order(200,{kind:2n,x:U,y:U,z:1n});funding(200,U,U);
 const adapter=await createPublicWalletAdapter(options,{readState:async()=>state,readReceipts:async()=>async()=>assert.fail('no receipt lookup without a broadcast'),runDriver:async(_,args)=>args[0]==='fingerprint'?{stdout:options.fingerprint}:{stdout:JSON.stringify({fullUpsVerified:true,submitted:false,marketId:1000,fingerprint:options.fingerprint,fee:1000000000})}});
 const task=(await adapter.scan()).action,proof=await adapter.prepareSubmission(task,await adapter.prove(task)),journal=new ExecutionJournal({directory:join(directory,'restart'),network:'test',vaultId:100,fingerprint:options.fingerprint});
 await journal.locked(()=>journal.append({status:'broadcast-intent',taskId:'interrupted',task,proof}));
 const redirected=proof.submissionLog.replace('.submission-', '.submission-../other.submission-');await assert.rejects(adapter.reconcile({task,proof:{...proof,submissionLog:redirected}}),/log binding/);
 await writeFile(proof.submissionLog,'compression still running\n');
 assert.equal((await journal.reconcile(adapter.reconcile))[0].result.status,'unresolved');assert.equal((await journal.unresolved()).length,1);
 await writeFile(proof.submissionLog,JSON.stringify({ok:false,status:'rejected_before_submission',submitted:false,broadcastAttempted:false,userId:null,error:'request_failed',reason:'stale submit anchor'})+'\n');
 const resolved=await journal.reconcile(adapter.reconcile);assert.equal(resolved[0].result.status,'not-submitted');assert.equal(resolved[0].result.reason,'stale submit anchor');assert.equal((await journal.unresolved()).length,0);
}));
test('Token ABI errors stop initialization before metadata reads or driver execution',()=>fixture('amm',async({options})=>{
 const abi=JSON.parse(await readFile(options.assetA.abi,'utf8'));abi.contract.state.find(f=>f.name==='other_user_info').offset++;await writeFile(options.assetA.abi,JSON.stringify(abi));
 await assert.rejects(createPublicWalletAdapter(options,{readState:async()=>assert.fail('ABI first'),runDriver:async()=>assert.fail('ABI first')}),/outbox offset/);
}));
