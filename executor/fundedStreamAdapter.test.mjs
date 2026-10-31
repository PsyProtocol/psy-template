// Transport/ownership tests use an explicit native-driver double. They do not
// establish Endcap validity, deployment, receipts or ordinary-wallet acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createPublicWalletAdapter} from './publicWalletAdapter.mjs';
import {validateOptions} from './config.mjs';
import {ExecutionJournal} from './journal.mjs';
import {executeCycle} from './worker.mjs';
import {sha256} from './requestBinding.mjs';
import {losslessJson,parseLosslessJson} from '../amm/u124/client.mjs';
const h='a'.repeat(64),e='b'.repeat(64),z='0'.repeat(64),sdk='c92880c8b6e2c8d392f19368bc8801a2584fd427';
async function fixture(fn){const d=await mkdtemp(join(tmpdir(),'funded-adapter-'));try{
 const put=(file,value)=>writeFile(join(d,file),losslessJson(value),{flag:'wx'}),policy={version:14,profile:'source-covered-deterministic-funded-bootstrap-v1',qualified_randomness:false,market_id:1000,fee_owner:600,base:{config:{assetA:42,assetB:43,feeOwner:600,networkMagic:'1384803358401154921'}},executor_binding:{allow_broadcast:true,sdk_commit:sdk,review:'review.json',review_sha256:null,chain_root:h}};
 await writeFile(join(d,'artifact'),'public artifact double');const review={artifact:'artifact',artifact_sha256:sha256('public artifact double'),assets:[{artifact:'artifact',artifact_sha256:sha256('public artifact double')},{artifact:'artifact',artifact_sha256:sha256('public artifact double')},{artifact:'artifact',artifact_sha256:sha256('public artifact double')}]};await put('review.json',review);policy.executor_binding.review_sha256=sha256(await readFile(join(d,'review.json')));await put('policy.json',policy);
 const fields=Array(80).fill(0);fields[0]=14;fields[73]=1_000_010_000;const source=Array(41).fill(0);source[1]=1384803358401154921n;source[3]=1000;source[4]=100;
 const stage={schema:1,profile:'source-funded-v14',stageId:'boot',actor:100,expectedNonce:1,maximumFee:1_000_100_000,validUntilCheckpoint:150,context:{source:{fields:source},request:{fields},execution_checkpoint:100,expected_nonce:1,expected_start_leaf:z},calls:{software_defined_call:{inputs:fields},contract_calls:[]}};await put('stage.json',stage);
 const deps=[0,42,43,1000].map(id=>({contract:{contractId:id,codeRoot:h,layoutRoot:h,stateTreeHeight:30},functionTreeRoot:h,layoutFieldCount:20,layoutSlotCount:40}));await put('deps.json',deps);
 for(const f of ['rpc.json','abi.json','driver.json','a.json','b.json'])await put(f,{});await writeFile(join(d,'driver'),'native release double');
 const asset=contractId=>({contractId,codeRoot:h,layoutRoot:h,abi:join(d,'a.json')});
 const o=validateOptions({profile:'source-funded-v14',kind:'bondingcurve',network:'testnet',testnetProfile:'mainnet-beta-20261027-v1',contractId:1000,vaultId:100,publicKeyHash:h,fingerprint:h,codeRoot:h,layoutRoot:h,walletSha256:sha256('native release double'),rpcConfig:join(d,'rpc.json'),wallet:join(d,'driver'),abi:join(d,'abi.json'),driverConfig:join(d,'driver.json'),runtimeDirectory:join(d,'runtime'),policy:join(d,'policy.json'),dependencyBindings:join(d,'deps.json'),streamTask:join(d,'stage.json'),assetA:asset(42),assetB:asset(43)});
 let head=100,root=h,leaf=z,network='testnet',code=h,proofs=0,sends=0,checks=0,included=false,finalReadFailure=false;
 const state=async()=>({networkName:network,checkpoint:head,network:{magic:'1384803358401154921',users_per_realm:2**24,realm_configs:[{id:0,rpc_url:['https://realm.invalid']}]},userIds:async()=>[100],contractLeaf:async()=>({code_root:code,state_layout_root:h,function_tree_root:h,state_tree_height:30,state_layout_field_count:20,state_layout_slot_count:40}),rpc:async(_url,name)=>name==='psy_get_checkpoint_leaf_data'?{global_chain_root:root}:leaf});
 const run=async(_file,args)=>{
  if(args[0]==='identity')return{stdout:JSON.stringify({profile:'source-funded-v14',fingerprint:h,publicKeyHash:h})};
  if(args[0]==='verify-prepared'){
   checks++;const out=args[7],m=JSON.parse(await readFile(join(args[5],'prepared.json'),'utf8'));await mkdir(out);await writeFile(join(out,'verification.json'),JSON.stringify({fullUpsVerified:true,exactStackAndSessionVerified:true,broadcast:false,reproved:false,requestSha256:m.requestSha256,preparedManifestSha256:args[6]}));return{stdout:'',stderr:''};
  }
  assert.equal(args[0],'preflight');proofs++;const out=args[5];await mkdir(out);
  const core={checkpoint_id:100,new_user_leaf:{user_id:100,public_key:h,nonce:1},state_transition:{start_user_leaf_hash:z,end_user_leaf_hash:e}};
  const values={'request.json':{user_ec_input:{core}},'preflight.json':{persistenceProfile:'crypto-before-final-guard-v1',liveGuardsPending:true,benchmarkSourceCheckpoint:null,fullUpsVerified:true,exactStackAndSessionVerified:true,broadcast:false,profile:'source-funded-v14',core,fee:fields[73]},'stream-context.json':{public:true},'stream-sign-proof.bin':{double:true}};
  for(const[name,v]of Object.entries(values))await writeFile(join(out,name),JSON.stringify(v));
  const m={version:1};for(const[key,path]of [['policySha256',args[1]],['callsSha256',args[3]],['guardSha256',args[4]],...Object.entries({'requestSha256':'request.json','preflightSha256':'preflight.json','streamContextSha256':'stream-context.json','streamKeyProofSha256':'stream-sign-proof.bin'}).map(([k,f])=>[k,join(out,f)])])m[key]=sha256(await readFile(path));
  await writeFile(join(out,'prepared.json'),JSON.stringify(m));
  if(finalReadFailure){await writeFile(join(out,'failure.json'),JSON.stringify({ok:false,automaticRetry:false,broadcastMayHaveBeenAttempted:false,phase:'verify-final-compact-state',reason:'Request error to https://realm.invalid: error sending request for url unavailable'}));throw Error('final read lost');}
  await writeFile(join(out,'final-live-state.json'),JSON.stringify({liveGuardsPassed:true,broadcast:false,requestSha256:m.requestSha256,preparedManifestSha256:sha256(await readFile(join(out,'prepared.json')))}));return{stdout:'',stderr:''};
 };
 const submit=async(_file,args)=>{sends++;const out=args[7],m=JSON.parse(await readFile(join(args[5],'prepared.json'),'utf8'));await mkdir(out);await writeFile(join(out,'intent.json'),JSON.stringify({requestSha256:m.requestSha256,userId:100,nonce:1,endUserLeafHash:e}));throw Error('connection lost after durable send');};
 const create=()=>createPublicWalletAdapter(o,{readState:state,readReceipts:async()=>async()=>included?{status:'included',userId:100,contentHash:e,checkpoint:101}:{status:'unresolved'},runDriver:run,submitDriver:submit});
 const journal=()=>new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,vaultId:o.vaultId,fingerprint:o.fingerprint});
 await fn({d,o,create,journal,counts:()=>({proofs,sends,checks}),root:v=>root=v,leaf:v=>leaf=v,head:v=>head=v,network:v=>network=v,code:v=>code=v,confirm:()=>included=true,finalReadFailure:()=>finalReadFailure=true});
 }finally{await rm(d,{recursive:true,force:true});}}
test('formal factory sends exact prepared request once; unknown survives restart and common-head wait',()=>fixture(async x=>{
 let a=await x.create();assert.equal((await executeCycle({adapter:a,journal:x.journal()})).status,'unresolved');
 a=await x.create();assert.equal((await executeCycle({adapter:a,journal:x.journal()})).status,'unresolved');assert.deepEqual(x.counts(),{proofs:1,sends:1,checks:0});
 x.confirm();assert.equal((await x.journal().reconcile(a.reconcile))[0].result.reason,'included-awaiting-common-state');x.head(101);assert.equal((await x.journal().reconcile(a.reconcile))[0].result.status,'included');assert.equal(x.counts().sends,1);
}));
test('an unsigned final-read failure adopts exact crypto without another proof',()=>fixture(async x=>{
 x.finalReadFailure();const a=await x.create();assert.equal((await executeCycle({adapter:a,journal:x.journal()})).status,'unresolved');assert.deepEqual(x.counts(),{proofs:1,sends:1,checks:1});
}));
test('stale state, wrong network, dependency and chain substitutions never start proof',async()=>{
 for(const key of ['root','network','code','leaf'])await fixture(async x=>{const a=await x.create();x[key](key==='network'?'mainnet':e);if(key==='leaf')assert.equal((await a.scan()).action,null);else await assert.rejects(a.scan());assert.equal(x.counts().proofs,0);assert.equal(x.counts().sends,0);});
});
test('receipt reconciliation also pins the current chain instance',()=>fixture(async x=>{
 const a=await x.create();await executeCycle({adapter:a,journal:x.journal()});x.root(e);x.confirm();await assert.rejects(x.journal().reconcile(a.reconcile),/chain instance/);assert.equal((await x.journal().unresolved()).length,1);assert.equal(x.counts().sends,1);
}));
test('a candidate release cannot broadcast even with a prepared proof',()=>fixture(async x=>{
 const policy=JSON.parse(await readFile(x.o.policy,'utf8'));delete policy.executor_binding.allow_broadcast;await writeFile(x.o.policy,JSON.stringify(policy));
 const a=await x.create();await assert.rejects(executeCycle({adapter:a,journal:x.journal()}),/not enabled/);
 assert.equal(x.counts().sends,0);assert.equal((await x.journal().unresolved()).length,0);
}));
