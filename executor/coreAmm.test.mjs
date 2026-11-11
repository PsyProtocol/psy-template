import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {validateOptions} from './config.mjs';
import {scanCoreAmm, checkCoreSourceCheckpoint} from './coreAmmReader.mjs';
import {compactIdentityCache} from './identityCache.mjs';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {sha256} from './requestBinding.mjs';
import {encodeAmount, parseLosslessJson} from '../amm/u124/client.mjs';
import {createPublicWalletAdapter} from './publicWalletAdapter.mjs';
const h='a'.repeat(64), root=process.env.CORE_AMM_BUILD;
assert.ok(root, 'fresh compiled AMM candidate required');
const read = p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const config={kind:'amm',profile:'amm-core-compact-v1',network:'testnet',testnetProfile:'sdk-audit-20261102-v1',
  chainRootAt1:h,contractId:1000,vaultId:100,publicKeyHash:h,fingerprint:h,codeRoot:h,layoutRoot:h,
  rpcConfig:'rpc.json',wallet:'driver',walletSha256:h,abi:'abi.json',driverConfig:'config.json',policy:'policy.json',
  dependencyBindings:'bindings.json',runtimeDirectory:'runtime',batchSponsorId:300,users:[201],
  assetA:{contractId:42,codeRoot:h,layoutRoot:h,abi:'a.json'},assetB:{contractId:43,codeRoot:h,layoutRoot:h,abi:'b.json'}};
test('a complete saved proof must not predate the approved state observation',()=>{
  const task={minimumSourceCheckpoint:100,validUntilCheckpoint:'164'};
  checkCoreSourceCheckpoint(task,{checkpoint_id:100n});
  for(const checkpoint_id of [99n,165n,100,'100'])assert.throws(()=>checkCoreSourceCheckpoint(task,{checkpoint_id}));
});
test('core configuration selects one frozen release and never requires an admission/global source plan',()=>{
  const o=validateOptions(config);assert.equal(o.profile,'amm-core-compact-v1');assert.equal(o.admissionPlan,undefined);assert.equal(o.batchMemberLimit,1);
  for(const patch of [{kind:'orderbook'},{testnetProfile:'mainnet-beta-20261027-v1'}, {chainRootAt1:'0'.repeat(64)},
    {chainRootAt1:undefined},{admissionPlan:'old.json'},{usersFile:'all-accounts.json'},{users:[1,2,3,4,5]},
    {batchMemberLimit:5},{producerSeedAcknowledgement:'producer-may-bias-v1'}])assert.throws(()=>validateOptions({...config,...patch}));
});
test('empty order hints do not cause account-universe queries or create a transaction',async()=>{
  const files={abi:read('amm/compiled/compilation_artifact.json').abi,config:read('amm/config.json'),policy:read('amm/policy.json')};
  const offsets=new Map(files.abi.contract.state.map(f=>[f.name,f.offset]));const values=new Map();
  values.set(offsets.get('batch_ready'),1n);const seen=[];
  const state={checkpoint:100,slot:async(user,contract,offset)=>{seen.push(user);assert.equal(user,100,'no unrelated account discovery');assert.equal(contract,1000);return values.get(offset)??0n;}};
  const result=await scanCoreAmm({...config,users:[]},state,files);
  assert.equal(result.action,null);assert.equal(result.scope.globalCompleteness,false);assert.ok(seen.length>0);
});
test('public identity cache binds selected SDK/client and refuses a legacy binary report',async()=>{
  const cache=compactIdentityCache(),binding={driverSha256:h,policySha256:h,rpcConfigSha256:h,
    sdkProfile:'sdk-audit-20261102-v1',identity:{network:'testnet',fingerprint:h,publicKeyHash:h},dependencies:[]};
  const identity={profile:'compact-v1',fingerprint:h,publicKeyHash:h};
  await assert.rejects(cache(binding,async()=>identity));
  let loads=0;
  const load=async()=>{loads++;return{...identity,sdkProfile:binding.sdkProfile,sdkCommit:'01b8f2b0a077367a7b9879baba1a72aea8ab5510',clientCommit:'7058070057c3242b5d8b29e1a31d498aaa4202c0'};};
  await cache(binding,load);await cache(binding,load);assert.equal(loads,1);
});
test('sealed core refund survives changed hints, preserves both limbs, and waits on funding drift (mock state)',async()=>{
  const files={abi:read('amm/compiled/compilation_artifact.json').abi,config:read('amm/config.json'),policy:read('amm/policy.json')};
  const offsets=new Map(files.abi.contract.state.map(f=>[f.name,f.offset])),values=new Map(),seen=[];
  const put=(u,c,o,v)=>values.set(`${u}:${c}:${o}`,v);
  const set=(name,value,index=0)=>put(100,1000,offsets.get(name)+index,value);
  const paid=(1n<<70n)+17n, limbs=encodeAmount(paid);
  for(const[n,v]of Object.entries({batch_phase:1n,batch_id:7n,batch_cutoff:100n,batch_expiry:120n,
    frozen_owner:200n,frozen_nonce:1n,frozen_kind:1n,frozen_deadline:99n,frozen_pool:100n,
    frozen_paid_a_lo:limbs[0],frozen_paid_a_hi:limbs[1],reserve_a:0n,reserve_b:0n,total_shares:0n}))set(n,v);
  // Actual cumulative FT outbox -> vault; no funding or discovery from anyone else.
  limbs.forEach((v,i)=>put(200,42,33554453+4*100+i,v));
  let checkpoint=101;
  const state={get checkpoint(){return checkpoint;},slot:async(u,c,o)=>{seen.push(u);return values.get(`${u}:${c}:${o}`)??0n;}};
  const first=await scanCoreAmm({...config,users:[999999]},state,files);
  const restarted=await scanCoreAmm({...config,users:[]},state,files);
  assert.deepEqual(first.action,restarted.action);assert.equal(first.action.kind,'batch_settle');
  assert.ok(!seen.includes(999999));
  const calls=parseLosslessJson(first.action.submission).contract_calls;
  assert.ok(calls.some(c=>c.contract_id===42n&&c.method_name==='transfer'&&
    c.inputs[0]===200n&&c.inputs[1]===limbs[0]&&c.inputs[2]===limbs[1]));
  put(200,42,33554453+4*100,limbs[0]+1n);
  assert.equal((await scanCoreAmm({...config,users:[]},state,files)).reason,'frozen-funding-drift-awaiting-expiry');
  checkpoint=121;const expired=await scanCoreAmm({...config,users:[]},state,files);
  assert.equal(expired.action.kind,'batch_expire');assert.equal(expired.action.batchId,'7');
});
test('formal core factory reuses exact broadcasting backend and checks chain before any action (mock I/O only)',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'psy-core-factory-'));
  try {
    const write=async(name,value)=>{const p=join(dir,name);await writeFile(p,typeof value==='string'?value:JSON.stringify(value));return p;};
    const chain=read('BUILD.json').chainRootAt1,abi=read('amm/compiled/compilation_artifact.json').abi;
    const token=read('token/compilation_artifact.json').abi,policy=read('amm/policy.json');
    const dependencies=[0,42,43,1000].map(contractId=>({contract:{contractId,codeRoot:h,layoutRoot:h,stateTreeHeight:contractId===0?32:31},functionTreeRoot:h,layoutFieldCount:1,layoutSlotCount:1}));
    const bytes='mock core identity driver';const o=validateOptions({...config,chainRootAt1:chain,users:[],
      wallet:await write('driver',bytes),walletSha256:sha256(bytes),abi:await write('abi.json',abi),
      driverConfig:await write('config.json',read('amm/config.json')),policy:await write('policy.json',policy),
      rpcConfig:await write('rpc.json',{}),dependencyBindings:await write('dependencies.json',dependencies),runtimeDirectory:join(dir,'runtime'),
      assetA:{...config.assetA,abi:await write('a.json',token)},assetB:{...config.assetB,abi:await write('b.json',token)}});
    let actualChain=chain,driverCalls=0;const offsets=new Map(abi.contract.state.map(f=>[f.name,f.offset]));
    const state={networkName:'testnet',network:{magic:'1384803358401154921',realm_configs:[{rpc_url:['https://r0.test']}],coordinator_configs:[{rpc_url:['https://c.test']}]},checkpoint:100,coordinator:'https://c.test',
      rpc:async(_url,method,args)=>{assert.equal(method,'psy_get_checkpoint_leaf_data');assert.deepEqual(args,{checkpoint_id:1});return{global_chain_root:actualChain};},
      contractLeaf:async id=>{const b=dependencies.find(d=>d.contract.contractId===id);return{code_root:h,state_layout_root:h,state_tree_height:b.contract.stateTreeHeight,function_tree_root:h,state_layout_field_count:1,state_layout_slot_count:1};},
      userIds:async()=>[100],slot:async(user,_contract,offset)=>{assert.equal(user,100);return offset===offsets.get('batch_ready')?1n:0n;}};
    const services={readState:async()=>state,readReceipts:async()=>async()=>({status:'unknown'}),runDriver:async(_bin,args)=>{driverCalls++;assert.deepEqual(args,['identity',o.policy]);return{stdout:JSON.stringify({profile:'compact-v1',fingerprint:h,publicKeyHash:h,sdkCommit:'01b8f2b0a077367a7b9879baba1a72aea8ab5510',clientCommit:'7058070057c3242b5d8b29e1a31d498aaa4202c0',sdkProfile:'sdk-audit-20261102-v1'}),stderr:''};}};
    const a=await createPublicWalletAdapter(o,services);
    try {assert.equal((await a.scan()).action,null);assert.equal(driverCalls,1);
      actualChain='b'.repeat(64);await assert.rejects(a.scan(),/chain instance changed/);assert.equal(driverCalls,1);
    } finally {await a.close();}
  } finally {await rm(dir,{recursive:true,force:true});}
});
