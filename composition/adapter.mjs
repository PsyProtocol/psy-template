// Financial transport for the independent funded controller. Base markets keep
// their own Executors; this adapter never signs as or writes a foreign vault.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';import {join,dirname} from 'node:path';import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {executionModel,scanComposition,bindAction,withActionFee} from './execution.mjs';
import {decodeDocument} from './codec.mjs';
import {verifyControllerDeployment} from './initialDeployment.mjs';
import {verifyControllerBuild} from './controllerBuild.mjs';
import {componentPaths,verifyComponents} from './components.mjs';
import {compositionDomain} from './domain.mjs';
import {generateFunds} from './contract/funds.mjs';
import {COMPOSITION_MAGIC,COMPOSITION_SDK} from './contract/runtimePolicy.mjs';
import {parseLosslessJson,losslessJson} from '../amm/u124/client.mjs';
import {readTogether,mapReads} from '../executor/readConcurrency.mjs';
import {publicState} from '../executor/publicState.mjs';import {receiptReader} from '../executor/chainReceipts.mjs';
import {sealDriver} from '../executor/sealedDriver.mjs';import {captureInputs} from '../executor/submissionGuard.mjs';
import {publishFile} from '../executor/durableFile.mjs';import {sha256} from '../executor/requestBinding.mjs';
import {residentProver} from '../executor/residentProver.mjs';import {runDurableSubmission,driverRecords} from '../executor/driverProcess.mjs';
import {StaleTask} from '../executor/journal.mjs';
import {ProofSessionReadUnavailable,proofReadEvidence} from './proofReadRecovery.mjs';
import {assertDurableRuntimeDirectory} from '../executor/runtimeStorage.mjs';import {validateU124TokenAbi} from '../executor/u124Abi.mjs';
const json=async p=>JSON.parse(await readFile(p,'utf8')),exact=async p=>parseLosslessJson(await readFile(p,'utf8'));
async function immutable(path,value){const text=typeof value==='string'?value:losslessJson(value)+'\n';await mkdir(dirname(path),{recursive:true,mode:0o700});try{await publishFile(path,text);}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(path,'utf8'),text,'immutable composition artifact changed');}}
export async function createCompositionAdapter(o,{readState=publicState,readReceipts=receiptReader,runDriver=promisify(execFile),submitDriver=runDurableSubmission,residentFactory=residentProver,verifyRouteComponents=verifyComponents,verifyControllerSource=verifyControllerBuild,verifyInitialDeployment=verifyControllerDeployment}={}){
 o=structuredClone(o);
 assert.equal(o.profile,'composition-funded-v1');assert.equal(o.network,'sepolia');assert.equal(o.sdkManifestHash,COMPOSITION_SDK);assert.equal(o.testnetProfile,'staging-bundled-regtest-20261020-v1');assertDurableRuntimeDirectory(o.runtimeDirectory);
 const paths=[o.intent,o.plan,o.policy,o.controllerAbi,o.controllerSource,o.controllerArtifact,o.tokenAbi,o.otherTokenAbi,o.nativeAbi,...o.marketAbis,o.rpcConfig,...componentPaths(o),...(o.initialDeployment?[o.initialDeployment.request]:[])],inputsCurrent=await captureInputs(paths);
 const [intent,plan]=await Promise.all([o.intent,o.plan].map(async p=>decodeDocument(await readFile(p,'utf8'))));
 // Policy and ABI IDs are bounded metadata, not financial integer parsing.
 const plainPolicy=await json(o.policy),controllerAbi=await json(o.controllerAbi),tokenAbi=await json(o.tokenAbi),otherToken=await json(o.otherTokenAbi),nativeAbi=await json(o.nativeAbi),marketAbis=await Promise.all(o.marketAbis.map(json));
 validateU124TokenAbi(tokenAbi);validateU124TokenAbi(otherToken);for(const name of ['claim','transfer'])assert.equal(tokenAbi.contract.methods.find(m=>m.name===name).method_id,otherToken.contract.methods.find(m=>m.name===name).method_id);
 const model=executionModel({intent,plan,policy:plainPolicy,controllerAbi,tokenAbi,nativeAbi,marketAbis,controllerBudget:BigInt(o.controllerBudget),ownerFeeReserve:BigInt(o.ownerFeeReserve)}),t=model.intent.terms;
 const V=Number(t.execution.vaultId),C=Number(t.execution.controllerId);assert.equal(o.vaultId,V);assert.equal(o.fingerprint,t.execution.fingerprint);assert.equal(o.publicKeyHash,t.execution.publicKeyHash);
 assert.ok(Array.isArray(o.assetMetadata)&&o.assetMetadata.length===2,'canonical immutable token metadata required for financial execution');
 for(const [j,m]of o.assetMetadata.entries()){assert.equal(m.contractId,Number(j?model.assetB:model.assetA));assert.equal(m.decimals,model.plan.registry.value.markets[0].assets[j].decimals);}
 assert.equal(await readFile(o.controllerSource,'utf8'),generateFunds({networkMagic:COMPOSITION_MAGIC,registryHash:model.plan.registryHash,assetA:Number(model.assetA),assetB:Number(model.assetB),assetMetadata:o.assetMetadata,intentOwner:Number(t.owner)}),'controller must bind the dedicated owner and canonical immutable metadata');
 assert.deepEqual((await json(o.controllerArtifact)).abi,controllerAbi,'compiled controller ABI closure');
 for(const abi of [tokenAbi,otherToken])for(const [name,offset]of [['decimals',33554445],['is_mint_renounced',3]])assert.equal(abi.contract.state.find(f=>f.name===name)?.offset,offset,'canonical token metadata layout');
 const dependencies=new Map();for(const m of model.plan.registry.value.markets)for(const d of m.dependencies){const key=Number(d.contractId);if(dependencies.has(key))assert.equal(losslessJson(dependencies.get(key)),losslessJson(d),'inconsistent shared dependency');dependencies.set(key,d);}
 const e=t.execution;dependencies.set(C,{contractId:e.controllerId,codeRoot:e.codeRoot,layoutRoot:e.layoutRoot,functionTreeRoot:e.functionTreeRoot,stateTreeHeight:e.stateTreeHeight,layoutFieldCount:e.layoutFieldCount,layoutSlotCount:e.layoutSlotCount});
 const required=[...new Set(plainPolicy.branches.flatMap(b=>b.calls.map(c=>c.contract_id)))].sort((a,b)=>a-b);assert.deepEqual([...dependencies.keys()].sort((a,b)=>a-b),required);
 const bindings=[...dependencies.values()].sort((a,b)=>a.contractId<b.contractId?-1:1).map(d=>({contract:{contractId:Number(d.contractId),codeRoot:d.codeRoot,layoutRoot:d.layoutRoot,stateTreeHeight:Number(d.stateTreeHeight)},functionTreeRoot:d.functionTreeRoot,layoutFieldCount:Number(d.layoutFieldCount),layoutSlotCount:Number(d.layoutSlotCount)}));
 const identity={version:1,network:o.network,marketId:C,vaultId:V,fingerprint:o.fingerprint,publicKeyHash:o.publicKeyHash,contracts:bindings.map(b=>b.contract)};
 const networkState=async()=>{await inputsCurrent();const s=await readState(o.rpcConfig);assert.equal(s.networkName,o.network);assert.equal(BigInt(s.network.magic),COMPOSITION_MAGIC);assert.equal(t.domainHash,compositionDomain(s.networkName,s.network),'intent domain differs from pinned application network');return s;};
 let componentClosure,controllerClosure,initialDeployment;
 const current=async()=>{await componentClosure.check();await controllerClosure.check();await initialDeployment?.check();const s=await networkState();
  // One freshly obtained snapshot per check. Independent registry/metadata
  // requests share the process-wide four-RPC bound; nothing crosses snapshots.
  await mapReads([
   ...bindings.map(b=>async()=>{const l=await s.contractLeaf(b.contract.contractId);assert.deepEqual({contract:{contractId:b.contract.contractId,codeRoot:l.code_root,layoutRoot:l.state_layout_root,stateTreeHeight:l.state_tree_height},functionTreeRoot:l.function_tree_root,layoutFieldCount:l.state_layout_field_count,layoutSlotCount:l.state_layout_slot_count},b,'composition code/layout/function dependency changed');if(b.contract.contractId===C&&initialDeployment)assert.equal(l.deployer,initialDeployment.expectedDeployer,'controller deployment owner changed');}),
   ...[...model.plan.registry.value.markets,{vaultId:t.execution.vaultId,publicKeyHash:t.execution.publicKeyHash}].map(m=>async()=>assert.deepEqual(await s.userIds(m.publicKeyHash),[Number(m.vaultId)],'composition/base market key registration')),
   ...o.assetMetadata.map(m=>async()=>{const [decimals,renounced]=await readTogether([s.slot(m.issuerUserId,m.contractId,33554445),s.slot(m.issuerUserId,m.contractId,3)]);assert.equal(decimals,BigInt(m.decimals),'live canonical decimals changed');assert.equal(renounced,1n,'token administration must be immutable before funding');})
  ],read=>read());
  await inputsCurrent();return s;
 };
 // Receipt-only restart remains possible after a dependency changes. Every
 // new scan/proof/send still performs the complete current dependency check.
 const startupState=await networkState();componentClosure=await verifyRouteComponents(o,model,{runDriver});controllerClosure=await verifyControllerSource(o,model,{runDriver});await inputsCurrent();const driver=await sealDriver(o),env={...process.env,PSY_MARKET_TESTNET_PROFILE:o.testnetProfile,RAYON_NUM_THREADS:String(o.proverThreads??2)};
 for(const k of Object.keys(env))if(k.endsWith('_WITNESS_WALLET')||k.endsWith('_LOCAL_DEFS')||k==='PSY_MARKET_BENCH_SOURCE_CHECKPOINT')delete env[k];
 const id=driverRecords((await runDriver(driver.file,['identity',o.policy],{env,timeout:120000,maxBuffer:2000000})).stdout).find(r=>r.profile==='composition-v1');assert.equal(id?.fingerprint,o.fingerprint);assert.equal(id?.publicKeyHash,o.publicKeyHash);
 if(o.initialDeployment){initialDeployment=await verifyInitialDeployment(o,model,{runDriver});const s=await networkState();assert.equal((await s.contractLeaf(C)).deployer,initialDeployment.expectedDeployer,'current deployment owner');}else{const inspection=join(o.runtimeDirectory,'composition-inspection-'+randomUUID());await runDriver(driver.file,['inspect-controller',o.policy,o.controllerArtifact,inspection],{env,timeout:900000,maxBuffer:2000000});const inspected=await json(join(inspection,'inspection.json'));assert.equal(inspected.artifactSha256,sha256(await readFile(o.controllerArtifact)));assert.equal(inspected.initialLayoutVerified,true);assert.equal(inspected.publicEndpointsBound,true);for(const [field,want]of [['codeRoot',t.execution.codeRoot],['layoutRoot',t.execution.layoutRoot],['functionTreeRoot',t.execution.functionTreeRoot],['stateTreeHeight',Number(t.execution.stateTreeHeight)],['newFieldCount',Number(t.execution.layoutFieldCount)],['newSlotCount',Number(t.execution.layoutSlotCount)]])assert.equal(inspected[field],want,'actual compiled controller identity '+field);}
 const resident=residentFactory(driver.file,o.policy,o.rpcConfig,{env}),find=await readReceipts(o.rpcConfig,{maxPages:100});
 const pinnedNetwork=startupState.network;
 const readEndpoints=[...pinnedNetwork.realm_configs,...pinnedNetwork.coordinator_configs].flatMap(r=>r.rpc_url);
 const proofOnly=async(action,task,out,args)=>{
  try{return await resident[action](args);}catch(error){
   // Preserve exact child output even when the service later rebuilds resources.
   await immutable(out+'.log',(error.stdout??'')+'\n'+(error.stderr??''));
   if(error.residentRejection?.phase!=='start-compact-session')throw error;
   let evidence;try{evidence=await proofReadEvidence(out,error.residentRejection,readEndpoints);}catch{throw error;}
   await inputsCurrent();await driver.check();
   throw new ProofSessionReadUnavailable({...evidence,action,taskSha256:sha256(losslessJson(task)),
    intentId:model.intent.id,driverSha256:driver.sha256,sdkManifestHash:o.sdkManifestHash},error);
  }
 };
 const root=task=>join(o.runtimeDirectory,'composition',o.network,String(V),sha256(losslessJson(task))),files=task=>({calls:join(root(task),'calls.json'),guard:join(root(task),'guard.json')});
 const attemptPath=(task,prefix,path)=>{assert.ok(typeof path==='string'&&path.startsWith(join(root(task),prefix)+'-')&&/^[0-9a-f-]{36}$/.test(path.slice(join(root(task),prefix).length+1)),'composition attempt path');return path;};
 const pre=async(task,p)=>{bindAction(model,task);assert.equal(p.driverSha256,driver.sha256);attemptPath(task,'proof',p.preparedDirectory);const mb=await readFile(join(p.preparedDirectory,'prepared.json'));assert.equal(sha256(mb),p.manifestSha256);const m=JSON.parse(mb),q=files(task);
  for(const [path,want]of [[o.policy,m.policySha256],[q.calls,m.callsSha256],[q.guard,m.guardSha256],[join(p.preparedDirectory,'preflight.json'),m.preflightSha256],[join(p.preparedDirectory,'request.json'),m.requestSha256]])assert.equal(sha256(await readFile(path)),want,'composition prepared file changed');
  assert.equal(await readFile(q.calls,'utf8'),task.submission);const r=await exact(join(p.preparedDirectory,'preflight.json'));assert.equal(r.fullUpsVerified,true);assert.equal(r.exactStackAndSessionVerified,true);assert.equal(r.compositionProfile,'two-amm-owner-funded-v1');assert.equal(r.broadcast,false);assert.equal(r.core.new_user_leaf.user_id,BigInt(V));assert.equal(r.core.new_user_leaf.public_key,o.publicKeyHash);
  const request=bindAction(model,task),stats=r.core.stats;assert.equal(r.fee,request.software_defined_call.inputs[73]);assert.equal(stats.guta_fees_collected,1000000000n);assert.equal(stats.da_fees_collected,stats.slots_modified*1000n);assert.equal(stats.guta_fees_collected+stats.da_fees_collected,r.fee);assert.equal(r.actualCalls,BigInt(request.contract_calls.length+1));assert.equal(stats.total_transactions,r.actualCalls,'complete calls including exact fee burn');return{m,r};
 };
 const scan=async()=>scanComposition(model,await current());
 const isCurrent=async task=>{bindAction(model,task);await driver.check();const state=await current(),until=BigInt(task.validUntilCheckpoint),cp=BigInt(state.checkpoint);if(cp>until||until>cp+64n||(/^(open|consent)-/.test(task.operation)&&until>t.expiresAtCheckpoint))return false;const next=(await scanComposition(model,state)).action;if(!next)return false;const request=bindAction(model,task),normalized=withActionFee(model,next,request.software_defined_call.inputs[73]);normalized.validUntilCheckpoint=task.validUntilCheckpoint;return losslessJson(normalized)===losslessJson(task);};
 // A fee trace is advisory. A single trace proposes the actual fee; only
 // pre() + the driver's full UPS can authorize its exact burn. If slot cost
 // changes after this trace, proof/send fails closed rather than escalating.
 const feeRecord=task=>join(root(task),'fee-preparation.json');
 const quote=async(proposal)=>{if(!await isCurrent(proposal))throw new StaleTask('stale composition proposal');
  const q=files(proposal);await immutable(q.calls,proposal.submission);await immutable(q.guard,{identity,dependencies:bindings,validUntilCheckpoint:Number(proposal.validUntilCheckpoint)});
  const out=join(root(proposal),'quote-'+randomUUID());await driver.check();const result=await proofOnly('quote',proposal,out,['quote',o.policy,o.rpcConfig,q.calls,q.guard,out]);await immutable(out+'.log',(result.stdout??'')+'\n'+(result.stderr??''));
  const bytes=await readFile(join(out,'quote.json')),report=parseLosslessJson(bytes.toString('utf8'));assert.equal(report.broadcast,false);assert.equal(report.endcapSigned,false);assert.equal(report.actualBurnVerified,false);const fee=report.fee;assert.ok(fee>=1000000000n&&fee<=1000100000n&&fee%1000n===0n);
  const task=withActionFee(model,proposal,fee);if(!await isCurrent(task))throw new StaleTask('proposal changed during fee trace');
  // Exact advisory task and original trace retained across a proven safe
  // pre-session restart. This record is never an authorization or proof cache.
  const record={version:1,driverSha256:driver.sha256,sdkManifestHash:o.sdkManifestHash,intentId:model.intent.id,proposal,taskSha256:sha256(losslessJson(task)),quoteDirectory:out,quoteSha256:sha256(bytes)};
  // New quote attempts are append-only, even if the exact same task recurs.
  const recordPath=join(root(task),'fee-preparation-'+randomUUID()+'.json');await immutable(recordPath,record);
  try{await publishFile(feeRecord(task),losslessJson({version:1,recordPath,recordSha256:sha256(await readFile(recordPath))})+'\n');}catch(error){if(error.code!=='EEXIST')throw error;assert.equal(await validateFeePreparation(task),true,'existing fee preparation must remain exact and current');}return task;
 };
 const loadFeePreparation=async task=>{
  bindAction(model,task);let pointer;try{pointer=await exact(feeRecord(task));}catch(error){if(error.code==='ENOENT')return null;throw error;}
  assert.equal(pointer.version,1n);attemptPath(task,'fee-preparation',pointer.recordPath.replace(/\.json$/,''));
  const bytes=await readFile(pointer.recordPath);assert.equal(sha256(bytes),pointer.recordSha256);const record=parseLosslessJson(bytes.toString('utf8'));assert.ok(record.version===1n||record.version===2n);assert.equal(record.driverSha256,driver.sha256);assert.equal(record.sdkManifestHash,o.sdkManifestHash);assert.equal(record.intentId,model.intent.id);assert.equal(record.taskSha256,sha256(losslessJson(task)));
  bindAction(model,record.proposal);const quoted=record.quotedProposal??record.proposal;bindAction(model,quoted);
  // Only the unsigned transport window can differ. Calls, fee proposal,
  // amounts, intent, recipient and every business term must remain exact.
  assert.equal(losslessJson({...quoted,validUntilCheckpoint:record.proposal.validUntilCheckpoint}),losslessJson(record.proposal),'advisory renewal changed business terms');
  attemptPath(quoted,'quote',record.quoteDirectory);const reportBytes=await readFile(join(record.quoteDirectory,'quote.json'));assert.equal(sha256(reportBytes),record.quoteSha256);const report=parseLosslessJson(reportBytes.toString('utf8'));assert.equal(report.broadcast,false);assert.equal(report.endcapSigned,false);assert.equal(report.actualBurnVerified,false);assert.ok(report.fee>=1000000000n&&report.fee<=1000100000n&&report.fee%1000n===0n);
  assert.equal(losslessJson(withActionFee(model,record.proposal,report.fee)),losslessJson(task));return{record,report,pointer};
 };
 const validateFeePreparation=async task=>{const saved=await loadFeePreparation(task);return saved?await isCurrent(task):false;};
 const renewFeePreparation=async(task,proposal)=>{
  const saved=await loadFeePreparation(task);if(!saved)return null;bindAction(model,proposal);
  const next=withActionFee(model,proposal,saved.report.fee);
  if(losslessJson({...task,validUntilCheckpoint:next.validUntilCheckpoint})!==losslessJson(next))return null;
  if(!await isCurrent(next))return null;
  if(next.validUntilCheckpoint===task.validUntilCheckpoint)return next;
  // No request/proof/signature is copied. A new task gets a fresh full UPS;
  // old signed proofs keep their original guard and are never retimed.
  const record={...saved.record,version:2,proposal,quotedProposal:saved.record.quotedProposal??saved.record.proposal,taskSha256:sha256(losslessJson(next)),renewedFromTaskSha256:sha256(losslessJson(task)),sourceRecordSha256:saved.pointer.recordSha256};
  const path=join(root(next),'fee-preparation-'+randomUUID()+'.json');await immutable(path,record);
  try{await publishFile(feeRecord(next),losslessJson({version:1,recordPath:path,recordSha256:sha256(await readFile(path))})+'\n');}catch(error){if(error.code!=='EEXIST')throw error;assert.equal(await validateFeePreparation(next),true);}
  return next;
 };
 const adapter={scan,isCurrent,quote,validateFeePreparation,renewFeePreparation,model,snapshot:current,close:()=>resident.close(),
  validateProof:async(task,p)=>{try{const {r}=await pre(task,p),s=await current();if(BigInt(s.checkpoint)>BigInt(task.validUntilCheckpoint))return false;const realm=s.network.realm_configs.find(x=>x.id===Math.floor(V/s.network.users_per_realm)),params={checkpoint_id:s.checkpoint,user_id:V},[leaf,hash]=await readTogether([s.rpc(realm.rpc_url[0],'psy_get_user_leaf_data',params,{exactIntegers:true}),s.rpc(realm.rpc_url[0],'psy_get_user_tree_leaf_hash',params)]);return BigInt(leaf.nonce)+1n===r.core.new_user_leaf.nonce&&(hash===r.core.state_transition.start_user_leaf_hash||(BigInt(leaf.nonce)===0n&&r.core.state_transition.start_user_leaf_hash==='0'.repeat(64)));}catch(e){if(e.code==='ENOENT')return false;throw e;}},
  prove:async task=>{if(!await isCurrent(task))throw new StaleTask('stale composition operation');const q=files(task);await immutable(q.calls,task.submission);await immutable(q.guard,{identity,dependencies:bindings,validUntilCheckpoint:Number(task.validUntilCheckpoint)});const out=join(root(task),'proof-'+randomUUID());const result=await proofOnly('prove',task,out,['preflight',o.policy,o.rpcConfig,q.calls,q.guard,out]);await immutable(out+'.log',(result.stdout??'')+'\n'+(result.stderr??''));await inputsCurrent();await driver.check();const p={driverSha256:driver.sha256,preparedDirectory:out,manifestSha256:sha256(await readFile(join(out,'prepared.json')))};await pre(task,p);return p;},
  prepareSubmission:async(task,p)=>({...p,submissionDirectory:join(root(task),'send-'+randomUUID())}),
  submit:async(task,p)=>{assert.ok(await isCurrent(task),'stale financial action');await driver.check();await pre(task,p);const q=files(task),out=attemptPath(task,'send',p.submissionDirectory);let error=null;try{await submitDriver(driver.file,['broadcast-prepared',o.policy,o.rpcConfig,q.calls,q.guard,p.preparedDirectory,p.manifestSha256,out],{env,timeout:900000,logFile:out+'.log'});}catch(e){error=e.message;}return{reproved:false,submissionDirectory:out,error};},
  reconcile:async record=>{const p=record.proof,{m,r}=await pre(record.task,p),out=attemptPath(record.task,'send',p.submissionDirectory);let intent;try{intent=await exact(join(out,'intent.json'));}catch(e){if(e.code!=='ENOENT')throw e;let f;try{f=await json(join(out,'failure.json'));}catch(e){if(e.code!=='ENOENT')throw e;}if(f?.broadcastMayHaveBeenAttempted===false&&f.ok===false)return{status:'not-submitted',source:'explicit-composition-driver-rejection',reason:f.reason};return{status:'unresolved',reason:'no original durable identity; never substitute another business operation'};}
   const v=await exact(join(out,'verification.json'));assert.equal(v.fullUpsVerified,true);assert.equal(v.reproved,false);assert.equal(v.preparedManifestSha256,p.manifestSha256);assert.equal(v.requestSha256,m.requestSha256);assert.equal(intent.requestSha256,m.requestSha256);assert.equal(intent.userId,BigInt(V));assert.equal(intent.nonce,r.core.new_user_leaf.nonce);assert.equal(intent.endUserLeafHash,r.core.state_transition.end_user_leaf_hash);
   const result=await find({userId:V,endUserLeafHash:intent.endUserLeafHash,minCheckpoint:Number(r.core.checkpoint_id)});if(result.status==='included'){const s=await networkState();if(s.checkpoint<result.checkpoint)return{status:'unresolved',reason:'included-awaiting-common-state',includedReceipt:result};const fee=r.core.stats.guta_fees_collected+r.core.stats.da_fees_collected;assert.equal(BigInt(result.receipt.data.result.fees_collected),fee);for(const k of ['slots_modified','total_transactions','user_ops_processed'])assert.equal(BigInt(result.receipt.data.result[k]),r.core.stats[k]);return{...result,commonCheckpoint:s.checkpoint};}return result;
  }
 };return adapter;
}
