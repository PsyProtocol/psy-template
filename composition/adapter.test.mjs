// Transport/state-machine tests use explicit fake RPC/proof IO. They do NOT
// attest cryptography, chain inclusion or deployed contract identities.
import test from 'node:test';import assert from 'node:assert/strict';
import{mkdtemp,mkdir,writeFile,readFile,rm}from'node:fs/promises';import{join}from'node:path';import{homedir}from'node:os';
import{executionFixture}from'./executionFixtures.mjs';import{createCompositionAdapter}from'./adapter.mjs';import{encodeDocument}from'./codec.mjs';import{generateFunds}from'./contract/funds.mjs';import{COMPOSITION_MAGIC,COMPOSITION_SDK}from'./contract/runtimePolicy.mjs';import{losslessJson,parseLosslessJson}from'../amm/u124/client.mjs';import{sha256}from'../executor/requestBinding.mjs';import{ExecutionJournal}from'../executor/journal.mjs';import{executeCycle}from'../executor/worker.mjs';import{selectCompositionAction}from'./selection.mjs';
async function fixture(){
 const parent=join(homedir(),'.cache','psy-composition-unit-tests');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'case-')),f=executionFixture(),t=f.model.intent.terms;
 const opts={profile:'composition-funded-v1',network:'sepolia',sdkManifestHash:COMPOSITION_SDK,testnetProfile:'staging-bundled-regtest-20261020-v1',runtimeDirectory:join(dir,'runtime'),vaultId:100,fingerprint:t.execution.fingerprint,publicKeyHash:t.execution.publicKeyHash,controllerBudget:String(f.model.controllerBudget),ownerFeeReserve:String(f.model.ownerFeeReserve),assetMetadata:[42,43].map(contractId=>({contractId,issuerUserId:5,decimals:18}))};
 for(const m of opts.assetMetadata){f.put(5,m.contractId,33554445,18);f.put(5,m.contractId,3,1);}
 const data={intent:encodeDocument(f.model.intent),plan:encodeDocument(f.model.plan),policy:JSON.stringify(f.model.policy),controllerAbi:JSON.stringify(f.model.controllerAbi),controllerArtifact:JSON.stringify({abi:f.model.controllerAbi}),controllerSource:generateFunds({networkMagic:COMPOSITION_MAGIC,registryHash:f.model.plan.registryHash,assetA:42,assetB:43,assetMetadata:opts.assetMetadata,intentOwner:Number(t.owner)}),tokenAbi:JSON.stringify(f.model.tokenAbi),otherTokenAbi:JSON.stringify(f.model.tokenAbi),nativeAbi:JSON.stringify(f.model.nativeAbi),rpcConfig:'{"fixture":true}',wallet:'mock driver, never executes'};
 for(const[k,v]of Object.entries(data)){opts[k]=join(dir,k);await writeFile(opts[k],v);}opts.walletSha256=sha256(data.wallet);opts.marketAbis=[];for(const[j,a]of f.model.marketAbis.entries()){const p=join(dir,'market'+j);await writeFile(p,JSON.stringify(a));opts.marketAbis.push(p);}
 const state={nonce:0n,proofs:0,quotes:0,sends:0,included:false,close:0,fee:1000003000n,corruptFee:false,wrongInspection:false},save=async(p,v)=>writeFile(p,losslessJson(v)+'\n');let last;
 const dependencies={verifyControllerSource:async()=>({check:async()=>{}}),verifyRouteComponents:async()=>({check:async()=>{},records:[]}),readState:async()=>f.state,readReceipts:async()=>async()=>state.included?{status:'included',userId:100,contentHash:'c'.repeat(64),checkpoint:101,receipt:{data:{result:{fees_collected:Number(state.fee),slots_modified:3,total_transactions:Number(last.pre.core.stats.total_transactions),user_ops_processed:1}}}}:{status:'unresolved',reason:'mock receipt not available'},
 runDriver:async(_bin,args)=>{if(args[0]==='identity')return{stdout:JSON.stringify({profile:'composition-v1',fingerprint:opts.fingerprint,publicKeyHash:opts.publicKeyHash})};assert.equal(args[0],'inspect-controller');await mkdir(args[3]);await save(join(args[3],'inspection.json'),{artifactSha256:sha256(await readFile(opts.controllerArtifact)),initialLayoutVerified:true,publicEndpointsBound:true,codeRoot:state.wrongInspection?'b'.repeat(64):t.execution.codeRoot,layoutRoot:t.execution.layoutRoot,functionTreeRoot:t.execution.functionTreeRoot,stateTreeHeight:t.execution.stateTreeHeight,newFieldCount:t.execution.layoutFieldCount,newSlotCount:t.execution.layoutSlotCount});return{stdout:''};},
 residentFactory:()=>({close:async()=>state.close++,quote:async args=>{state.quotes++;await mkdir(args[5]);await save(join(args[5],'quote.json'),{fee:state.fee,broadcast:false,endcapSigned:false,actualBurnVerified:false});return{stdout:'mock quote'};},prove:async args=>{state.proofs++;const[,policy,,calls,guard,out]=args;await mkdir(out);const request=parseLosslessJson(await readFile(calls,'utf8')),fee=request.software_defined_call.inputs[73],pre={fullUpsVerified:true,exactStackAndSessionVerified:true,compositionProfile:'two-amm-owner-funded-v1',broadcast:false,actualCalls:request.contract_calls.length+1,fee,core:{checkpoint_id:100n,new_user_leaf:{user_id:100n,public_key:opts.publicKeyHash,nonce:state.nonce+1n},state_transition:{start_user_leaf_hash:'f'.repeat(64),end_user_leaf_hash:'e'.repeat(64)},stats:{guta_fees_collected:1000000000n,da_fees_collected:state.corruptFee?4000n:3000n,slots_modified:3n,total_transactions:BigInt(request.contract_calls.length+1),user_ops_processed:1n}}};await save(join(out,'preflight.json'),pre);await save(join(out,'request.json'),{mock:true});const manifest={};for(const[key,p]of Object.entries({policy, calls,guard,preflight:join(out,'preflight.json'),request:join(out,'request.json')}))manifest[key+'Sha256']=sha256(await readFile(p));await save(join(out,'prepared.json'),manifest);last={manifest,pre};return{stdout:'mock proof'};}}),
 submitDriver:async(_bin,args)=>{state.sends++;const out=args[7];await mkdir(out);await save(join(out,'intent.json'),{requestSha256:last.manifest.requestSha256,userId:100n,nonce:last.pre.core.new_user_leaf.nonce,endUserLeafHash:last.pre.core.state_transition.end_user_leaf_hash});await save(join(out,'verification.json'),{fullUpsVerified:true,reproved:false,preparedManifestSha256:args[6],requestSha256:last.manifest.requestSha256});state.nonce++;f.state.checkpoint=101;}
 };f.state.rpc=async(_url,m)=>m==='psy_get_user_leaf_data'?{nonce:state.nonce,public_key:opts.publicKeyHash}:'f'.repeat(64);
 const create=()=>createCompositionAdapter(opts,dependencies),journal=new ExecutionJournal({directory:opts.runtimeDirectory,network:opts.network,vaultId:100,fingerprint:opts.fingerprint});
 return{...f,rpcState:f.state,opts,state,dir,create,journal,io:dependencies,cleanup:async()=>rm(dir,{recursive:true,force:true})};
}
test('formal journal persists exact financial request; lost receipt blocks a new proof and restart reconciles original',async()=>{const x=await fixture();let a,b;try{a=await x.create();await x.journal.reconcile(a.reconcile);const s=await selectCompositionAction(a,x.journal),task=s.task;const r=await executeCycle({adapter:{...a,scan:async()=>({action:task,checkpoint:100})},journal:x.journal});assert.equal(r.status,'unresolved');assert.equal(x.state.proofs,1);assert.equal(x.state.sends,1);await a.close();a=null;
 x.dependencies.set(1000,{...x.dependencies.get(1000),codeRoot:'b'.repeat(64)});b=await x.create();const oldQuotes=x.state.quotes;assert.equal((await selectCompositionAction(b,x.journal)).status,'unresolved');assert.equal(x.state.quotes,oldQuotes);assert.equal(x.state.proofs,1);
 // A later dependency update must block NEW work but cannot erase an exact
 // already included receipt. Reconciliation does not re-plan against new code.
 x.dependencies.set(1000,{...x.dependencies.get(1000),codeRoot:'b'.repeat(64)});x.state.included=true;const recovered=await x.journal.reconcile(b.reconcile);assert.equal(recovered[0].result.status,'included');assert.equal((await x.journal.unresolved()).length,0);await assert.rejects(()=>b.scan(),/dependency changed/);assert.equal(x.state.sends,1);
 }finally{await a?.close();await b?.close();await x.cleanup();}});
test('stale nonce, wrong network/dependency/metadata and modified inputs cannot authorize a financial send',async()=>{const x=await fixture();let a;try{a=await x.create();const task=await a.quote((await a.scan()).action),proof=await a.prove(task);assert.equal(await a.validateProof(task,proof),true);x.state.nonce=1n;assert.equal(await a.validateProof(task,proof),false);x.state.nonce=0n;
 for(const edit of [()=>x.state.corruptFee=true]){edit();await assert.rejects(()=>a.prove(task));}x.state.corruptFee=false;
 const originalNetwork=x.rpcState.networkName;x.rpcState.networkName='wrong-network';await assert.rejects(()=>a.scan());x.rpcState.networkName=originalNetwork;
 const leaf=x.dependencies.get(1000);x.dependencies.set(1000,{...leaf,layoutRoot:'b'.repeat(64)});await assert.rejects(()=>a.scan(),/dependency changed/);x.dependencies.set(1000,leaf);
 const old=x.opts.sdkManifestHash;x.opts.sdkManifestHash='0'.repeat(64);await assert.rejects(()=>x.create());x.opts.sdkManifestHash=old;
 x.put(5,42,33554445,9);await assert.rejects(()=>a.scan(),/decimals/);x.put(5,42,33554445,18);x.put(5,43,3,0);await assert.rejects(()=>a.scan(),/immutable/);x.put(5,43,3,1);
 await writeFile(x.opts.plan,'{}');await assert.rejects(()=>a.isCurrent(task),/input changed/);assert.equal(x.state.sends,0);
 }finally{await a?.close();await x.cleanup();}});
test('compiled inspection binds actual controller roots and rejects a mismatched artifact before resident startup',async()=>{const x=await fixture();try{x.state.wrongInspection=true;await assert.rejects(()=>x.create(),/compiled controller identity codeRoot/);assert.equal(x.state.proofs,0);assert.equal(x.state.sends,0);}finally{await x.cleanup();}});

test('saved initial path preserves full source gates and checks actual live deployer on every new action',async()=>{const x=await fixture();let a;try{const request=x.opts.controllerArtifact,bytes=await readFile(request),deployer='a'.repeat(64);x.opts.initialDeployment={request,requestSha256:sha256(bytes),deployer,verifier:{file:'explicit test stub',sha256:'0'.repeat(64)}};const leaf=x.rpcState.contractLeaf;x.rpcState.contractLeaf=async id=>({...await leaf(id),deployer});let checked=0;x.io.verifyInitialDeployment=async()=>({expectedDeployer:deployer,check:async()=>checked++});const invoke=x.io.runDriver;x.io.runDriver=async(...args)=>{assert.notEqual(args[1][0],'inspect-controller','saved proof must not be regenerated');return invoke(...args);};a=await x.create();await a.scan();assert.ok(checked>0);x.rpcState.contractLeaf=async id=>({...await leaf(id),deployer:'b'.repeat(64)});await assert.rejects(()=>a.scan(),/deployment owner changed/);assert.equal(x.state.sends,0);}finally{await a?.close();await x.cleanup();}});
test('one advisory fee trace survives a new adapter while every resulting UPS checks actual burn',async()=>{
 const x=await fixture();let a,b;
 try{
  a=await x.create();const proposal=(await a.scan()).action,task=await a.quote(proposal);
  assert.equal(x.state.quotes,1);assert.equal(await a.validateFeePreparation(task),true);
  await x.journal.locked(()=>x.journal.append({status:'planned',taskId:'exact',task}));await a.close();a=null;
  b=await x.create();const selected=await selectCompositionAction(b,x.journal);
  assert.equal(selected.reusedPreparedFee,true);assert.equal(x.state.quotes,1);assert.equal(x.state.proofs,0);
  // A changed account nonce is NOT reusable state proof: prove constructs the
  // fresh session. The advisory fee is still only a bounded proposal.
  x.state.nonce=3n;const p=await b.prove(task);assert.equal(await b.validateProof(task,p),true);
  x.state.nonce=4n;assert.equal(await b.validateProof(task,p),false);
  x.state.corruptFee=true;await assert.rejects(()=>b.prove(task));assert.equal(x.state.sends,0);
 }finally{await a?.close();await b?.close();await x.cleanup();}
});
test('retained advisory trace detects tampering, expiry, code/key/network/metadata changes and cancellation',async()=>{
 const x=await fixture();let a;
 try{a=await x.create();const task=await a.quote((await a.scan()).action);
  const old=x.rpcState.checkpoint;x.rpcState.checkpoint=165;assert.equal(await a.validateFeePreparation(task),false);x.rpcState.checkpoint=old;
  const network=x.rpcState.networkName;x.rpcState.networkName='other';await assert.rejects(()=>a.validateFeePreparation(task));x.rpcState.networkName=network;
  x.put(5,42,33554445,9);await assert.rejects(()=>a.validateFeePreparation(task),/decimals/);x.put(5,42,33554445,18);
  const originalIds=x.rpcState.userIds;x.rpcState.userIds=async()=>[];await assert.rejects(()=>a.validateFeePreparation(task),/registration/);x.rpcState.userIds=originalIds;
  const original=x.dependencies.get(1000);x.dependencies.set(1000,{...original,codeRoot:'b'.repeat(64)});await assert.rejects(()=>a.validateFeePreparation(task),/dependency changed/);x.dependencies.set(1000,original);
  x.funded();const open=await a.quote((await a.scan()).action);x.field(200,'request_cancelled',1n);assert.equal(await a.validateFeePreparation(open),false);x.field(200,'request_cancelled',0n);x.field(100,'phase',0n);
  const altered={...task,validUntilCheckpoint:'163'};assert.equal(await a.validateFeePreparation(altered),false);
  const {readdir}=await import('node:fs/promises');const roots=join(x.opts.runtimeDirectory,'composition/sepolia/100');const dirs=await readdir(roots);let record;
  for(const d of dirs)for(const n of await readdir(join(roots,d)))if(/^fee-preparation-.*\.json$/.test(n)){const p=join(roots,d,n),r=parseLosslessJson(await readFile(p,'utf8'));if(r.taskSha256===sha256(losslessJson(task)))record=p;}
  assert.ok(record);await writeFile(record,'{}');await assert.rejects(()=>a.validateFeePreparation(task));assert.equal(x.state.sends,0);
 }finally{await a?.close();await x.cleanup();}
});
test('a second quote of the same exact task preserves the first record and complete fee checks',async()=>{
 const x=await fixture();let a;try{a=await x.create();const proposal=(await a.scan()).action,t1=await a.quote(proposal),t2=await a.quote(proposal);assert.deepEqual(t1,t2);assert.equal(await a.validateFeePreparation(t2),true);assert.equal(x.state.quotes,2);}finally{await a?.close();await x.cleanup();}
});
