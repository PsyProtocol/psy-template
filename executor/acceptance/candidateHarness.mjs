// Explicit isolated QA stages. No unknown mutation is ever automatically retried.
import assert from'node:assert/strict';import{createHash}from'node:crypto';import{existsSync,mkdirSync,readFileSync}from'node:fs';import{join,dirname,basename}from'node:path';
import{read,save,ordinary,confirmUps,run}from'../../batching/admission/liveSupport.mjs';import{LiveMarket}from'../../batching/admission/liveMarket.mjs';
import{publicState}from'../publicState.mjs';import{loadOptions}from'../config.mjs';import{createPublicWalletAdapter}from'../publicWalletAdapter.mjs';import{ExecutionJournal}from'../journal.mjs';import{execFile}from'node:child_process';import{promisify}from'node:util';
import{hostname,platform,arch,cpus,loadavg}from'node:os';
import{fileURLToPath}from'node:url';
import{parseLosslessJson}from'../../amm/u124/client.mjs';
export const pause=ms=>new Promise(r=>setTimeout(r,ms));
export function cohort(base,original){
 const releaseFile=process.env.PSY_CANDIDATE_RELEASE_FILE??'candidate-release.json';assert.match(releaseFile,/^candidate-release(?:-v[1-9][0-9]*)?\.json$/);
 const releasePath=join(base,'public',releaseFile),release=existsSync(releasePath)?read(releasePath):null;if(process.env.PSY_CANDIDATE_RELEASE_FILE)assert.ok(release,'explicit frozen release manifest missing');
 if(release){assert.equal(release.version,1);assert.match(release.toolchainFile,/^candidate-toolchain-v[1-9][0-9]*\.json$/);assert.equal(createHash('sha256').update(readFileSync(join(base,'public',release.toolchainFile))).digest('hex'),release.toolchainSha256,'frozen toolchain manifest changed');}
 const tools=read(join(base,'public',release?release.toolchainFile:'candidate-toolchain.json'));
 for(const [path,digest]of [[tools.compactBinary,tools.compactBinarySha256],[tools.ordinaryBinary,tools.ordinaryBinarySha256],[tools.compiler,tools.compilerSha256]])assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),digest,'reviewed test binary changed');
 const binary=tools.compactBinary,ordinaryBinary=tools.ordinaryBinary,config=join(base,'public/rpc.json'),env={PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'};
 const actorHome=existsSync(join(base,'public/qa-actors-source.json'))?read(join(base,'public/qa-actors-source.json')).directory:base;
 const actors={bob:{id:860352,secret:join(original,'.secrets/bob-bundled-profile-v1.json')},trader:{id:876736,secret:join(original,'.secrets/trader.json')},sponsor:{id:1384640,secret:join(original,'.secrets/sponsor-bundled-profile-v1.json')},...Object.fromEntries(['charlie','dave'].map(n=>[n,{id:read(join(actorHome,'public',n+'-registration-v1.json')).userId,secret:join(actorHome,'.secrets',n+'.json')}]))};
 const markets=['amm','orderbook','bondingcurve','nftmarket'].map(kind=>{const build=join(base,'markets-v1',kind),registration=read(join(build,'live-registration.json'));return new LiveMarket({base,config,build,registration,policy:read(join(build,'bound/policy.json')),contracts:registration.contracts,ordinaryBinary,compactBinary:binary,env,actors});});
 const by=Object.fromEntries(markets.map(m=>[m.kind,m])),bindings=new Map(markets.flatMap(m=>m.contracts).map(b=>[b.contract.contractId,b]));
 const user=async(actor,name,calls)=>{const out=join(base,'attempts',name);if(existsSync(join(out,'preflight.json'))){if(!existsSync(join(out,'included.json')))await confirmUps(config,out);return out;}assert.ok(!existsSync(join(base,'public',name+'.json')),'partial unsigned input requires inspected new attempt');return ordinary({base,config,binary:ordinaryBinary,secret:actors[actor].secret,name,calls,bindings,env});};
 return{base,original,releaseFile,binary,binarySha256:tools.compactBinarySha256,ordinaryBinary,config,env,actors,markets,by,bindings,user,token:read(join(by.amm.build,'token-a.json')).abi,nft:read(join(by.nftmarket.build,'nft.json')).abi};
}
export async function formal(h,m,tag,plan,{benchmark=false,expiry=96,mode='resident',runtimeSuffix='',contendOnMaintenance=null}={}){
 const dir=join(h.base,'public',tag+'-'+m.kind+'-executor');if(!existsSync(dir)){mkdirSync(dir);for(const[n,v]of Object.entries({abi:m.abi,config:m.driverConfig,policy:m.policy,dependencies:m.contracts,plan}))save(join(dir,n+'.json'),v);}
 const reg=m.registration,asset=id=>{const b=m.contracts.find(b=>b.contract.contractId===id).contract;const source=join(m.build,id===m.driverConfig.nftId?'nft.json':id===m.driverConfig.assetB?'token-b.json':'token-a.json'),abi=read(source).abi,abiPath=join(dir,'asset-'+id+'-abi.json');assert.ok(abi?.contract,'compiled asset must contain its raw ABI');if(!existsSync(abiPath))save(abiPath,abi);else assert.deepEqual(read(abiPath),abi,'frozen raw asset ABI changed');return{contractId:id,codeRoot:b.codeRoot,layoutRoot:b.layoutRoot,abi:abiPath};};
 const options={kind:m.kind,profile:'batch-admission-compact-v1',network:'sepolia',testnetProfile:h.env.PSY_MARKET_TESTNET_PROFILE,contractId:m.id,vaultId:m.vault,fingerprint:reg.fingerprint,publicKeyHash:reg.publicKeyHash,codeRoot:reg.contracts.find(b=>b.contract.contractId===m.id).contract.codeRoot,layoutRoot:reg.contracts.find(b=>b.contract.contractId===m.id).contract.layoutRoot,wallet:h.binary,walletSha256:h.binarySha256,rpcConfig:h.config,abi:join(dir,'abi.json'),driverConfig:join(dir,'config.json'),policy:join(dir,'policy.json'),dependencyBindings:join(dir,'dependencies.json'),admissionPlan:join(dir,'plan.json'),runtimeDirectory:join(h.base,'runtime'+runtimeSuffix),batchSponsorId:h.actors.sponsor.id,activationPayerId:h.actors[m.kind==='nftmarket'?'trader':'bob'].id,automaticInitialize:true,batchExpiryCheckpoints:expiry,batchMemberLimit:4,proverThreads:2,proverMode:mode,users:Object.values(h.actors).filter(a=>a.id!==h.actors.sponsor.id).map(a=>a.id).sort((a,b)=>a-b),...(m.kind==='nftmarket'?{paymentToken:asset(m.driverConfig.tokenId),collection:asset(m.driverConfig.nftId)}:{assetA:asset(m.driverConfig.assetA),assetB:asset(m.driverConfig.assetB)})};
 const path=join(dir,'executor.json');if(!existsSync(path))save(path,options);else assert.deepEqual(read(path),options,'frozen stage options changed');
 const o=await loadOptions(path),adapter=await createPublicWalletAdapter(o,{runDriver:promisify(execFile)}),journal=new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,vaultId:o.vaultId,fingerprint:o.fingerprint});
 const metricsPath=(task,proof)=>proof?.submissionDirectory?join(h.base,'public',tag+'-'+m.kind+'-submit-metrics-'+createHash('sha256').update(JSON.stringify(task)).digest('hex')+'-'+basename(proof.submissionDirectory)+'.json'):null;
 const submit=adapter.submit;adapter.submit=async(task,proof)=>{const startedAt=new Date().toISOString(),before=performance.now();const result=await submit(task,proof);save(metricsPath(task,proof),{startedAt,finishedAt:new Date().toISOString(),processWallMilliseconds:Math.round(performance.now()-before),scope:'saved-proof verification, fresh state/dependency RPC checks, and HTTP acknowledgement; excludes signing/proving and confirmation; not a pure transport latency',reproved:result.reproved,submissionDirectory:result.submissionDirectory,error:result.error??null});return result;};
 const prove=adapter.prove;
 if(contendOnMaintenance)adapter.prove=async task=>{
  if(task.maintenanceOperation===contendOnMaintenance){
   const output=join(h.base,'public',tag+'-'+m.kind+'-same-journal-contender.json');
   if(!existsSync(output)){
    const taskPath=join(h.base,'public',tag+'-'+m.kind+'-contender-task.json');save(taskPath,task);
    await run(process.execPath,[fileURLToPath(new URL('./candidateContender.mjs',import.meta.url)),path,taskPath,output],join(h.base,tag+'-'+m.kind+'-same-journal-contender.log'),h.env);
   }
  }
  return prove(task);
 };
 const measuredProve=adapter.prove;
 if(benchmark)adapter.prove=async task=>{
  const p=await measuredProve(task);if(!['batch_commit','batch_settle'].includes(task.kind))return p;
  const warm=parseLosslessJson(readFileSync(join(p.preparedDirectory,'preflight.json'),'utf8'));
  const source=dirname(p.preparedDirectory),out=join(h.base,'attempts',tag+'-'+m.kind+'-'+task.kind+'-cold-comparison'),t=await run(h.binary,['preflight',o.policy,h.config,join(source,'calls.json'),join(source,'guard.json'),out],join(h.base,tag+'-'+m.kind+'-'+task.kind+'-cold-comparison.log'),{...h.env,PSY_MARKET_BENCH_SOURCE_CHECKPOINT:warm.core.checkpoint_id.toString()});
  const cold=parseLosslessJson(readFileSync(join(out,'preflight.json'),'utf8'));assert.equal(warm.benchmarkSourceCheckpoint,null);assert.equal(cold.benchmarkSourceCheckpoint,warm.core.checkpoint_id);assert.equal(cold.core.checkpoint_id,warm.core.checkpoint_id);
  for(const x of [warm,cold]){assert.equal(x.fullUpsVerified,true);assert.equal(x.exactStackAndSessionVerified,true);}assert.equal(warm.core.state_transition.start_user_leaf_hash,cold.core.state_transition.start_user_leaf_hash);assert.equal(warm.core.new_user_leaf.user_state_tree_root,cold.core.new_user_leaf.user_state_tree_root);assert.deepEqual(warm.core.new_user_leaf,cold.core.new_user_leaf);assert.equal(warm.core.state_transition.end_user_leaf_hash,cold.core.state_transition.end_user_leaf_hash);assert.equal(warm.core.new_user_leaf.nonce,cold.core.new_user_leaf.nonce);assert.equal(warm.fee,cold.fee);assert.equal(warm.actualCalls,cold.actualCalls);assert.equal(warm.callsSha256,cold.callsSha256);
  save(out+'/comparison.json',{scope:'single same-host sequential warm then cold full UPS pair; same request, authenticated source checkpoint, own anchor, nonce, fee and end state; cold source-calibration proof is read-only and never submitted',order:['warm','cold'],host:hostname(),platform:platform(),arch:arch(),logicalCpus:cpus().length,loadAverageAfterPair:loadavg(),rayonThreads:2,binarySha256:o.walletSha256,market:m.kind,task:task.kind,warmDirectory:p.preparedDirectory,coldDirectory:out,coldProcessTiming:t,warmTimingsMs:warm.timingsMilliseconds,coldTimingsMs:cold.timingsMilliseconds,calls:warm.actualCalls,fee:warm.fee,startLeaf:warm.core.state_transition.start_user_leaf_hash,endStateRoot:warm.core.new_user_leaf.user_state_tree_root,warmCheckpoint:warm.core.checkpoint_id,coldCheckpoint:cold.core.checkpoint_id,chainTps:null});return p;
 };
 const step=async(label,expected)=>{
  const output=join(h.base,'public',label+'-formal-result.json');if(existsSync(output))return read(output);
  await journal.reconcile(adapter.reconcile);assert.equal((await journal.unresolved()).length,0,'unknown prior broadcast; stop');
  const taskPath=join(h.base,'public',label+'-formal-task.json');let task;if(existsSync(taskPath))task=read(taskPath);else{const scan=await adapter.scan();assert.ok(scan.action,'no formal action: '+JSON.stringify(scan,(_k,v)=>typeof v==='bigint'?v.toString():v));task=scan.action;assert.ok(expected(task),'unexpected stage action');save(taskPath,task);}
  const before=performance.now(),result=await journal.execute({task,...adapter});
  for(let i=0;i<120;i++){
   await journal.reconcile(adapter.reconcile);const records=await journal.records();const rejected=records.find(r=>r.taskId===result.taskId&&r.status==='not-submitted');if(rejected)throw Error('explicit pre-broadcast rejection: '+rejected.reason+'; inspect saved proof, use a deliberate fresh recovery label');const included=records.find(r=>r.taskId===result.taskId&&r.status==='included');
   if(included){const mp=metricsPath(task,records.findLast(r=>r.taskId===result.taskId&&r.status==='broadcast-intent')?.proof);const report={checkedAt:new Date().toISOString(),taskId:result.taskId,task,result:included.result,wallMilliseconds:Math.round(performance.now()-before),submitMetricsFile:mp&&existsSync(mp)?mp:null};save(output,report);console.log(report.checkedAt,m.kind,label,'included',included.result.checkpoint);return report;}
   await pause(10000);
  }
  throw Error('formal broadcast remains unresolved; preserve intent and stop');
 };
 return{options:o,adapter,journal,step,close:()=>adapter.close?.()};
}
