// Pure manifest and unsigned-call-plan regression. No RPC, keys, proofs or sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readReviewedAbis} from '../../tests/fixtures/reviewedAbis.mjs';
import {FRESH_CORE_AMM_STAGES,caseFile,validateFreshCoreManifest,planFreshCoreAmmStage,assertFreshEnvironment,assertFreshActorAnchor,assertFreshInitialAnchor,assertFreshRefundAssets,freshApprovedActor,assertFreshStagePlan,assertFreshFormalTask,assertFreshNativeApproval} from './freshCoreAmmLive.mjs';
import {swapQuote,FEE_ESCROW,parseLosslessJson} from '../../amm/u124/client.mjs';
import {PROFILE} from '../../batching/mainnet-beta/native.mjs';
import {CORE_DEPENDENCY_KEY_PROFILE} from '../coreDependencyPolicy.mjs';

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
