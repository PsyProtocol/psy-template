// Formal durable orchestration over existing account-specific adapters. Wallet
// actions require a wallet-owned adapter; no page-provided verifier is accepted.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {ExecutionJournal} from './journal.mjs';
import {executeCycle} from './worker.mjs';
import {publishFile} from './durableFile.mjs';
import {sha256} from './requestBinding.mjs';
import {parseLosslessJson,losslessJson} from '../amm/u124/client.mjs';
import {loadOptions} from './config.mjs';
import {createPublicWalletAdapter} from './publicWalletAdapter.mjs';
import {assertDurableRuntimeDirectory} from './runtimeStorage.mjs';
import {continueFundedRegistration} from './fundedRegistration.mjs';
const allowed=new Set(['register','bootstrap','initialize','order','open','cover','settle','claim','refund','fee-grant']);
export function validateFundedLifecycle(plan){
 assert.equal(plan.schema,1);assert.equal(plan.network,'testnet');assert.equal(plan.sdkCommit,'c92880c8b6e2c8d392f19368bc8801a2584fd427');
 assert.match(plan.chainRoot,/^[a-f0-9]{64}$/);assert.match(plan.policySha256,/^[a-f0-9]{64}$/);
 assert.ok(Number.isSafeInteger(plan.vaultId)&&plan.vaultId>0&&plan.vaultId<2**24);assert.match(plan.fingerprint,/^[a-f0-9]{64}$/);
 assert.ok(Array.isArray(plan.stages)&&plan.stages.length>0&&plan.stages.length<=128);const ids=new Set();let fee=0n;
 for(const [i,stage]of plan.stages.entries()){
  assert.match(stage.id,/^[a-zA-Z0-9_-]{1,100}$/);assert.ok(!ids.has(stage.id));ids.add(stage.id);assert.ok(allowed.has(stage.operation));
  assert.equal(stage.predecessor,i===0?null:plan.stages[i-1].id);assert.ok(['native','wallet'].includes(stage.actor));
  if(stage.actor==='wallet')assert.match(stage.approvedTaskSha256??'',/^[a-f0-9]{64}$/,'wallet-owned approved task required');
  if(['open','cover','settle','refund'].includes(stage.operation))assert.match(stage.batch??'',/^[a-zA-Z0-9_-]{1,100}$/,'explicit immutable batch identity');
  assert.ok(Number.isSafeInteger(stage.userId)&&stage.userId>0&&stage.userId<2**24);if(stage.actor==='native')assert.equal(stage.userId,plan.vaultId);
  assert.ok(typeof stage.config==='string'&&stage.config&&!stage.config.startsWith('/')&&!stage.config.split(/[\\/]/).some(x=>!x||x==='.'||x==='..'));
  const maximum=BigInt(stage.maximumFee);assert.ok(stage.operation==='register'?stage.actor==='native'&&maximum===0n:maximum>=1_000_000_000n&&maximum<=1_000_100_000n);fee+=maximum;
 }
 assert.ok(fee<=BigInt(plan.maximumTotalFee),'reserve the entire declared lifecycle including recovery; never silently expand');
 const bootstrap=plan.stages.findIndex(s=>s.actor==='native'&&s.operation==='bootstrap');
 assert.ok(bootstrap>=0&&plan.stages.filter(s=>s.operation==='bootstrap').length===1);
 assert.ok(plan.stages.slice(0,bootstrap).every(s=>s.actor==='wallet'||s.operation==='register'),'only registration and ordinary funding/authorization can precede bootstrap');
 assert.ok(plan.stages.filter(s=>s.operation==='register').length<=1);
 assert.ok(plan.stages.some(s=>s.actor==='wallet'&&s.operation==='claim'));return plan;
}
export async function continueFundedLifecycle({planFile,runtimeDirectory,createNative=createPublicWalletAdapter,walletAdapter=null,register=continueFundedRegistration}){
 const bytes=await readFile(planFile),plan=validateFundedLifecycle(JSON.parse(bytes)),pin=sha256(bytes),root=join(runtimeDirectory,'funded-lifecycle',pin);
 assertDurableRuntimeDirectory(runtimeDirectory);
 await mkdir(root,{recursive:true,mode:0o700});const lock=new ExecutionJournal({directory:root,network:plan.network,vaultId:plan.vaultId,fingerprint:plan.fingerprint});
 return lock.locked(async()=>{
  assert.equal(sha256(await readFile(planFile)),pin,'approved lifecycle changed');
  for(const stage of plan.stages){
   const completed=join(root,stage.id+'.included.json');let old;
   try{old=JSON.parse(await readFile(completed,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
   if(old){assert.equal(old.planSha256,pin);assert.equal(old.stageId,stage.id);assert.equal(old.userId,stage.userId);
    if(stage.operation==='register'){assert.equal(sha256(await readFile(join(old.verificationDirectory,'verification.json'))),old.verificationSha256);continue;}
    const original=new ExecutionJournal(old.journal);assert.equal(old.journal.network,plan.network);assert.equal(old.journal.vaultId,stage.userId);
    const records=await original.locked(()=>original.records());assert.ok(records.some(r=>r.status==='included'&&r.taskId===old.taskId&&JSON.stringify(r.result)===JSON.stringify(old.result)),'restart requires original included journal evidence');continue;}
   if(stage.actor==='wallet'&&!walletAdapter)return{status:'awaiting-wallet',stage:stage.id,operation:stage.operation,userId:stage.userId,complete:false};
   const file=resolve(dirname(planFile),stage.config);let options;
   try{options=stage.actor==='native'?await loadOptions(file):JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return{status:'awaiting-stage-input',stage:stage.id,complete:false};throw e;}
   assert.equal(options.network,plan.network);assert.equal(options.vaultId,stage.userId);
   assertDurableRuntimeDirectory(options.runtimeDirectory);
   if(stage.actor==='native'){
    assert.equal(options.profile,'source-funded-v14');assert.equal(options.fingerprint,plan.fingerprint);
    assert.equal(sha256(await readFile(options.policy)),plan.policySha256);const policy=parseLosslessJson(await readFile(options.policy,'utf8'));assert.equal(policy.executor_binding.chain_root,plan.chainRoot);
    if(stage.operation==='register'){
     const result=await register(options);if(result.status!=='registered')return{...result,stage:stage.id,complete:false};
     assert.equal(result.userId,stage.userId);assert.equal(sha256(await readFile(join(result.verificationDirectory,'verification.json'))),result.verificationSha256);
     await publishFile(completed,JSON.stringify({planSha256:pin,stageId:stage.id,userId:stage.userId,...result})+'\n');continue;
    }
    const input=parseLosslessJson(await readFile(options.streamTask,'utf8'));assert.equal(input.stageId,stage.id);assert.ok(input.maximumFee<=BigInt(stage.maximumFee));
    const operation=new Map([[14n,'bootstrap'],[4n,'initialize'],[5n,'open'],[6n,'cover'],[8n,'settle'],[9n,'refund'],[13n,'fee-grant']]).get(input.context.request.fields[0]);
    assert.equal(operation,stage.operation,'approved lifecycle operation changed');
    if(operation==='initialize')assert.ok(options.kind==='bondingcurve'&&policy.base.operations.some(op=>op.branch===input.context.request.fields[21]&&op.name==='initialize'&&op.maintenance===true),'only reviewed Curve initialization; AMM initialization uses its liquidity batch');
    if([5n,6n,8n,9n].includes(input.context.request.fields[0])){
     await mkdir(join(root,'batches'),{recursive:true,mode:0o700});
     const scope=losslessJson({scope:input.context.request.source.scope,facts:input.context.request.source.facts}),path=join(root,'batches',stage.batch+'.json');
     if(input.context.request.fields[0]===5n){try{await publishFile(path,scope);}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(path,'utf8'),scope);}}
     else assert.equal(await readFile(path,'utf8'),scope,'original frozen set and deadline must survive all pages/recovery');
    }
   }
   const adapter=stage.actor==='native'?await createNative(options):await walletAdapter(options,stage);
   const journalConfig={directory:options.runtimeDirectory,network:options.network,vaultId:options.vaultId,fingerprint:options.fingerprint};
   const journal=new ExecutionJournal(journalConfig),binding=join(root,stage.id+'.task.json');
   const scan=adapter.scan;adapter.scan=async()=>{const state=await scan();if(state.action){const text=JSON.stringify(state.action);
    if(stage.actor==='wallet')assert.equal(sha256(text),stage.approvedTaskSha256,'ordinary wallet task differs from wallet approval');
    try{await publishFile(binding,text);}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(binding,'utf8'),text,'stage cannot replace its original task');}}
    return state;};
   let result;try{result=await executeCycle({adapter,journal});}finally{await adapter.close?.();}
   let originalTask;try{originalTask=JSON.parse(await readFile(binding,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return{...result,stage:stage.id,complete:false};}
   const taskId=sha256(JSON.stringify({scope:journal.scope,task:originalTask}));
   const records=await journal.locked(()=>journal.records()),accepted=records.findLast(r=>r.status==='included'&&r.taskId===taskId);
   if(!accepted)return{...result,stage:stage.id,complete:false};
   assert.ok(accepted&&accepted.result.userId===stage.userId&&accepted.result.contentHash&&accepted.result.checkpoint,'exact account receipt required');
   await publishFile(completed,JSON.stringify({planSha256:pin,stageId:stage.id,userId:stage.userId,journal:journalConfig,taskId,result:accepted.result})+'\n');
  }
  return{status:'complete',complete:true,scope:'Every declared stage has an exact included receipt; final asset/fee conservation audit is still separate',planSha256:pin};
 });
}
