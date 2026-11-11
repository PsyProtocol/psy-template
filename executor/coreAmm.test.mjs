import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {validateOptions} from './config.mjs';
import {scanCoreAmm, checkCoreSourceCheckpoint} from './coreAmmReader.mjs';
import {compactIdentityCache} from './identityCache.mjs';
import {mkdtemp, writeFile, readFile, readdir, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {sha256} from './requestBinding.mjs';
import {encodeAmount, parseLosslessJson, losslessJson, FEE_ESCROW} from '../amm/u124/client.mjs';
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

// Application coordination doubles only. The fake driver writes fixture proof
// metadata; no SDK, native child, cryptographic proof, RPC or broadcast runs.
async function withMissingProofFixture(options, exercise) {
  const directory = await mkdtemp(join(tmpdir(), 'psy-core-missing-proof-'));
  let adapter;
  try {
    const write = async (path, value) => {await writeFile(path, typeof value === 'string' ? value : losslessJson(value)); return path;};
    const chain = read('BUILD.json').chainRootAt1, abi = read('amm/compiled/compilation_artifact.json').abi;
    const token = read('token/compilation_artifact.json').abi, policy = read('amm/policy.json');
    const V = 1182848, payer = 201, stateValues = new Map();
    const dependencies = [0,42,43,1000].map(contractId => ({contract: {contractId, codeRoot:h, layoutRoot:h,
      stateTreeHeight:contractId === 0 ? 32 : 31}, functionTreeRoot:h, layoutFieldCount:1, layoutSlotCount:1}));
    const driverBytes = 'mock missing-proof core driver ' + directory;
    const o = validateOptions({...config, chainRootAt1:chain, vaultId:V, users:[], automaticInitialize:true,
      activationPayerId:payer, wallet:await write(join(directory,'driver'),driverBytes), walletSha256:sha256(driverBytes),
      abi:await write(join(directory,'abi.json'),abi), driverConfig:await write(join(directory,'config.json'),read('amm/config.json')),
      policy:await write(join(directory,'policy.json'),policy), rpcConfig:await write(join(directory,'rpc.json'),{}),
      dependencyBindings:await write(join(directory,'dependencies.json'),dependencies), runtimeDirectory:join(directory,'runtime'),
      assetA:{...config.assetA,abi:await write(join(directory,'a.json'),token)},
      assetB:{...config.assetB,abi:await write(join(directory,'b.json'),token)}});
    const set = (user, contract, offset, value) => stateValues.set(`${user}:${contract}:${offset}`, value);
    const nativeOffset = 3 + 2 * V, tokenOffset = 33554453 + 4 * V;
    set(payer,0,nativeOffset,FEE_ESCROW); set(payer,42,tokenOffset,1n); set(payer,43,tokenOffset,1n);
    let head = 100, nativeAttempts = 0, sends = 0, normalStarts = 0, failedOnce = false;
    const readiness = [], attemptedCalls = [], guards = [], attempts = [];
    const state = {networkName:'testnet', coordinator:'https://c.test', get checkpoint(){return head;},
      network:{magic:'1384803358401154921',users_per_realm:1048576,
        realm_configs:[{id:0,rpc_url:['https://r0.test']},{id:1,rpc_url:['https://r1.test']}],
        coordinator_configs:[{rpc_url:['https://c.test']}]},
      slot:async(user,contract,offset)=>stateValues.get(`${user}:${contract}:${offset}`)??0n,
      contractLeaf:async id=>{const b=dependencies.find(d=>d.contract.contractId===id);return{code_root:failedOnce&&options.identityDrift==='asset'&&id===42?'b'.repeat(64):h,
        state_layout_root:h,state_tree_height:b.contract.stateTreeHeight,function_tree_root:h,state_layout_field_count:1,state_layout_slot_count:1};},
      userIds:async()=>failedOnce&&options.identityDrift==='registration'?[V+1]:[V],
      rpc:async(url,method,args)=>{
        if(method==='psy_get_checkpoint_leaf_data'){assert.equal(url,'https://c.test');assert.deepEqual(args,{checkpoint_id:1});return{global_chain_root:failedOnce&&options.identityDrift==='chain'?'b'.repeat(64):chain};}
        assert.equal(method,'psy_get_user_tree_merkle_proof'); assert.equal(url,'https://r1.test');
        assert.deepEqual(args,{checkpoint_id:options.missingCheckpoint??105,user_id:V}); readiness.push(args);
        if(options.readinessFails)throw Error('mock checkpoint proof remains unavailable');
        // Availability is deliberately NOT a valid proof. The adapter must not
        // install it as authentication; the normal driver path runs again.
        return {availabilityOnly:true};
      }};
    const services = {readState:async()=>state,readReceipts:async()=>async()=>({status:'unknown'}),
      submitDriver:async()=>{sends++;throw Error('host retry test must never send');},
      runDriver:async(_binary,args,runOptions)=>{
        if(args[0]==='identity')return{stdout:JSON.stringify({profile:'compact-v1',fingerprint:h,publicKeyHash:h,
          sdkCommit:'01b8f2b0a077367a7b9879baba1a72aea8ab5510',clientCommit:'7058070057c3242b5d8b29e1a31d498aaa4202c0',sdkProfile:'sdk-audit-20261102-v1'})};
        assert.equal(args[0],'preflight'); normalStarts++; nativeAttempts++;
        assert.equal(runOptions.env.PSY_MARKET_BENCH_SOURCE_CHECKPOINT,undefined);
        attemptedCalls.push(await readFile(args[3],'utf8')); guards.push(JSON.parse(await readFile(args[4],'utf8')));
        const out=args[5]; attempts.push(out); await mkdir(out);
        if(nativeAttempts===1||options.exhaust){
          await write(join(out,'failure.json'),{ok:false,automaticRetry:false,broadcastMayHaveBeenAttempted:false,
            phase:options.failurePhase??'start-compact-session',reason:options.reason??
              `User tree proof not found for checkpoint_id ${options.missingCheckpoint??105}`});
          if(options.material)await write(join(out,options.material),{fixtureOnly:true});
          head=options.afterFailureHead??110;
          if(options.changedTask)set(payer,42,tokenOffset,2n);
          if(options.identityDrift==='input')await writeFile(o.policy,'\n',{flag:'a'});
          failedOnce=true;
          throw Error('mock native preflight failure');
        }
        assert.equal(readiness.length,1,'fresh startup requires a successful readiness probe first');
        const pre={fullUpsVerified:true,exactStackAndSessionVerified:true,broadcast:false,
          callsSha256:sha256(await readFile(args[3])),guardSha256:sha256(await readFile(args[4])),
          core:{checkpoint_id:BigInt(head),new_user_leaf:{user_id:BigInt(V),public_key:h,nonce:1n},
            state_transition:{start_user_leaf_hash:'0'.repeat(64),end_user_leaf_hash:'2'.repeat(64)}}};
        await write(join(out,'preflight.json'),pre); await write(join(out,'request.json'),{mockProofMetadata:true});
        await write(join(out,'prepared.json'),{version:1,policySha256:sha256(await readFile(args[1])),
          callsSha256:pre.callsSha256,guardSha256:pre.guardSha256,preflightSha256:sha256(await readFile(join(out,'preflight.json'))),
          requestSha256:sha256(await readFile(join(out,'request.json')))});
        return{stdout:'mock native startup and preparation complete',stderr:''};
      }};
    adapter=await createPublicWalletAdapter(o,services);
    const task=(await adapter.scan()).action; assert.equal(task.kind,'batch_maintenance');
    await exercise({adapter,task,readiness,attemptedCalls,guards,attempts,
      get nativeAttempts(){return nativeAttempts;},get normalStarts(){return normalStarts;},get sends(){return sends;}});
    assert.equal(sends,0);
  } finally {await adapter?.close();await rm(directory,{recursive:true,force:true});}
}

test('exact missing checkpoint readiness reattempts normal startup once with original calls and window (mock I/O)',()=>
  withMissingProofFixture({},async x=>{
    const original=structuredClone(x.task), prepared=await x.adapter.prove(x.task);
    assert.equal(x.nativeAttempts,2);assert.equal(x.normalStarts,2);assert.equal(x.readiness.length,1);
    assert.deepEqual(x.task,original);assert.deepEqual(x.attemptedCalls,[original.submission,original.submission]);
    assert.deepEqual(x.guards[0],x.guards[1]);assert.equal(x.guards[1].validUntilCheckpoint,Number(original.validUntilCheckpoint));
    assert.equal(prepared.preparedDirectory,x.attempts[1]);
    assert.deepEqual(await readdir(x.attempts[0]),['failure.json']);
    const record=JSON.parse(await readFile(x.attempts[0]+'.read-retry.json','utf8'));
    assert.equal(record.missingCheckpoint,105);assert.equal(record.originalWindowUnchanged,true);
    assert.equal(record.financialBroadcastRetry,false);assert.equal(record.newSession,true);
  }));

test('missing proof recovery refuses generic/post-call failures, wrong windows, changed tasks and saved transaction material (mock I/O)',async()=>{
  for(const options of [
    {reason:'REJECTED_REVIEW_REQUIRED'}, {failurePhase:'prove-compact-calls'},
    {missingCheckpoint:99}, {missingCheckpoint:165}, {afterFailureHead:165},
    {changedTask:true}, {readinessFails:true},
    ...['chain','registration','asset','input'].map(identityDrift=>({identityDrift})),
    ...['request.json','preflight.json','prepared.json','intent.json'].map(material=>({material})),
  ])await withMissingProofFixture(options,async x=>{
    await assert.rejects(()=>x.adapter.prove(x.task));assert.equal(x.nativeAttempts,1);assert.equal(x.normalStarts,1);
    assert.equal(x.readiness.length,options.changedTask||options.readinessFails?1:0);
  });
});

test('a second exact startup failure exhausts the two-attempt bound without a send (mock I/O)',()=>
  withMissingProofFixture({exhaust:true},async x=>{
    await assert.rejects(()=>x.adapter.prove(x.task),e=>e.name==='ReadUnavailable');
    assert.equal(x.nativeAttempts,2);assert.equal(x.normalStarts,2);
    assert.ok(x.readiness.length>=1&&x.readiness.length<=2);
    assert.deepEqual(x.attemptedCalls,[x.task.submission,x.task.submission]);
    for(const out of x.attempts)assert.deepEqual(await readdir(out),['failure.json']);
  }));
