// Pure manifest and unsigned-call-plan regression. No RPC, keys, proofs or sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync,realpathSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readReviewedAbis} from '../../tests/fixtures/reviewedAbis.mjs';
import {FRESH_CORE_AMM_STAGES,caseFile,freshCaseArtifact,validateFreshCoreManifest,planFreshCoreAmmStage,assertFreshEnvironment,assertFreshActorAnchor,assertFreshInitialAnchor,assertFreshRefundAssets,freshApprovedActor,assertFreshStagePlan,assertFreshFormalTask,assertFreshNativeApproval,assertFreshIncludedReceipt,assertFreshJourneyOutputs,assertFreshSnapshotVault} from './freshCoreAmmLive.mjs';
import {assertFreshJourneyReport,assertFreshSavedCohortAudit,assertFreshCohortPhase,FRESH_CORE_AMM_SNAPSHOTS} from './freshCoreAmmLive.mjs';
import {swapQuote,FEE_ESCROW,losslessJson,parseLosslessJson} from '../../amm/u124/client.mjs';
import {PROFILE} from '../../batching/mainnet-beta/native.mjs';
import {CORE_DEPENDENCY_KEY_PROFILE} from '../coreDependencyPolicy.mjs';
import {runInNewContext} from 'node:vm';
import {sha256} from '../requestBinding.mjs';

const hash='a'.repeat(64),SDK='01b8f2b0a077367a7b9879baba1a72aea8ab5510',CLIENT='7058070057c3242b5d8b29e1a31d498aaa4202c0';
function fixture(){
 const abi=readReviewedAbis().admission.markets.amm.artifact.abi,token=readReviewedAbis().admission.token.abi,
  config={assetA:301,assetB:302,networkMagic:'1384803358401154921'},
  policy={version:2,market:'amm',market_id:303,chain_root_at1:hash,config,sdk_commit:SDK,client_commit:CLIENT,native_protocol:PROFILE,execution_scope:'explicit-selected-orders-v1',qualified_randomness:false,whole_market_completeness:false,
   key_profile:CORE_DEPENDENCY_KEY_PROFILE,dependency_bindings:[0,301,302,303].map(contractId=>({contractId,deployer:contractId?401:0,codeRoot:hash,layoutRoot:hash,functionTreeRoot:hash,stateTreeHeight:contractId?31:32,layoutFieldCount:8,layoutSlotCount:99}))},
  reg={marketId:303,vaultId:403,chainRootAt1:hash,publicKeyHash:hash,fingerprint:hash},selected={marketId:303,chainRootAt1:hash},
  member={userId:403,registrationMembershipVerified:true},actorsFile={rows:[{userId:401,publicKeyHash:hash},{userId:402,publicKeyHash:hash}]},
  plan={createdAt:'2026-11-16T12:00:00Z',maximumWallSeconds:10800,maximumFeePsy:'60',maximumNewFullUps:20,ordinaryQaUsers:[401,402]},
  manifest={schema:1,network:'testnet',sdkCommit:SDK,clientCommit:CLIENT,issuerId:401,traderId:402,
   initialNativeCohortBaseUnits:'1000000000000',initialActors:[401,402,403].map(userId=>({userId,endUserLeafHash:hash,nonce:'1'})),
   rpcConfig:'testnet-config-v1.json',compactBinary:'bin-v1/compact_market_wallet',ordinaryBinary:'bin-v1/isolated_wallet',runtimeResources:'readonly-v1/runtime-response.json',sdkManifest:'frozen-sdk-v1/manifest.json',sdkManifestSha256:hash,symbolA:'5325121',symbolB:'5325122',files:{}};
 for(const file of ['public/PLAN-v1.json','public/AMM-VAULT-v1.json','public/AMM-SELECTED-v1.json','public/AMM-VAULT-REGISTERED-v1.json','public/ACTORS-v1.json',
  'bound-core-v1/dependencies.json','bound-core-v1/abi.json','bound-core-v1/config.json','bound-core-v1/policy.json','bound-core-v1/asset-a-abi.json','bound-core-v1/asset-b-abi.json',manifest.rpcConfig,manifest.compactBinary,manifest.ordinaryBinary,manifest.runtimeResources,manifest.sdkManifest])manifest.files[file]=hash;
 return {manifest,plan,reg,selected,member,actorsFile,policy,config,context:{policy,config,marketId:303n,vaultId:403n,issuerId:401n,traderId:402n,marketAbi:abi,tokenAbi:token}};
}
test('fresh manifest binds new actors, deployment, chain, artifacts and exactly twenty reserved UPS',()=>{
 const x=fixture();assert.deepEqual(validateFreshCoreManifest(x),{issuerId:401,traderId:402});
 assert.equal(FRESH_CORE_AMM_STAGES.length,20);assert.equal(FRESH_CORE_AMM_STAGES.filter(([,kind])=>kind==='ordinary').length,13);
 assert.equal(FRESH_CORE_AMM_STAGES.filter(([,kind])=>kind==='formal-core').length,7);assert.equal(new Set(FRESH_CORE_AMM_STAGES.map(([name])=>name)).size,20);
 assert.equal(FRESH_CORE_AMM_STAGES.length*3,60);
});
test('a separately pinned allocated journey plan preserves the original draft and rejects unsafe paths',()=>{
 const x=fixture();x.manifest.journeyPlan='public/JOURNEY-PLAN-v1.json';x.manifest.files[x.manifest.journeyPlan]=hash;
 assert.doesNotThrow(()=>validateFreshCoreManifest(x));
 delete x.manifest.files['public/PLAN-v1.json'];assert.doesNotThrow(()=>validateFreshCoreManifest(x),'only the selected plan is required; the draft need not be repinned or rewritten');
 delete x.manifest.files[x.manifest.journeyPlan];assert.throws(()=>validateFreshCoreManifest(x),'selected plan must be pinned');
 for(const name of ['../outside.json','/absolute.json','.secrets/issuer.json','.secrets\\issuer.json','.secrets']){const y=fixture();y.manifest.journeyPlan=name;y.manifest.files[name]=hash;assert.throws(()=>validateFreshCoreManifest(y));}
});
test('frozen release, old identities, wider budget, missing resources and secret pinning fail closed',()=>{
 const edits=[x=>x.manifest.sdkCommit='b'.repeat(40),x=>x.manifest.clientCommit='b'.repeat(40),x=>x.manifest.network='other',
  x=>x.plan.maximumNewFullUps=21,x=>x.plan.maximumFeePsy='61',x=>x.reg.vaultId=1182848,x=>x.reg.marketId=51,
  x=>x.config.assetA=49,x=>x.manifest.issuerId=971904,x=>x.manifest.traderId=668800,x=>x.member.registrationMembershipVerified=false,
  x=>x.selected.chainRootAt1='b'.repeat(64),x=>x.policy.sdk_commit='b'.repeat(40),x=>x.policy.qualified_randomness=true,
  x=>delete x.policy.key_profile,x=>delete x.policy.dependency_bindings,x=>x.policy.key_profile='legacy',x=>x.policy.dependency_bindings[1].deployer=402,
  x=>x.actorsFile.rows.pop(),x=>x.manifest.initialActors.pop(),x=>x.manifest.initialActors[0].nonce='-1',
  x=>delete x.manifest.files[x.manifest.runtimeResources],x=>x.manifest.files['.secrets/issuer.json']=hash,
  x=>x.manifest.files['../another-case/input.json']=hash,x=>x.manifest.compactBinary='/tmp/unpinned-driver',x=>x.manifest.symbolB=x.manifest.symbolA];
 for(const edit of edits){const x=fixture();edit(x);assert.throws(()=>validateFreshCoreManifest(x));}
 for(const p of ['/absolute','../parent','safe/../../parent','safe//file','safe/./file',''])assert.throws(()=>caseFile('/case',p));
 assert.equal(caseFile('/case','public/input.json'),'/case/public/input.json');
});
test('Native funding and claim use only this fresh cohort and do not imply wallet approval',()=>{
 const {context}=fixture(),fund=planFreshCoreAmmStage(context,'native_fund_trader'),claim=planFreshCoreAmmStage(context,'native_claim_trader');
 assert.equal(fund.actorId,401n);assert.deepEqual(fund.contract_calls,[{contract_id:0n,method_name:'transfer',inputs:[402n,50000000000n]}]);
 assert.equal(claim.actorId,402n);assert.deepEqual(claim.contract_calls,[{contract_id:0n,method_name:'claim',inputs:[401n]}]);
 for(const p of [fund,claim]){assert.equal(p.unsigned,true);assert.equal(p.proofVerified,false);assert.equal(p.liveAccepted,false);}
 assert.throws(()=>planFreshCoreAmmStage({...context,policy:{...context.policy,sdk_commit:'b'.repeat(40)}},'native_fund_trader'));
});
test('fresh planner preserves market open, payout, cancellation and refund semantics with dynamic IDs',()=>{
 const {context}=fixture(),unit=10n**18n,reserveA=20n*unit,reserveB=20n*unit,quote=swapQuote(unit,reserveA,reserveB),terms={deadline:200n,minOut:quote*99n/100n,reserveA,reserveB,quote};
 const setup=planFreshCoreAmmStage(context,'issuer_setup',{symbolA:1n,symbolB:2n});assert.equal(setup.contract_calls.length,8);
 assert.deepEqual([...new Set(setup.contract_calls.map(c=>c.contract_id))],[301n,302n]);
 const open=planFreshCoreAmmStage(context,'swap_open',terms),cancel=planFreshCoreAmmStage(context,'cancelled_swap_open',terms);
 assert.equal(open.actorId,402n);assert.equal(open.contract_calls.find(c=>c.method_name==='open_swap').inputs.at(-1),2n);
 assert.equal(cancel.contract_calls.find(c=>c.method_name==='open_swap').inputs.at(-1),3n);assert.equal(cancel.contract_calls.at(-1).method_name,'request_cancel');
 const sponsor=planFreshCoreAmmStage(context,'sponsor_batch',{nonce:3n});assert.equal(sponsor.actorId,401n);
 assert.deepEqual(sponsor.contract_calls[0].inputs,[403n,2n*FEE_ESCROW,3n,1n]);
 const payout=planFreshCoreAmmStage(context,'swap_claim_close');assert.deepEqual(payout.contract_calls.map(c=>[c.contract_id,c.method_name]),[[302n,'claim'],[303n,'close_swap_0']]);
 const refund=planFreshCoreAmmStage(context,'refund_claim_close',{observedNativePending:FEE_ESCROW});
 assert.deepEqual(refund.contract_calls.map(c=>[c.contract_id,c.method_name]),[[301n,'claim'],[0n,'claim'],[303n,'close_swap_0']]);
 assert.ok([...open.contract_calls,...cancel.contract_calls,...refund.contract_calls].filter(c=>c.inputs[0]===403n).length>0);
});
test('hex SDK domains compare numerically and only plain lossless verifier results are accepted',()=>{
 const args={networkName:'testnet',networkMagic:'0x1337bc6317a10069',marketMagic:String(BigInt('0x1337bc6317a10069')),resources:{verifier_only:{digest:[1n,2n]},common:{degree_bits:15n}},pinnedResources:{verifier_only:{digest:[1n,2n]},common:{degree_bits:15n}}};
 assert.doesNotThrow(()=>assertFreshEnvironment(args));
 for(const edit of [v=>v.networkName='other',v=>v.networkMagic='0x1',v=>v.resources.common.degree_bits=16n,v=>v.pinnedResources={result:v.pinnedResources}]){const x=structuredClone(args);edit(x);assert.throws(()=>assertFreshEnvironment(x));}
});
test('an unexpected actor leaf, nonce, key or identity stops before a proof/sign/send callback',()=>{
 const args={userId:401,publicKeyHash:hash,expected:{hash,nonce:4n},leaf:{user_id:401n,public_key:hash,nonce:4n},leafHash:hash};let callbacks=0;
 const beforeProof=x=>{assertFreshActorAnchor(x);callbacks++;};beforeProof(args);assert.equal(callbacks,1);
 for(const edit of [v=>v.leafHash='b'.repeat(64),v=>v.leaf.nonce=5n,v=>v.leaf.public_key='b'.repeat(64),v=>v.leaf.user_id=402n,v=>v.leaf.nonce=4,v=>v.expected=undefined]){const x=structuredClone(args);edit(x);assert.throws(()=>beforeProof(x));assert.equal(callbacks,1);}
});
test('initial restart anchors compare exact values across actual lossless and plain objects',()=>{
 const expected={hash,nonce:9007199254740993n},parsed=parseLosslessJson('{"hash":"'+hash+'","nonce":9007199254740993}');assert.equal(Object.getPrototypeOf(parsed),null);
 assert.doesNotThrow(()=>assertFreshInitialAnchor(parsed,expected));assert.doesNotThrow(()=>assertFreshInitialAnchor({...expected},expected));
 for(const changed of [{...expected,extra:true},{...expected,hash:'b'.repeat(64)},{...expected,nonce:9007199254740994n},{hash},{...expected,nonce:9007199254740993},{...expected,nonce:'9007199254740993'}])assert.throws(()=>assertFreshInitialAnchor(changed,expected));
});
test('parsed restart refund snapshots retain exact asset, type and key checks without prototype dependence',()=>{
 const previous=parseLosslessJson('{"native":50,"a":9007199254740993,"b":17}'),after=parseLosslessJson('{"native":49,"a":9007199254740993,"b":17}');
 assert.doesNotThrow(()=>assertFreshRefundAssets(after,previous));assert.doesNotThrow(()=>assertFreshRefundAssets({...after},{...previous}));
 for(const changed of [{...after,a:after.a+1n},{...after,b:0n},{...after,native:-1n},{...after,extra:0n},{...after,a:Number(after.a)}])assert.throws(()=>assertFreshRefundAssets(changed,previous));
});
test('signer approval carries the exact reviewed state, signer and lossless next nonce',()=>{
 assert.deepEqual(freshApprovedActor(401,hash,{hash,nonce:9007199254740993n}),{userId:401,publicKeyHash:hash,startUserLeafHash:hash,nextNonce:'9007199254740994'});
 assert.deepEqual(freshApprovedActor(402,hash,{hash:'0'.repeat(64),nonce:0n,unmaterialized:true}),{userId:402,publicKeyHash:hash,startUserLeafHash:'0'.repeat(64),nextNonce:'1'});
 for(const [id,key,anchor]of [[0,hash,{hash,nonce:0n}],[401,'0'.repeat(64),{hash,nonce:0n}],[401,hash,{hash,nonce:1}],[401,hash,{hash,nonce:-1n}],[401,hash,{hash,nonce:2n**62n}]])assert.throws(()=>freshApprovedActor(id,key,anchor));
});
test('zero initial observations require exact empty fields and unique registration but remain first-use candidates',()=>{
 const zero='0'.repeat(64),args={userId:402,publicKeyHash:hash,expected:{hash:zero,nonce:0n,unmaterialized:true},leaf:{user_id:402n,public_key:zero,nonce:0n,balance:0n,last_checkpoint_id:0n,event_index:0n,user_state_tree_root:hash},leafHash:zero,registeredIds:[402]};
 assert.doesNotThrow(()=>assertFreshActorAnchor(args));
 for(const edit of [v=>delete v.expected.unmaterialized,v=>v.expected.nonce=1n,v=>v.leaf.public_key=hash,v=>v.leaf.balance=1n,v=>v.leaf.last_checkpoint_id=1n,v=>v.leaf.event_index=1n,v=>v.leaf.user_id=401n,v=>v.registeredIds=[],v=>v.registeredIds=[401],v=>v.registeredIds=[402,403],v=>v.leaf.user_state_tree_root='unreviewed',v=>v.expected.emptyStateTreeRoot='b'.repeat(64)]){const x=structuredClone(args);edit(x);assert.throws(()=>assertFreshActorAnchor(x));}
 assert.throws(()=>freshApprovedActor(402,hash,{hash:zero,nonce:0n}),/first-use/);
 const x=fixture();x.manifest.initialActors[1]={userId:402,endUserLeafHash:zero,nonce:'0',unmaterialized:true};assert.doesNotThrow(()=>validateFreshCoreManifest(x));
 for(const edit of [v=>delete v.unmaterialized,v=>v.nonce='1',v=>v.endUserLeafHash=hash]){const y=structuredClone(x);edit(y.manifest.initialActors[1]);assert.throws(()=>validateFreshCoreManifest(y));}
});
test('persisted ordinary plans must equal complete canonical calls, actor, terms and artifact pins before work',()=>{
 const {context}=fixture(),pins={policySha256:hash,dependenciesSha256:hash},stage='native_fund_trader',terms={},expected={...planFreshCoreAmmStage(context,stage,terms),...pins};let callbacks=0;
 const beforeWork=stored=>{assertFreshStagePlan(context,stage,terms,pins,stored);callbacks++;};beforeWork(expected);assert.equal(callbacks,1);
 for(const edit of [v=>v.actorId=402n,v=>v.contract_calls[0].contract_id=301n,v=>v.contract_calls[0].inputs[0]=999n,v=>v.contract_calls[0].inputs[1]=51000000000n,v=>v.contract_calls[0].method_name='claim',v=>v.contract_calls.push(v.contract_calls[0]),v=>v.policySha256='b'.repeat(64),v=>v.dependenciesSha256='b'.repeat(64),v=>v.proofVerified=true,v=>v.extraAuthorization=true]){const changed=structuredClone(expected);edit(changed);assert.throws(()=>beforeWork(changed));assert.equal(callbacks,1);}
 const unit=10n**18n,quote=swapQuote(unit,20n*unit,20n*unit),swapTerms={deadline:200n,minOut:quote*99n/100n,reserveA:20n*unit,reserveB:20n*unit,quote},plan={...planFreshCoreAmmStage(context,'swap_open',swapTerms),...pins};
 assert.doesNotThrow(()=>assertFreshStagePlan(context,'swap_open',swapTerms,pins,plan));
 for(const changedTerms of [{...swapTerms,deadline:201n},{...swapTerms,minOut:1n}])assert.throws(()=>assertFreshStagePlan(context,'swap_open',changedTerms,pins,plan),/exact canonical stage/);
 const changed=structuredClone(plan);changed.observations.minOut=1n;assert.throws(()=>assertFreshStagePlan(context,'swap_open',swapTerms,pins,changed));
});
test('fresh ordinary stage never reconstructs a missing plan and rechecks the original resource pins',async()=>{
 // Execute only the production ordinary stage closure in isolation. The live
 // financial runner is never invoked and no real case, secret or evidence file
 // is read: every filesystem/RPC/wallet boundary below is a fake that records
 // calls or stops execution.
 const source=readFileSync(new URL('./freshCoreAmmLive.mjs',import.meta.url),'utf8');
 const start=source.indexOf('  const ordinaryStep=async('),end=source.indexOf('  const formalStep=async(',start);
 assert.ok(start>=0&&end>start,'production ordinary stage closure required');
 const closure=source.slice(start,end),{context}=fixture(),base='/synthetic-fresh-case';
 const name='core-lp-sponsor-v1',aliasLabel='core-lp-sponsor-alias-v1',stage='sponsor_batch',terms={nonce:1n};
 const policyBytes=Buffer.from('synthetic policy'),dependencyBytes=Buffer.from('synthetic dependencies');
 const planPath=join(base,'public',name+'-plan.json');
 const canonical={...planFreshCoreAmmStage(context,stage,terms),policySha256:sha256(policyBytes),dependenciesSha256:sha256(dependencyBytes)};
 const exercise=async({saved,attempt=false,inputs=[],alias=false,changed=null,confirmReturns=false}={})=>{
  const events=[],stop=Error('synthetic boundary'),label=alias?aliasLabel:name,out=join(base,'attempts',label);
  const files=new Map(saved===undefined?[]:[[planPath,saved]]),dirs=new Set(attempt?[out]:[]),reads={};
  for(const l of inputs)files.set(join(base,'public',l+'.json'),{});
  const ordinaryStep=runInNewContext(`(function(){${closure}\nreturn ordinaryStep;})()`,{
   assert,join,base,context,planFreshCoreAmmStage,assertFreshStagePlan,freshApprovedActor,sha256,parseLosslessJson,losslessJson,
   // Production keeps the outer issuerId as a Number; context.issuerId is the same actor as BigInt.
   issuerId:Number(context.issuerId),
   options:{policy:'policy',dependencyBindings:'dependencies'},secondary:alias?{replacementLabel:aliasLabel}:null,continuation:null,
   SPONSOR_ORIGINAL:name,ACTIVATION_ORIGINAL:'core-activate-v1',
   actors:new Map([[401,{publicKeyHash:hash}],[402,{publicKeyHash:hash}]]),anchors:new Map([[401,{hash,nonce:1n}]]),
   sourceCurrent:()=>{},
   exact:path=>{assert.ok(files.has(path),'unexpected evidence read '+path);return parseLosslessJson(losslessJson(files.get(path)));},
   readFileSync:path=>{assert.ok(['policy','dependencies'].includes(path),'unexpected resource read '+path);reads[path]=(reads[path]??0)+1;
    return changed&&changed.field===path&&reads[path]>changed.after?Buffer.from('changed '+path):path==='policy'?policyBytes:dependencyBytes;},
   existsSync:path=>files.has(path)||dirs.has(path),
   // Production save persists bytes within its own realm. Normalize the VM-realm
   // plan object to host structured data at this fake storage boundary so exact
   // still exercises the real lossless codec unchanged.
   save:(path,value)=>{events.push('save');files.set(path,structuredClone(value));},
   unresolved:async()=>events.push('reconcile-vault'),reserve:()=>events.push('reserve'),
   fresh:async()=>{events.push('fresh');return {};},checkActorAnchor:async()=>events.push('anchor'),
   worker:async id=>{events.push(['worker',id]);return {};},
   ordinary:async args=>{events.push(['ordinary',args.calls]);throw stop;},
   // Reconciliation stops at the synthetic boundary by default. Only an explicit
   // opt-in returns normally, so the production post-confirm pin recheck runs.
   confirmUps:async(_config,path)=>{events.push(['confirm',path]);if(!confirmReturns)throw stop;},
   config:'synthetic config',ordinaryBinary:'synthetic wallet',bindings:new Map(),env:{},outputs:[],auditReceipt:()=>0n,console:{log:()=>{}},
  });
  let error;try{await ordinaryStep(name,stage,terms);}catch(caught){error=caught;}
  return {events,error,stop,out};
 };
 for(const missing of [{attempt:true},{inputs:[name]},{alias:true,attempt:true},{alias:true,inputs:[name]},{alias:true,inputs:[aliasLabel]},{alias:true,inputs:[name,aliasLabel]}]){
  const {events,error}=await exercise(missing);
  assert.match(error.message,/missing original saved plan; review rather than reconstruct/);
  assert.deepEqual(events,['reconcile-vault','reserve']);
 }
 for(const edit of [p=>p.actorId=402n,p=>p.contract_calls[0].inputs[0]=999n,p=>p.contract_calls.push({...p.contract_calls[0]}),
  p=>p.policySha256='b'.repeat(64),p=>p.liveAccepted=true]){
  const changed=structuredClone(canonical);edit(changed);
  for(const attempt of [false,true]){
   const {events,error}=await exercise({saved:changed,attempt});
   assert.match(error.message,/persisted ordinary plan differs/);assert.deepEqual(events,[]);
  }
 }
 for(const alias of [false,true]){
  const resumed=await exercise({saved:canonical,attempt:true,alias});
  assert.equal(resumed.error,resumed.stop);
  assert.deepEqual(resumed.events,['reconcile-vault','reserve',['confirm',resumed.out]]);
 }
 const calls=parseLosslessJson(losslessJson(canonical.contract_calls));
 const reused=await exercise({saved:canonical});
 assert.equal(reused.error,reused.stop);
 assert.deepEqual(reused.events,['reconcile-vault','reserve','fresh','anchor',['worker',401],['ordinary',calls]]);
 const created=await exercise({});
 assert.equal(created.error,created.stop);
 assert.deepEqual(created.events,['reconcile-vault','reserve','save','fresh','anchor',['worker',401],['ordinary',calls]]);
 const early=await exercise({saved:canonical,changed:{field:'policy',after:1}});
 assert.match(early.error.message,/pinned policy changed during the stage/);assert.deepEqual(early.events,['reconcile-vault']);
 const earlyDeps=await exercise({saved:canonical,attempt:true,changed:{field:'dependencies',after:1}});
 assert.match(earlyDeps.error.message,/pinned dependencies changed during the stage/);assert.deepEqual(earlyDeps.events,['reconcile-vault']);
 const beforeWallet=await exercise({saved:canonical,changed:{field:'policy',after:2}});
 assert.match(beforeWallet.error.message,/pinned policy changed during the stage/);
 assert.deepEqual(beforeWallet.events,['reconcile-vault','reserve','fresh','anchor']);
 const afterConfirm=await exercise({saved:canonical,attempt:true,confirmReturns:true,changed:{field:'policy',after:2}});
 assert.match(afterConfirm.error.message,/pinned policy changed during the stage/);
 assert.deepEqual(afterConfirm.events,['reconcile-vault','reserve',['confirm',afterConfirm.out]]);
});
test('saved formal tasks must match the original journal plan or the exact new scan',()=>{
 const task={kind:'batch_settle',batchId:'2',minimumSourceCheckpoint:100,validUntilCheckpoint:'120',submission:'exact frozen calls',snapshot:{vault:'a'}},expected={kind:'batch_settle',batchId:2,plannedTask:structuredClone(task)};
 assert.doesNotThrow(()=>assertFreshFormalTask(task,expected));assert.doesNotThrow(()=>assertFreshFormalTask(task,{kind:'batch_settle',batchId:2,currentTask:structuredClone(task)}));
 for(const edit of [v=>v.kind='batch_commit',v=>v.batchId='3',v=>v.submission='changed calls',v=>v.validUntilCheckpoint='999',v=>v.minimumSourceCheckpoint=99,v=>v.snapshot.vault='b',v=>v.extra=true]){const changed=structuredClone(task);edit(changed);assert.throws(()=>assertFreshFormalTask(changed,expected));}
 assert.throws(()=>assertFreshFormalTask(task,{kind:'batch_settle',batchId:2}),/original journal/);
});
test('Native approval adoption requires successful raw membership and nonce freshness for both first and later UPS',()=>{
 for(const first of [false,true]){
  const approved={userId:401,publicKeyHash:hash,startUserLeafHash:first?'0'.repeat(64):hash,nextNonce:first?'1':'5'},
   pre={fullUpsVerified:true,approvalBound:true,core:{checkpoint_id:100n,new_user_leaf:{user_id:401n,nonce:BigInt(approved.nextNonce),public_key:hash},state_transition:{start_user_leaf_hash:approved.startUserLeafHash}},
    approvedActorSession:{...approved,isNewUser:first,startContextLeafHash:hash},
    approvedActorFreshState:{checkpointId:102n,userId:401n,observedNonce:first?'0':'4',rawUserLeafHash:approved.startUserLeafHash,userTreeRoot:hash,checkpointGlobalChainRoot:hash,rawMembershipVerified:true,assurance:'freshness relative to observed checkpoint roots; not independent finality authentication'}},
   window={validUntilCheckpoint:128n,receiptCheckpoint:103n};
  assert.doesNotThrow(()=>assertFreshNativeApproval(pre,approved,window));
  for(const edit of [v=>delete v.approvedActorFreshState,v=>v.approvalBound=false,v=>v.fullUpsVerified=false,
   v=>v.approvedActorFreshState.rawMembershipVerified=false,v=>v.approvedActorFreshState.userId=402n,
   v=>v.approvedActorFreshState.observedNonce='7',v=>v.approvedActorFreshState.observedNonce='04',v=>v.approvedActorFreshState.observedNonce=4,
   v=>v.approvedActorFreshState.rawUserLeafHash='b'.repeat(64),v=>v.approvedActorFreshState.checkpointId=99n,
   v=>v.approvedActorFreshState.checkpointId=129n,v=>v.approvedActorFreshState.userTreeRoot='bad',
   v=>v.approvedActorFreshState.checkpointGlobalChainRoot='bad',v=>v.approvedActorFreshState.assurance='independent finality',
   v=>v.approvedActorSession.isNewUser=!first,v=>v.core.new_user_leaf.nonce=9n]){const changed=structuredClone(pre);edit(changed);assert.throws(()=>assertFreshNativeApproval(changed,approved,window));}
  assert.throws(()=>assertFreshNativeApproval(pre,approved,{...window,receiptCheckpoint:101n}));
 }
});
function receiptFixture(){
 const end='b'.repeat(64),content='c'.repeat(64);
 return {core:{checkpoint_id:100n,new_user_leaf:{user_id:403n,nonce:2n,public_key:hash},state_transition:{user_id:403n,start_user_leaf_hash:hash,end_user_leaf_hash:end},
   stats:{guta_fees_collected:1000000000n,da_fees_collected:500000000n,slots_modified:3n,total_transactions:3n,user_ops_processed:1n}},
  included:{status:'included',userId:403n,endUserLeafHash:end,contentHash:content,checkpoint:104n,commonCheckpoint:105n,
   receipt:{success:true,data:{status:'included',tx_type:'UserEndcap',owner_user_id:403n,content_hash:content,included_checkpoint_id:104n,
    result:{user_id:403n,fees_collected:1500000000n,slots_modified:3n,total_transactions:3n,user_ops_processed:1n}}}}};
}
test('inclusion evidence must settle the exact verified core, checkpoint order, stats and reserved fee',()=>{
 const {core,included}=receiptFixture();assert.equal(assertFreshIncludedReceipt(included,core),1500000000n);
 for(const edit of [v=>v.included.status='broadcast_intent',v=>v.included.receipt.success=false,v=>v.included.receipt.data.status='pending',
  v=>v.included.receipt.data.tx_type='UserStartcap',v=>v.included.userId=401n,v=>v.included.receipt.data.owner_user_id=401n,
  v=>v.included.receipt.data.result.user_id=401n,v=>v.core.state_transition.user_id=401n,v=>v.included.endUserLeafHash='d'.repeat(64),
  v=>v.included.contentHash='not-a-hash',v=>v.included.receipt.data.content_hash='d'.repeat(64),
  v=>{v.included.checkpoint=99n;v.included.receipt.data.included_checkpoint_id=99n;},v=>v.included.commonCheckpoint=103n,
  v=>v.included.receipt.data.result.slots_modified=4n,v=>v.included.receipt.data.result.total_transactions=2n,
  v=>v.included.receipt.data.result.user_ops_processed=2n,v=>delete v.included.receipt.data.result.slots_modified,
  v=>v.included.receipt.data.result.fees_collected=1500000001n,
  v=>{v.core.stats.da_fees_collected=2500000000n;v.included.receipt.data.result.fees_collected=3500000000n;}]){
  const x=receiptFixture();edit(x);assert.throws(()=>assertFreshIncludedReceipt(x.included,x.core));}
 for(const edit of [v=>v.included.userId='403',v=>v.included.checkpoint=104,v=>v.included.commonCheckpoint='105',
  v=>v.core.checkpoint_id=100,v=>v.core.stats.slots_modified=3,v=>v.included.receipt.data.owner_user_id='403',
  v=>v.included.receipt.data.result.fees_collected='1500000000',v=>v.included.receipt.data.included_checkpoint_id=104,
  v=>delete v.included.receipt.data.result,v=>delete v.core.stats,v=>delete v.included.receipt,
  v=>{v.core.state_transition.end_user_leaf_hash='0'.repeat(64);v.included.endUserLeafHash='0'.repeat(64);}]){
  const x=receiptFixture();edit(x);assert.throws(()=>assertFreshIncludedReceipt(x.included,x.core));}
 for(const bad of [null,[],'included'])assert.throws(()=>assertFreshIncludedReceipt(bad,receiptFixture().core));
 for(const bad of [null,[],{}])assert.throws(()=>assertFreshIncludedReceipt(receiptFixture().included,bad));
});
function journeyOutputs(){
 return FRESH_CORE_AMM_STAGES.map(([stage,type])=>({stage,type,fee:1500000000n,
  request:'/case/attempts/'+stage+'/request.json',preflight:'/case/attempts/'+stage+'/preflight.json',included:'/case/attempts/'+stage+'/included.json',
  requestSha256:hash,preflightSha256:hash,includedSha256:hash}));
}
test('a saved confirmation must describe the complete declared journey and stay inside the owned case',()=>{
 const outputs=journeyOutputs();assert.equal(assertFreshJourneyOutputs(outputs,{maximumFeePsy:'60'}),30000000000n);
 const short=journeyOutputs();short.pop();
 const reordered=journeyOutputs();[reordered[0],reordered[1]]=[reordered[1],reordered[0]];
 const duplicated=journeyOutputs();duplicated[1]={...duplicated[0]};
 const retyped=journeyOutputs();retyped[5].type='ordinary';
 for(const changed of [short,reordered,duplicated,retyped,[],null])assert.throws(()=>assertFreshJourneyOutputs(changed,{maximumFeePsy:'60'}));
 for(const edit of [v=>v[0].fee=1500000000,v=>v[0].fee='1500000000',v=>v[0].fee=-1n,v=>v[0].fee=3000000001n,
  v=>v[0].includedSha256='b',v=>delete v[0].requestSha256,v=>v[0].preflight='']){
  const changed=journeyOutputs();edit(changed);assert.throws(()=>assertFreshJourneyOutputs(changed,{maximumFeePsy:'60'}));}
 assert.throws(()=>assertFreshJourneyOutputs(outputs,{maximumFeePsy:'29'}));
 const shared=journeyOutputs();for(const row of shared)for(const role of ['request','preflight','included'])row[role]=shared[0][role];
 assert.throws(()=>assertFreshJourneyOutputs(shared,{maximumFeePsy:'60'}),'one reused recording is not twenty stages');
 const reused=journeyOutputs();reused[1].included=reused[0].included;
 assert.throws(()=>assertFreshJourneyOutputs(reused,{maximumFeePsy:'60'}));
 for(const edit of [v=>v[0].extra=true,v=>v[0]=null,v=>delete v[0].stage]){const changed=journeyOutputs();edit(changed);assert.throws(()=>assertFreshJourneyOutputs(changed,{maximumFeePsy:'60'}));}
});
test('journey output uniqueness rejects noncanonical path aliases without reading any case file',()=>{
 const [first,second]=FRESH_CORE_AMM_STAGES.map(([stage])=>stage);
 assert.equal(assertFreshJourneyOutputs(journeyOutputs(),{maximumFeePsy:'60'}),30000000000n);
 for(const role of ['request','preflight','included'])
  for(const path of ['/case/attempts/'+first+'/../'+second+'/'+role+'.json',
   '/case/attempts/'+second+'/./'+role+'.json','/case/attempts//'+second+'/'+role+'.json',
   '/case/attempts/'+second+'/sub/../'+role+'.json','/case/attempts/'+second+'/'+role+'.json/',
   'attempts/'+second+'/'+role+'.json']){
   const changed=journeyOutputs();changed[1][role]=path;
   assert.throws(()=>assertFreshJourneyOutputs(changed,{maximumFeePsy:'60'}));}
});
function confirmedReport(){
 return {marketId:303n,vaultId:403n,outputs:journeyOutputs(),totalFees:30000000000n,actualSwaps:1n,cancelledOrdersRefunded:1n,
  allKnownOutboxesClaimed:true,ordinarySdkClaimsVerified:true,browserUiAccepted:false,qualifiedRandomness:false,globalOrderCompleteness:false};
}
test('a truncated or relabelled completion report is not a finished journey',()=>{
 const identity={marketId:303,vaultId:403,maximumFeePsy:'60'};
 assert.equal(assertFreshJourneyReport(confirmedReport(),identity),30000000000n);
 for(const edit of [v=>delete v.outputs,v=>v.outputs.pop(),v=>delete v.totalFees,v=>v.totalFees=30000000000,
  v=>v.totalFees='30000000000',v=>v.totalFees=29999999999n,v=>v.marketId=303,v=>v.marketId=304n,v=>v.vaultId=404n,
  v=>delete v.actualSwaps,v=>v.actualSwaps=2,v=>v.cancelledOrdersRefunded=0,v=>v.allKnownOutboxesClaimed=false,
  v=>v.actualSwaps=1,v=>v.cancelledOrdersRefunded=1,v=>v.actualSwaps='1',v=>v.cancelledOrdersRefunded='1',
  v=>v.actualSwaps=2n,v=>v.cancelledOrdersRefunded=2n,v=>v.actualSwaps=0n,v=>v.cancelledOrdersRefunded=0n,v=>delete v.cancelledOrdersRefunded,
  v=>v.ordinarySdkClaimsVerified=false,v=>v.browserUiAccepted=true,v=>v.qualifiedRandomness=true,v=>v.globalOrderCompleteness=true]){
  const changed=confirmedReport();edit(changed);assert.throws(()=>assertFreshJourneyReport(changed,identity));}
 for(const bad of [null,[],{},'confirmed'])assert.throws(()=>assertFreshJourneyReport(bad,identity));
});
test('a restart confirmation survives the actual lossless round trip of the writer report shape',()=>{
 const identity={marketId:303,vaultId:403,maximumFeePsy:'60'},unit=10n**18n;
 // The writer saves plain Numbers for identities/counters and BigInt amounts;
 // the lossless codec returns every saved integer as a BigInt on restart.
 const writerReport=()=>{
  const snapshot={checkpoint:110n,balances:{403:{native:0n,a:20n*unit,b:20n*unit}},userLeaves:{403:{hash:'b'.repeat(64),nonce:3n}}};
  return {at:'2026-11-16T12:00:00Z',marketId:303,vaultId:403,outputs:journeyOutputs(),totalFees:30000000000n,initial:snapshot,
   actualSwaps:1,cancelledOrdersRefunded:1,allKnownOutboxesClaimed:true,ordinarySdkClaimsVerified:true,browserUiAccepted:false,
   qualifiedRandomness:false,globalOrderCompleteness:false,after:snapshot,
   boundary:'Current-chain selected-order deterministic AMM and ordinary SDK wallets only; no browser/UI, global inclusion, randomized ordering, performance comparison or production claim.'};
 };
 const saved=parseLosslessJson(losslessJson(writerReport()));
 assert.equal(Object.getPrototypeOf(saved),null);
 for(const field of ['marketId','vaultId','totalFees','actualSwaps','cancelledOrdersRefunded'])assert.equal(typeof saved[field],'bigint','persisted '+field+' must stay lossless');
 assert.equal(saved.actualSwaps,1n);assert.equal(saved.cancelledOrdersRefunded,1n);
 assert.equal(assertFreshJourneyReport(saved,identity),30000000000n);
 for(const edit of [v=>v.actualSwaps=2,v=>v.cancelledOrdersRefunded=0,v=>v.actualSwaps=0,v=>v.totalFees=29999999999,
  v=>v.marketId=304,v=>v.vaultId=404,v=>v.outputs.pop(),v=>v.outputs[0].fee=3000000001,v=>v.allKnownOutboxesClaimed=false,
  v=>v.ordinarySdkClaimsVerified=false,v=>v.browserUiAccepted=true,v=>v.qualifiedRandomness=true,v=>v.globalOrderCompleteness=true]){
  const changed=writerReport();edit(changed);
  assert.throws(()=>assertFreshJourneyReport(parseLosslessJson(losslessJson(changed)),identity));}
});
// Recorded cohort observations for the four saved snapshots. Amounts are the
// exact journey arithmetic; identities and manifest anchors come from fixture().
function cohortFixture(){
 const {manifest,plan,reg,config}=fixture(),unit=10n**18n,quote=swapQuote(unit,20n*unit,20n*unit),ids=[401,402,403];
 const pending=()=>Object.fromEntries(ids.flatMap(u=>ids.filter(v=>v!==u).map(v=>[u+':'+v,{native:0n,[config.assetA]:0n,[config.assetB]:0n}])));
 // Activation sets batch_ready = 1 permanently and finish_batch leaves phase 3.
 // Only the pre-activation observation is ready 0 / phase 0 / id 0; the LP(1),
 // swap(2) and cancelled(3) observations are ready 1 / phase 3 with their id.
 const snapshot=(checkpoint,vault,balances,reserveA,reserveB,totalShares,batchId)=>({checkpoint,balances,pending:pending(),fields:{batch_ready:batchId===0n?0n:1n,batch_phase:batchId===0n?0n:3n,batch_id:batchId},
  userLeaves:{401:{hash,nonce:1n},402:{hash,nonce:1n},403:vault},reserveA,reserveB,totalShares});
 const initial=snapshot(100n,{hash,nonce:1n},{401:{native:1000000000000n,a:0n,b:0n},402:{native:0n,a:0n,b:0n},403:{native:0n,a:0n,b:0n}},0n,0n,0n,0n);
 const lp=snapshot(110n,{hash:'b'.repeat(64),nonce:2n},{401:{native:990000000000n,a:100n*unit,b:100n*unit},402:{native:0n,a:80n*unit,b:80n*unit},403:{native:0n,a:20n*unit,b:20n*unit}},20n*unit,20n*unit,20n*unit,1n);
 const swapped=snapshot(120n,{hash:'c'.repeat(64),nonce:3n},{401:{native:980000000000n,a:100n*unit,b:100n*unit},402:{native:0n,a:79n*unit,b:80n*unit+quote},403:{native:0n,a:21n*unit,b:20n*unit-quote}},21n*unit,20n*unit-quote,20n*unit,2n);
 const after=snapshot(130n,{hash:'d'.repeat(64),nonce:4n},{401:{native:970000000000n,a:100n*unit,b:100n*unit},402:{native:0n,a:79n*unit,b:80n*unit+quote},403:{native:0n,a:21n*unit,b:20n*unit-quote}},21n*unit,20n*unit-quote,20n*unit,3n);
 const results={'core-lp-settle-v1':{checkpoint:104n,endUserLeafHash:'b'.repeat(64)},'core-swap-settle-v1':{checkpoint:106n,endUserLeafHash:'c'.repeat(64)},
  'core-cancel-settle-v1':{checkpoint:108n,endUserLeafHash:'d'.repeat(64)}};
 return {manifest,plan,reg,config,initial,lp,swapped,after,quote,results,unit,fees:30000000000n};
}
test('the shared saved-cohort audit rejects impossible balances even with correct rows and counters',()=>{
 const x=cohortFixture(),args=()=>({manifest:x.manifest,config:x.config,issuerId:401,traderId:402,vaultId:403,initial:x.initial,lp:x.lp,swapped:x.swapped,after:x.after,fees:x.fees});
 assert.doesNotThrow(()=>assertFreshSavedCohortAudit(args()));
 assert.doesNotThrow(()=>assertFreshSavedCohortAudit(parseLosslessJson(losslessJson(args()))),'the audit must survive the writer lossless round trip');
 for(const edit of [v=>v.after.balances[402].native=1n,v=>v.after.balances[401].native=1000000000000n,v=>v.after.balances[403].a=0n,
  v=>v.after.balances[402].b+=1n,v=>v.after.reserveA+=1n,v=>v.after.pending['401:402'].native=1n,
  v=>v.after.balances[402].a=Number(v.after.balances[402].a),v=>v.after.balances[404]={native:0n,a:0n,b:0n},v=>delete v.after.userLeaves[402],
  v=>v.initial.balances[401].native=1n,v=>v.initial.userLeaves[402].nonce=2n,v=>v.initial.pending['401:402'].a=1n,
  v=>v.lp.reserveA=19n*x.unit,v=>v.lp.totalShares=1n,v=>v.swapped.balances[402].b=1n,v=>v.swapped.reserveB=1n,
  v=>v.fees=29999999999n,v=>v.fees=30000000000,v=>v.after=null]){
  const changed=structuredClone(args());edit(changed);assert.throws(()=>assertFreshSavedCohortAudit(changed));}
});
test('saved cohort pending assets, recorded batch markers, checkpoint order and shares stay bound to the frozen config',()=>{
 const x=cohortFixture(),args=()=>({manifest:x.manifest,config:x.config,issuerId:401,traderId:402,vaultId:403,initial:x.initial,lp:x.lp,swapped:x.swapped,after:x.after,fees:x.fees});
 assert.doesNotThrow(()=>assertFreshSavedCohortAudit(args()));
 // The complete writer shape must survive the actual lossless round trip.
 const round=parseLosslessJson(losslessJson(args()));
 assert.doesNotThrow(()=>assertFreshSavedCohortAudit(round),'the full saved-cohort round trip must stay auditable');
 for(const snapshot of [round.initial,round.lp,round.swapped,round.after]){
  assert.equal(typeof snapshot.checkpoint,'bigint');
  for(const name of ['batch_ready','batch_phase','batch_id'])assert.equal(typeof snapshot.fields[name],'bigint');
  for(const row of Object.values(snapshot.pending))for(const value of Object.values(row))assert.equal(typeof value,'bigint');
  for(const leaf of Object.values(snapshot.userLeaves))assert.equal(typeof leaf.nonce,'bigint');
 }
 for(const [label,edit] of [
  ['missing FT outbox column',v=>{delete v.after.pending['401:402'][302];}],
  ['extra FT outbox column',v=>{v.after.pending['401:402'][303]=0n;}],
  ['relabelled FT outbox column',v=>{const p=v.lp.pending['402:403'];p[399]=p[301];delete p[301];}],
  ['missing Native outbox column',v=>{delete v.after.pending['402:401'].native;}],
  ['coerced pending amount',v=>{v.swapped.pending['403:401'].native=0;}],
  ['negative pending amount',v=>{v.initial.pending['401:403'][301]=-1n;}],
  ['missing frozen config',v=>{delete v.config;}],
  ['substituted frozen asset',v=>{v.config.assetA=399;}],
  ['duplicate frozen assets',v=>{v.config.assetB=v.config.assetA;}],
  ['mixed representation of one asset',v=>{v.config.assetB=BigInt(v.config.assetA);}],
  ['coerced frozen asset',v=>{v.config.assetA='301';}],
  ['fractional frozen asset',v=>{v.config.assetA=301.5;}],
  ['unsafe frozen asset number',v=>{v.config.assetA=Number.MAX_SAFE_INTEGER+2;}],
  ['genesis-range frozen asset',v=>{v.config.assetA=4;}],
  ['out-of-range frozen asset',v=>{v.config.assetB=2**24;}],
  ['object frozen asset',v=>{v.config.assetA={toString:()=> '301'};}],
  ['initial batch already used',v=>{v.initial.fields.batch_id=1n;}],
  ['LP batch id missing',v=>{v.lp.fields.batch_id=0n;}],
  ['swap batch id repeated',v=>{v.swapped.fields.batch_id=1n;}],
  ['final batch id short',v=>{v.after.fields.batch_id=2n;}],
  ['committed but unexecuted recorded phase',v=>{v.lp.fields.batch_phase=1n;}],
  ['executing recorded phase',v=>{v.swapped.fields.batch_phase=2n;}],
  ['expired recorded phase',v=>{v.after.fields.batch_phase=4n;}],
  ['idle phase invented after finish',v=>{v.after.fields.batch_phase=0n;}],
  ['unactivated marker after activation',v=>{v.lp.fields.batch_ready=0n;}],
  ['activated marker before activation',v=>{v.initial.fields.batch_ready=1n;}],
  ['pre-activation phase already finished',v=>{v.initial.fields.batch_phase=3n;}],
  ['coerced activation marker',v=>{v.after.fields.batch_ready=1;}],
  ['removed batch marker',v=>{delete v.swapped.fields.batch_id;}],
  ['coerced batch marker',v=>{v.after.fields.batch_id=3;}],
  ['extra batch marker',v=>{v.lp.fields.extra=0n;}],
  ['LP snapshot not after initial',v=>{v.lp.checkpoint=100n;}],
  ['swap snapshot not after LP',v=>{v.swapped.checkpoint=110n;}],
  ['final snapshot not after swap',v=>{v.after.checkpoint=119n;}],
  ['zero snapshot checkpoint',v=>{v.initial.checkpoint=0n;}],
  ['coerced snapshot checkpoint',v=>{v.lp.checkpoint=110;}],
  ['coerced actor nonce',v=>{v.after.userLeaves[402].nonce=1;}],
  ['negative actor nonce',v=>{v.after.userLeaves[402].nonce=-1n;}],
  ['malformed actor leaf hash',v=>{v.lp.userLeaves[401].hash='b';}],
  ['removed actor leaf hash',v=>{delete v.swapped.userLeaves[403].hash;}],
  ['extra actor leaf field',v=>{v.after.userLeaves[401].extra=0n;}],
  ['swap changed shares',v=>{v.swapped.totalShares=21n*x.unit;}],
  ['refund changed shares',v=>{v.after.totalShares=19n*x.unit;}]]){
  const changed=structuredClone(args());edit(changed);
  assert.throws(()=>assertFreshSavedCohortAudit(changed),label);
 }
});
test('canonical asset identities accept both exact integer representations and reject contradictory batch markers',()=>{
 const x=cohortFixture(),args=()=>({manifest:x.manifest,config:x.config,issuerId:401,traderId:402,vaultId:403,initial:x.initial,lp:x.lp,swapped:x.swapped,after:x.after,fees:x.fees});
 // Plain Numbers and lossless BigInts name the same frozen contracts; the audit
 // canonicalizes them rather than trusting a second configuration format.
 for(const edit of [v=>{v.config.assetA=BigInt(v.config.assetA);},v=>{v.config.assetB=BigInt(v.config.assetB);},
  v=>{v.config.assetA=BigInt(v.config.assetA);v.config.assetB=BigInt(v.config.assetB);}]){
  const changed=structuredClone(args());edit(changed);assert.doesNotThrow(()=>assertFreshSavedCohortAudit(changed));}
 const settled={fields:{batch_ready:1n,batch_phase:3n,batch_id:2n}};
 assert.doesNotThrow(()=>assertFreshCohortPhase(settled,{ready:1,phase:3,batchId:2}));
 assert.doesNotThrow(()=>assertFreshCohortPhase({fields:{batch_ready:0n,batch_phase:0n,batch_id:0n}},{ready:0,phase:0,batchId:0}));
 for(const [label,edit] of [['unactivated',v=>{v.fields.batch_ready=0n;}],['idle after finish',v=>{v.fields.batch_phase=0n;}],
  ['committed',v=>{v.fields.batch_phase=1n;}],['executing',v=>{v.fields.batch_phase=2n;}],['expired',v=>{v.fields.batch_phase=4n;}],
  ['wrong batch id',v=>{v.fields.batch_id=3n;}],['coerced marker',v=>{v.fields.batch_phase=3;}]]){
  const changed=structuredClone(settled);edit(changed);
  assert.throws(()=>assertFreshCohortPhase(changed,{ready:1,phase:3,batchId:2}),label);}
});
test('the cached completion branch re-audits saved snapshots and bindings without new financial work',()=>{
 // Only the production cached-completion closure runs here, against a fake case
 // filesystem. No adapter, journal, signer, prover, RPC or reserve is reachable,
 // and any write attempt is a hard failure rather than a reconstruction.
 const source=readFileSync(new URL('./freshCoreAmmLive.mjs',import.meta.url),'utf8');
 const start=source.indexOf('  const confirmSavedCompletion=()=>{'),end=source.indexOf("  const budget=join(base,'budget-v1');",start);
 assert.ok(start>=0&&end>start,'production cached completion closure required');
 const extracted=source.slice(start,end),guardStart=extracted.indexOf('  if(existsSync(completed)){confirmSavedCompletion();return;}');
 assert.ok(guardStart>0,'production cached completion guard required');
 // The extracted text ends with the production guard, whose `return` would skip
 // any trailing wrapper return. Capture the closure before the guard, then let
 // the real guard run once against the fake case filesystem.
 const declaration=extracted.slice(0,guardStart),guard=extracted.slice(guardStart);
 for(const forbidden of ['ordinary(','confirmUps(','adapter.','journal.','reserve(','await fresh('])assert.ok(!extracted.includes(forbidden),'cached completion must not reach financial work: '+forbidden);
 const x=cohortFixture(),base='/synthetic-fresh-case',completed=join(base,'public/FRESH-CORE-JOURNEY-CONFIRMED-v1.json');
 const statePath=label=>join(base,'public',label+'-state.json'),resultPath=label=>join(base,'public',label+'-result.json');
 const build=()=>{
  const files=new Map(),put=(path,value)=>files.set(path,Buffer.from(losslessJson(value)));
  // The shared output fixture is rooted at /case; this fake case owns a
  // different root. Remap every role path into the owned case before storing
  // and pinning its bytes, so the real containment check stays satisfied.
  const outputs=journeyOutputs().map(row=>{const r={...row};for(const role of ['request','preflight','included']){
   assert.ok(row[role].startsWith('/case/'),'shared output fixture root required');
   r[role]=join(base,row[role].slice('/case/'.length));
   const bytes=Buffer.from(JSON.stringify({stage:row.stage,role}));files.set(r[role],bytes);r[role+'Sha256']=sha256(bytes);}return r;});
  const saved={'fresh-initial-v1':x.initial,'core-after-lp-v1':x.lp,'core-after-swap-v1':x.swapped,'fresh-final-v1':x.after};
  for(const [label,preceding] of FRESH_CORE_AMM_SNAPSHOTS){
   put(statePath(label),saved[label]);
   if(preceding)put(resultPath(preceding),{taskId:preceding,result:x.results[preceding]});
   put(statePath(label)+'.binding.json',{snapshotSha256:sha256(files.get(statePath(label))),precedingFormalSha256:preceding?sha256(files.get(resultPath(preceding))):null,
    scope:'Pinned RPC observation after exact preceding included UPS, while its vault end leaf is unchanged (initial snapshot has no predecessor); not independently verified slot Merkle proofs'});
  }
  put(completed,{at:'2026-11-16T12:00:00Z',marketId:303,vaultId:403,outputs,totalFees:x.fees,initial:x.initial,actualSwaps:1,cancelledOrdersRefunded:1,
   allKnownOutboxesClaimed:true,ordinarySdkClaimsVerified:true,browserUiAccepted:false,qualifiedRandomness:false,globalOrderCompleteness:false,after:x.after,
   boundary:'Current-chain selected-order deterministic AMM and ordinary SDK wallets only; no browser/UI, global inclusion, randomized ordering, performance comparison or production claim.'});
  return files;
 };
 const rewrite=(files,path,edit)=>{const value=parseLosslessJson(files.get(path).toString());edit(value);files.set(path,Buffer.from(losslessJson(value)));};
 const exercise=files=>{
  const events=[],reads=[],probes=[],capture={};
  const read=path=>{reads.push(path);if(!files.has(path))throw Error('missing cached audit file '+path);return files.get(path);};
  let error;
  try{
   runInNewContext(`(function(){${declaration}\ncapture.fn=confirmSavedCompletion;\n${guard}})()`,{
    assert,join,base,completed,reg:x.reg,plan:x.plan,manifest:x.manifest,issuerId:401,traderId:402,c:x.config,capture,
    sha256,parseLosslessJson,assertFreshJourneyReport,assertFreshSnapshotVault,assertFreshSavedCohortAudit,FRESH_CORE_AMM_SNAPSHOTS,
    readFileSync:read,exact:path=>parseLosslessJson(read(path).toString()),
    // Only the confirmation file may be probed; nothing else can fall through
    // into a reserve, adapter, signer, prover or RPC boundary.
    existsSync:path=>{probes.push(path);assert.equal(path,completed,'the cached branch may only probe its own confirmation file');return files.has(path);},
    freshCaseArtifact:(root,path)=>{assert.ok(path.startsWith(root+'/'),'cached artifact escapes the owned case');return read(path)&&path;},
    save:()=>{throw Error('cached completion must never write or reconstruct evidence');},
    console:{log:(...args)=>events.push(args)},
   });
  }catch(caught){error=caught;}
  assert.equal(typeof capture.fn,'function','cached completion closure must be declared before the guard');
  assert.deepEqual(probes,[completed],'the production cached guard must run exactly once');
  assert.equal(reads.filter(p=>p===completed).length,1,'the saved confirmation must be read exactly once');
  return {error,events};
 };
 const ok=exercise(build());
 assert.equal(ok.error,undefined);assert.deepEqual(ok.events,[['FRESH_CORE_JOURNEY_ALREADY_CONFIRMED']]);
 for(const [label,edit,message] of [
  ['report final snapshot substituted',files=>rewrite(files,completed,v=>{v.after.balances[402].native=1n;}),/final snapshot differs/],
  ['report initial snapshot substituted',files=>rewrite(files,completed,v=>{v.initial.balances[401].native=1n;}),/initial snapshot differs/],
  ['report final snapshot removed',files=>rewrite(files,completed,v=>{delete v.after;}),/final snapshot differs/],
  ['saved final snapshot changed',files=>rewrite(files,statePath('fresh-final-v1'),v=>{v.balances[402].native=1n;}),/saved cohort snapshot changed/],
  ['snapshot binding digest tampered',files=>rewrite(files,statePath('fresh-final-v1')+'.binding.json',v=>{v.snapshotSha256='b'.repeat(64);}),/saved cohort snapshot changed/],
  ['snapshot binding field removed',files=>rewrite(files,statePath('core-after-lp-v1')+'.binding.json',v=>{delete v.scope;}),/exact saved snapshot binding fields/],
  ['predecessor binding tampered',files=>rewrite(files,statePath('core-after-lp-v1')+'.binding.json',v=>{v.precedingFormalSha256='b'.repeat(64);}),/predecessor binding changed/],
  ['initial predecessor invented',files=>rewrite(files,statePath('fresh-initial-v1')+'.binding.json',v=>{v.precedingFormalSha256=hash;}),/predecessor binding changed/],
  ['saved predecessor result changed',files=>rewrite(files,resultPath('core-swap-settle-v1'),v=>{v.result.endUserLeafHash='e'.repeat(64);}),/predecessor binding changed/],
  ['missing snapshot binding',files=>files.delete(statePath('core-after-swap-v1')+'.binding.json'),/missing cached audit file/],
  ['missing saved snapshot',files=>files.delete(statePath('fresh-initial-v1')),/missing cached audit file/],
  ['missing predecessor result',files=>files.delete(resultPath('core-cancel-settle-v1')),/missing cached audit file/],
  ['journey rows truncated',files=>rewrite(files,completed,v=>{v.outputs.pop();}),/declared stage sequence/]]){
  const files=build();edit(files);const {error,events}=exercise(files);
  assert.ok(error,label);assert.match(error.message,message,label);assert.deepEqual(events,[],label);
 }
 // A self-consistent forgery (snapshot, binding and report all rewritten) still
 // fails the pure conservation audit; correct stage rows are not enough.
 for(const [edit,message] of [[v=>{v.balances[402].native=1n;},/Native fee conservation/],
  [v=>{v.balances[401].native=1000000000000n;},/Native fee conservation/],
  [v=>{v.balances[403].a=0n;},/QA supply conservation/],
  [v=>{v.pending['401:402'].native=1n;},/pending asset remains/]]){
  const files=build();rewrite(files,statePath('fresh-final-v1'),edit);
  rewrite(files,statePath('fresh-final-v1')+'.binding.json',v=>{v.snapshotSha256=sha256(files.get(statePath('fresh-final-v1')));});
  rewrite(files,completed,v=>{v.after=parseLosslessJson(files.get(statePath('fresh-final-v1')).toString());});
  const {error,events}=exercise(files);assert.ok(error);assert.match(error.message,message);assert.deepEqual(events,[]);
 }
 const rebound=build();rewrite(rebound,resultPath('core-lp-settle-v1'),v=>{v.result.endUserLeafHash='e'.repeat(64);});
 rewrite(rebound,statePath('core-after-lp-v1')+'.binding.json',v=>{v.precedingFormalSha256=sha256(rebound.get(resultPath('core-lp-settle-v1')));});
 const mismatch=exercise(rebound);assert.match(mismatch.error.message,/saved snapshot vault leaf differs/);assert.deepEqual(mismatch.events,[]);
});
test('owned-case evidence reads reject symlink escapes, missing files and secret paths',()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'psy-fresh-case-'))),outside=realpathSync(mkdtempSync(join(tmpdir(),'psy-fresh-outside-')));
 try{
  mkdirSync(join(root,'public'));mkdirSync(join(root,'.secrets'));
  const file=join(root,'public/core-lp-open-v1.json');writeFileSync(file,'{}');
  const secret=join(root,'.secrets/issuer.json');writeFileSync(secret,'{}');
  const foreign=join(outside,'foreign.json');writeFileSync(foreign,'{}');
  assert.equal(freshCaseArtifact(root,file),file);
  symlinkSync(foreign,join(root,'public/link.json'));
  symlinkSync(outside,join(root,'public/link-dir'));
  symlinkSync(join(root,'public/absent-target.json'),join(root,'public/dangling.json'));
  for(const p of [join(root,'public/link.json'),join(root,'public/link-dir/foreign.json'),join(root,'public/dangling.json'),
   join(root,'public/absent.json'),join(root,'public'),secret,join(root,'.secrets'),root,foreign,
   join(root,'..',outside.split('/').at(-1),'foreign.json'),'public/core-lp-open-v1.json','',null])
   assert.throws(()=>freshCaseArtifact(root,p));
 } finally {rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});}
});
test('a reused cohort snapshot stays bound to the exact preceding formal vault receipt',()=>{
 const report={result:{checkpoint:104n,endUserLeafHash:'b'.repeat(64)}},snapshot={checkpoint:110n,userLeaves:{403:{hash:'b'.repeat(64),nonce:3n}}};
 assert.doesNotThrow(()=>assertFreshSnapshotVault(snapshot,403,report));
 for(const changed of [{...snapshot,userLeaves:{403:{hash,nonce:3n}}},{...snapshot,checkpoint:103n},{...snapshot,userLeaves:{}},[],null])assert.throws(()=>assertFreshSnapshotVault(changed,403,report));
 for(const changed of [{...snapshot,checkpoint:110},{...snapshot,userLeaves:{403:{hash:'b'.repeat(64),nonce:3}}},
  {...snapshot,userLeaves:{403:{hash:'b'.repeat(64),nonce:0n}}},{...snapshot,userLeaves:{403:{hash:'0'.repeat(64),nonce:3n}}}])
  assert.throws(()=>assertFreshSnapshotVault(changed,403,report));
 for(const bad of [null,{},{result:null},{result:{checkpoint:104,endUserLeafHash:'b'.repeat(64)}},
  {result:{checkpoint:104n,endUserLeafHash:'0'.repeat(64)}}])assert.throws(()=>assertFreshSnapshotVault(snapshot,403,bad));
});
