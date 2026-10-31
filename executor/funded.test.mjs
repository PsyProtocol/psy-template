import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {validateFundedOptions} from './fundedOptions.mjs';
import {planFundedFeeRecovery} from './fundedFeeRecovery.mjs';
import {continueFundedLifecycle,validateFundedLifecycle} from './fundedLifecycle.mjs';
import {validateFundedStage} from './fundedStreamAdapter.mjs';
import {sha256} from './requestBinding.mjs';
const h='a'.repeat(64),sdk='c92880c8b6e2c8d392f19368bc8801a2584fd427',F=1_000_100_000n;
function options(){return{profile:'source-funded-v14',kind:'bondingcurve',network:'testnet',testnetProfile:'mainnet-beta-20261027-v1',contractId:1000,vaultId:100,publicKeyHash:h,fingerprint:h,codeRoot:h,layoutRoot:h,walletSha256:h,...Object.fromEntries(['rpcConfig','wallet','abi','driverConfig','runtimeDirectory','policy','dependencyBindings','streamTask'].map(k=>[k,k])),assetA:{contractId:42,codeRoot:h,layoutRoot:h,abi:'a'},assetB:{contractId:43,codeRoot:h,layoutRoot:h,abi:'b'}};}
test('funded route is explicit, frozen and deterministic; paired markets stay closed',()=>{
 assert.equal(validateFundedOptions(options(),'/release').policy,'/release/policy');
 for(const changes of [{kind:'orderbook'},{kind:'nftmarket'},{network:'mainnet'},{proverThreads:0},{assetB:{...options().assetB,contractId:42}},{proverMode:'resident'},{random:true}])assert.throws(()=>validateFundedOptions({...options(),...changes},'/release'));
});
function fee(state={}){return{policy:{version:14,qualified_randomness:false,fee_owner:600},state:{feeUsed:3n*F,feeCap:3n*F,nativeBalance:0n,ownerPending:7n*F,ownerGrantCap:10n*F,ownerGrantNonce:2n,grantSeen:1n,ownerGrantKey:[1n,2n,3n,4n],registeredKey:[1n,2n,3n,4n],...state},approvedLifetimeCap:10n*F,requiredFee:F,recoveryGrantFee:F,frozenSetSha256:h};}
test('fee recovery reserves its own fee and the next task, preserves the set, and never broadcasts',()=>{
 const r=planFundedFeeRecovery(fee());assert.equal(r.status,'apply-authenticated-grant');assert.equal(r.frozenSetSha256,h);assert.equal(r.deadlineExtended,false);assert.equal(r.canBroadcast,false);assert.equal(r.maximumFee,F.toString());
 assert.equal(planFundedFeeRecovery({...fee(),approvedLifetimeCap:4n*F}).status,'needs-budget-authorization');
 assert.equal(planFundedFeeRecovery(fee({ownerPending:F})).status,'needs-owner-funding');
 for(const state of [{ownerGrantNonce:1n},{ownerGrantCap:11n*F},{ownerGrantKey:[4n,3n,2n,1n]}])assert.equal(planFundedFeeRecovery(fee(state)).status,'needs-owner-grant');
 assert.equal(planFundedFeeRecovery(fee({feeCap:5n*F,nativeBalance:2n*F})).status,'funded');
 assert.throws(()=>planFundedFeeRecovery(fee({feeUsed:6n*F})));assert.throws(()=>planFundedFeeRecovery({...fee(),requiredFee:2n**62n}));
});
test('unrepresentable lifetime recovery and overflowing owner claims cannot propose another payment',()=>{
 const max=2n**62n-1n;
 assert.equal(planFundedFeeRecovery({...fee({feeUsed:max-F,feeCap:max-F}),approvedLifetimeCap:max}).status,'lifetime-cap-unrepresentable');
 assert.throws(()=>planFundedFeeRecovery(fee({nativeBalance:max,ownerPending:7n*F})),/overflow/);
});
test('stage boundary rejects seed, source, checkpoint, nonce, fee and bootstrap substitutions',()=>{
 const policy={version:14n,profile:'source-covered-deterministic-funded-bootstrap-v1',qualified_randomness:false,market_id:1000n,executor_binding:{sdk_commit:sdk},base:{config:{feeOwner:600n}},fee_owner:600n};
 const f=Array(80).fill(0n);f[0]=14n;f[73]=F;const source=Array(41).fill(0n);source[3]=1000n;source[4]=100n;
 const s={schema:1n,profile:'source-funded-v14',stageId:'boot',actor:100n,expectedNonce:1n,maximumFee:F,validUntilCheckpoint:150n,context:{source:{fields:source},request:{fields:f},execution_checkpoint:100n,expected_nonce:1n,expected_start_leaf:'0'.repeat(64)}};
 assert.equal(validateFundedStage(s,policy,options()).kind,'stream_bootstrap');
 for(const mutate of [x=>x.context.request.random={},x=>x.context.expected_nonce=2n,x=>x.context.execution_checkpoint=151n,x=>x.maximumFee=F-1n,x=>x.context.source.fields[4]=101n,x=>x.context.expected_start_leaf=h,x=>x.context.source.fields.pop()]){const x=structuredClone(s);mutate(x);assert.throws(()=>validateFundedStage(x,policy,options()));}
});
async function fixture(fn){const root=await mkdtemp(join(process.cwd(),'.funded-runtime-test-'));try{
 const policy={executor_binding:{chain_root:h},base:{operations:[]}},policyText=JSON.stringify(policy);await writeFile(join(root,'policy'),policyText);
 const task={kind:'wallet_claim',submission:'exact wallet-approved claim'},plan={schema:1,network:'testnet',sdkCommit:sdk,chainRoot:h,policySha256:sha256(policyText),vaultId:100,fingerprint:h,maximumTotalFee:(2n*F).toString(),stages:[{id:'boot',operation:'bootstrap',actor:'native',userId:100,predecessor:null,config:'boot.json',maximumFee:F.toString()},{id:'claim',operation:'claim',actor:'wallet',userId:200,predecessor:'boot',config:'claim.json',maximumFee:F.toString(),approvedTaskSha256:sha256(JSON.stringify(task))}]};
 const stage={stageId:'boot',maximumFee:F.toString(),context:{request:{fields:[14]}}};await writeFile(join(root,'streamTask'),JSON.stringify(stage));
 const o={...options(),runtimeDirectory:join(root,'accounts'),policy:'policy',streamTask:'streamTask'};await writeFile(join(root,'boot.json'),JSON.stringify(o));
 await writeFile(join(root,'claim.json'),JSON.stringify({network:'testnet',vaultId:200,fingerprint:h,runtimeDirectory:join(root,'accounts')}));
 const planFile=join(root,'PLAN.json');await writeFile(planFile,JSON.stringify(plan));
 await fn({root,plan,planFile,task,args:{planFile,runtimeDirectory:join(root,'lifecycle')}});
 }finally{await rm(root,{recursive:true,force:true});}}
function backend(user,task,state){return{scan:async()=>({checkpoint:100,action:state.idle?null:task}),isCurrent:async()=>true,prove:async()=>{state.proofs++;return{exact:'proof'};},validateProof:async()=>true,submit:async()=>{state.sends++;return{};},reconcile:async()=>state.included?{status:'included',userId:user,contentHash:h,checkpoint:101}:{status:'unresolved'}};}
test('formal lifecycle stops for wallet approval and resumes without paying the vault stage twice',()=>fixture(async({args,task})=>{
 const state={proofs:0,sends:0,included:true},createNative=async()=>backend(100,{kind:'stream_bootstrap',submission:'boot'},state);
 assert.equal((await continueFundedLifecycle({...args,createNative})).status,'awaiting-wallet');assert.equal(state.sends,1);
 const wallet={proofs:0,sends:0,included:true};const result=await continueFundedLifecycle({...args,createNative,walletAdapter:async()=>backend(200,task,wallet)});
 assert.equal(result.status,'complete');assert.equal(state.sends,1);assert.equal(wallet.sends,1);
 await continueFundedLifecycle({...args,createNative,walletAdapter:()=>assert.fail('completed wallet must not replay')});assert.equal(wallet.sends,1);
}));
test('unknown send blocks following stages; original receipt recovery advances even when scan is idle',()=>fixture(async({args,task})=>{
 const state={proofs:0,sends:0,included:false};let wallets=0;const createNative=async()=>backend(100,{kind:'stream_bootstrap',submission:'boot'},state),walletAdapter=async()=>{wallets++;return backend(200,task,{proofs:0,sends:0,included:true});};
 assert.equal((await continueFundedLifecycle({...args,createNative,walletAdapter})).status,'unresolved');
 assert.equal((await continueFundedLifecycle({...args,createNative,walletAdapter})).status,'unresolved');assert.equal(state.sends,1);assert.equal(wallets,0);
 state.included=true;state.idle=true;assert.equal((await continueFundedLifecycle({...args,createNative,walletAdapter})).status,'complete');assert.equal(state.sends,1);assert.equal(state.proofs,1);
}));
test('wallet substitution and missing batch identity fail closed',()=>fixture(async({args,plan,task})=>{
 const createNative=async()=>backend(100,{kind:'stream_bootstrap',submission:'boot'},{proofs:0,sends:0,included:true});
 await assert.rejects(continueFundedLifecycle({...args,createNative,walletAdapter:async()=>backend(200,{...task,submission:'wrong receiver'},{proofs:0,sends:0,included:true})}),/wallet approval/);
 const changed=structuredClone(plan);changed.stages[0].operation='open';assert.throws(()=>validateFundedLifecycle(changed),/batch identity/);
}));
test('missing original journal after a completed stage fails closed, without rerunning it',()=>fixture(async({root,args})=>{
 const state={proofs:0,sends:0,included:true},createNative=async()=>backend(100,{kind:'stream_bootstrap',submission:'boot'},state);
 await continueFundedLifecycle({...args,createNative});
 const dir=join(root,'accounts');for(const name of await readdir(dir))await rm(join(dir,name),{recursive:true,force:true});
 await assert.rejects(continueFundedLifecycle({...args,createNative}),/original included journal/);assert.equal(state.sends,1);
}));
test('two local lifecycle owners cannot start duplicate proving or payment',()=>fixture(async({args})=>{
 let release,started;const ready=new Promise(r=>started=r),hold=new Promise(r=>release=r);const state={proofs:0,sends:0,included:true};
 const createNative=async()=>{const a=backend(100,{kind:'stream_bootstrap',submission:'boot'},state),prove=a.prove;a.prove=async task=>{started();await hold;return prove(task);};return a;};
 const first=continueFundedLifecycle({...args,createNative});await ready;
 await assert.rejects(continueFundedLifecycle({...args,createNative}),/owns this vault/);release();await first;assert.equal(state.sends,1);assert.equal(state.proofs,1);
}));
