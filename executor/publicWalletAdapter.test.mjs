import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createPublicWalletAdapter} from './publicWalletAdapter.mjs';
import {WIDE_AMM_CODE_ROOT, WIDE_AMM_V2_CODE_ROOT} from '../amm/wide/chainReader.mjs';
test('executor chooses the wide amount range only for the verified deployed wide code root',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'psy-wide-adapter-')),abi=join(directory,'abi.json');
 const options={kind:'amm',contractId:2425,vaultId:317504,network:'test',publicKeyHash:'a'.repeat(64),fingerprint:'b'.repeat(64),codeRoot:WIDE_AMM_CODE_ROOT,layoutRoot:'d'.repeat(64),wallet:'pool_wallet',rpcConfig:'rpc.json',runtimeDirectory:directory,abi,users:[1239104]};
 const state={checkpoint:100,networkName:'test',contractLeaf:async()=>({code_root:options.codeRoot,state_layout_root:options.layoutRoot}),userIds:async()=>[317504],
  fields:async user=>user===317504?{reserve_psy:1_500_000_000n,reserve_usdt:2_000_000n,total_shares:54_772_255n}:{order_kind:1n,order_pool_user:317504n,order_asset:0n,order_amount_psy:1_000_000_000n,order_amount_usdt:0n,order_min_out:1n,order_deadline:200n,order_nonce:1n,order_shares:0n,order_min_psy:0n,order_min_usdt:0n},
  slot:async(user,contract)=>user===317504?0n:contract===0?2_000_100_000n:0n};
 try{
  await writeFile(abi,JSON.stringify({contract:{state:['consumed_nonce','shares','settled_psy_sent','settled_usdt_sent'].map((name,i)=>({name,offset:10000+i*1000}))}}));
  const dependencies={readState:async()=>state,readReceipts:async()=>async()=>({status:'unresolved'}),runDriver:async()=>({stdout:options.fingerprint})};
  const wide=await createPublicWalletAdapter(options,dependencies);assert.equal((await wide.scan()).action.kind,'swap');
  options.codeRoot=WIDE_AMM_V2_CODE_ROOT;const v2=await createPublicWalletAdapter(options,dependencies);assert.equal((await v2.scan()).action.kind,'swap');
  options.codeRoot='c'.repeat(64);const legacy=await createPublicWalletAdapter(options,dependencies);assert.equal((await legacy.scan()).action,null);
  await assert.rejects(createPublicWalletAdapter({...options,codeRoot:WIDE_AMM_CODE_ROOT},dependencies),/deployed code root/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('curve driver uses proof-only preflight, durable exact calls and records a lost-response leaf without retrying submission',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'psy-adapter-'));let submits=0;
 const options={kind:'bondingcurve',contractId:66,vaultId:123,network:'test',publicKeyHash:'a'.repeat(64),fingerprint:'b'.repeat(64),
  codeRoot:'c'.repeat(64),layoutRoot:'d'.repeat(64),wallet:'curve_wallet',driverConfig:'launch.json',rpcConfig:'rpc.json',runtimeDirectory:directory};
 const task={submission:{contract_calls:[{contract_id:66,method_name:'refund_buy',inputs:[111,1,1000,2]}],software_defined_call:{inputs:[4,111,1,1000,2,0]}}};
 const state={networkName:'test',contractLeaf:async()=>({code_root:options.codeRoot,state_layout_root:options.layoutRoot}),userIds:async()=>[123]};
 try{
  const adapter=await createPublicWalletAdapter(options,{readState:async()=>state,readReceipts:async()=>async()=>({status:'unresolved'}),
   submitDriver:async(wallet,args,{env,logFile})=>{
    assert.equal(wallet,'curve_wallet');assert.equal(env.CURVE_PROVE_ONLY,'0');submits++;
    await writeFile(logFile,'deterministic leaf '+ 'e'.repeat(64));
    const error=Error('response lost');error.stderr='deterministic leaf '+ 'e'.repeat(64);throw error;
   },runDriver:async(wallet,args,{env})=>{
    assert.equal(wallet,'curve_wallet');assert.deepEqual(args.slice(1,3),['66','launch.json']);
    assert.equal(env.CURVE_USE_LOCAL_PROVER,'1');
    if(args[0]==='fingerprint')return {stdout:options.fingerprint};
    assert.equal(await readFile(args[3],'utf8'),JSON.stringify(task.submission));
    assert.equal(env.CURVE_PROVE_ONLY,'1');return {stdout:'proved',stderr:''};
   }});
  const proof=await adapter.prove(task);assert.equal(await adapter.validateProof(task,proof),true);
  const result=await adapter.submit(task,proof);assert.equal(result.endUserLeafHash,'e'.repeat(64));assert.equal(submits,1);
  let recovered;
  const restarted=await createPublicWalletAdapter(options,{readState:async()=>state,readReceipts:async()=>async x=>{recovered=x;return {status:'included'};},runDriver:async()=>({stdout:options.fingerprint})});
  await restarted.reconcile({task});assert.equal(recovered.endUserLeafHash,'e'.repeat(64));
  await writeFile(proof.file,'changed');assert.equal(await adapter.validateProof(task,proof),false);
  await assert.rejects(adapter.submit(task,proof),/calls changed/);assert.equal(submits,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
