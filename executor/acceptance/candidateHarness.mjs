// Explicit isolated QA stages. No unknown mutation is ever automatically retried.
import assert from'node:assert/strict';import{createHash}from'node:crypto';import{existsSync,mkdirSync,readFileSync}from'node:fs';import{join,dirname}from'node:path';
import{read,save,ordinary,confirmUps,run}from'../../batching/admission/liveSupport.mjs';import{LiveMarket}from'../../batching/admission/liveMarket.mjs';
import{publicState}from'../publicState.mjs';import{loadOptions}from'../config.mjs';import{createPublicWalletAdapter}from'../publicWalletAdapter.mjs';import{ExecutionJournal}from'../journal.mjs';import{execFile}from'node:child_process';import{promisify}from'node:util';
import{hostname,platform,arch,cpus,loadavg}from'node:os';
import{parseLosslessJson}from'../../amm/u124/client.mjs';
export const pause=ms=>new Promise(r=>setTimeout(r,ms));
export function cohort(base,original){
 const tools=read(join(base,'public/candidate-toolchain.json'));
 for(const [path,digest]of [[tools.compactBinary,tools.compactBinarySha256],[tools.ordinaryBinary,tools.ordinaryBinarySha256],[tools.compiler,tools.compilerSha256]])assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),digest,'reviewed test binary changed');
 const binary=tools.compactBinary,ordinaryBinary=tools.ordinaryBinary,config=join(base,'public/rpc.json'),env={PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'};
 const actorHome=existsSync(join(base,'public/qa-actors-source.json'))?read(join(base,'public/qa-actors-source.json')).directory:base;
 const actors={bob:{id:860352,secret:join(original,'.secrets/bob-bundled-profile-v1.json')},trader:{id:876736,secret:join(original,'.secrets/trader.json')},sponsor:{id:1384640,secret:join(original,'.secrets/sponsor-bundled-profile-v1.json')},...Object.fromEntries(['charlie','dave'].map(n=>[n,{id:read(join(actorHome,'public',n+'-registration-v1.json')).userId,secret:join(actorHome,'.secrets',n+'.json')}]))};
 const markets=['amm','orderbook','bondingcurve','nftmarket'].map(kind=>{const build=join(base,'markets-v1',kind),registration=read(join(build,'live-registration.json'));return new LiveMarket({base,config,build,registration,policy:read(join(build,'bound/policy.json')),contracts:registration.contracts,ordinaryBinary,compactBinary:binary,env,actors});});
 const by=Object.fromEntries(markets.map(m=>[m.kind,m])),bindings=new Map(markets.flatMap(m=>m.contracts).map(b=>[b.contract.contractId,b]));
 const user=async(actor,name,calls)=>{const out=join(base,'attempts',name);if(existsSync(join(out,'preflight.json'))){if(!existsSync(join(out,'included.json')))await confirmUps(config,out);return out;}assert.ok(!existsSync(join(base,'public',name+'.json')),'partial unsigned input requires inspected new attempt');return ordinary({base,config,binary:ordinaryBinary,secret:actors[actor].secret,name,calls,bindings,env});};
 return{base,original,binary,binarySha256:tools.compactBinarySha256,ordinaryBinary,config,env,actors,markets,by,bindings,user,token:read(join(by.amm.build,'token-a.json')).abi,nft:read(join(by.nftmarket.build,'nft.json')).abi};
}
export async function formal(h,m,tag,plan,{benchmark=false,expiry=96,mode='resident',runtimeSuffix=''}={}){
 const dir=join(h.base,'public',tag+'-'+m.kind+'-executor');if(!existsSync(dir)){mkdirSync(dir);for(const[n,v]of Object.entries({abi:m.abi,config:m.driverConfig,policy:m.policy,dependencies:m.contracts,plan}))save(join(dir,n+'.json'),v);}
 const reg=m.registration,asset=id=>{const b=m.contracts.find(b=>b.contract.contractId===id).contract;return{contractId:id,codeRoot:b.codeRoot,layoutRoot:b.layoutRoot,abi:join(m.build,id===m.driverConfig.nftId?'nft.json':'token-a.json')};};
 const options={kind:m.kind,profile:'batch-admission-compact-v1',network:'sepolia',testnetProfile:h.env.PSY_MARKET_TESTNET_PROFILE,contractId:m.id,vaultId:m.vault,fingerprint:reg.fingerprint,publicKeyHash:reg.publicKeyHash,codeRoot:reg.contracts.find(b=>b.contract.contractId===m.id).contract.codeRoot,layoutRoot:reg.contracts.find(b=>b.contract.contractId===m.id).contract.layoutRoot,wallet:h.binary,walletSha256:h.binarySha256,rpcConfig:h.config,abi:join(dir,'abi.json'),driverConfig:join(dir,'config.json'),policy:join(dir,'policy.json'),dependencyBindings:join(dir,'dependencies.json'),admissionPlan:join(dir,'plan.json'),runtimeDirectory:join(h.base,'runtime'+runtimeSuffix),batchSponsorId:h.actors.sponsor.id,activationPayerId:h.actors.bob.id,automaticInitialize:true,batchExpiryCheckpoints:expiry,batchMemberLimit:4,proverThreads:2,proverMode:mode,users:Object.values(h.actors).filter(a=>a.id!==h.actors.sponsor.id).map(a=>a.id).sort((a,b)=>a-b),...(m.kind==='nftmarket'?{paymentToken:asset(m.driverConfig.tokenId),collection:asset(m.driverConfig.nftId)}:{assetA:asset(m.driverConfig.assetA),assetB:asset(m.driverConfig.assetB)})};
 const path=join(dir,'executor.json');if(!existsSync(path))save(path,options);else assert.deepEqual(read(path),options,'frozen stage options changed');
 const o=await loadOptions(path),adapter=await createPublicWalletAdapter(o,{runDriver:promisify(execFile)}),journal=new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,vaultId:o.vaultId,fingerprint:o.fingerprint});
 const prove=adapter.prove;
 if(benchmark)adapter.prove=async task=>{
  const p=await prove(task);if(!['batch_commit','batch_settle'].includes(task.kind))return p;
  const source=dirname(p.preparedDirectory),out=join(h.base,'attempts',tag+'-'+m.kind+'-'+task.kind+'-cold-comparison'),t=await run(h.binary,['preflight',o.policy,h.config,join(source,'calls.json'),join(source,'guard.json'),out],join(h.base,tag+'-'+m.kind+'-'+task.kind+'-cold-comparison.log'),h.env);
  const warm=parseLosslessJson(readFileSync(join(p.preparedDirectory,'preflight.json'),'utf8')),cold=parseLosslessJson(readFileSync(join(out,'preflight.json'),'utf8'));
  for(const x of [warm,cold]){assert.equal(x.fullUpsVerified,true);assert.equal(x.exactStackAndSessionVerified,true);}assert.equal(warm.core.state_transition.start_user_leaf_hash,cold.core.state_transition.start_user_leaf_hash);assert.equal(warm.core.new_user_leaf.user_state_tree_root,cold.core.new_user_leaf.user_state_tree_root);assert.equal(warm.core.new_user_leaf.nonce,cold.core.new_user_leaf.nonce);assert.equal(warm.fee,cold.fee);assert.equal(warm.actualCalls,cold.actualCalls);assert.equal(warm.callsSha256,cold.callsSha256);
  save(out+'/comparison.json',{scope:'single same-host sequential warm then cold full UPS pair; same request, anchor, nonce, fee and end state; source checkpoints may differ; only warm proof submitted',order:['warm','cold'],host:hostname(),platform:platform(),arch:arch(),logicalCpus:cpus().length,loadAverageAfterPair:loadavg(),rayonThreads:2,binarySha256:o.walletSha256,market:m.kind,task:task.kind,warmDirectory:p.preparedDirectory,coldDirectory:out,coldProcessTiming:t,warmTimingsMs:warm.timingsMilliseconds,coldTimingsMs:cold.timingsMilliseconds,calls:warm.actualCalls,fee:warm.fee,startLeaf:warm.core.state_transition.start_user_leaf_hash,endStateRoot:warm.core.new_user_leaf.user_state_tree_root,warmCheckpoint:warm.core.checkpoint_id,coldCheckpoint:cold.core.checkpoint_id,chainTps:null});return p;
 };
 const step=async(label,expected)=>{
  const output=join(h.base,'public',label+'-formal-result.json');if(existsSync(output))return read(output);
  await journal.reconcile(adapter.reconcile);assert.equal((await journal.unresolved()).length,0,'unknown prior broadcast; stop');
  const taskPath=join(h.base,'public',label+'-formal-task.json');let task;if(existsSync(taskPath))task=read(taskPath);else{const scan=await adapter.scan();assert.ok(scan.action,'no formal action: '+JSON.stringify(scan,(_k,v)=>typeof v==='bigint'?v.toString():v));task=scan.action;assert.ok(expected(task),'unexpected stage action');save(taskPath,task);}
  const before=performance.now(),result=await journal.execute({task,...adapter});
  for(let i=0;i<120;i++){
   await journal.reconcile(adapter.reconcile);const records=await journal.records(),included=records.find(r=>r.taskId===result.taskId&&r.status==='included');
   if(included){const report={checkedAt:new Date().toISOString(),taskId:result.taskId,task,result:included.result,wallMilliseconds:Math.round(performance.now()-before)};save(output,report);console.log(report.checkedAt,m.kind,label,'included',included.result.checkpoint);return report;}
   await pause(10000);
  }
  throw Error('formal broadcast remains unresolved; preserve intent and stop');
 };
 return{options:o,adapter,journal,step,close:()=>adapter.close?.()};
}
