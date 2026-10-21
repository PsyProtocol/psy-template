// Read-only recovery: original content hash + initial proof + authenticated
// absence/presence under a pinned coordinator checkpoint anchor. Indexer status
// remains a separate required report; this does not silently mark it verified.
import assert from'node:assert/strict';import{existsSync,mkdirSync}from'node:fs';import{join}from'node:path';
import{read,save,run}from'../../batching/admission/liveSupport.mjs';import{publicState}from'../publicState.mjs';
export async function collectDeploymentCheckpoint({base,market,expectedDeployer,out}){
 assert.ok(!existsSync(out),'fresh observation directory required');mkdirSync(out);
 const attempt=join(base,'attempts','deploy-'+market+'-v1'),before=read(join(attempt,'before.json')),s=await publicState(join(base,'public/rpc.json')),id=before.next_contract_id,anchor=s.checkpoint;
 assert.ok(Number.isSafeInteger(id)&&id>=5&&id<16777216);assert.ok(before.checkpoint_id<anchor,'wait for a later common checkpoint');
 const rpc=(method,params)=>s.rpc(s.coordinator,method,params,{exactIntegers:true});
 let low=before.checkpoint_id,high=anchor;const observations=[];
 const state=async cp=>{const b=await rpc('psy_get_l2_block_state',{checkpoint_id:cp});observations.push({checkpoint:cp,block:b});return b;};
 assert.equal(Number((await state(low)).next_contract_id),id);assert.ok(Number((await state(high)).next_contract_id)>id,'deployment not allocated at anchor');
 while(high-low>1){const mid=Math.floor((high+low)/2);if(Number((await state(mid)).next_contract_id)>id)high=mid;else low=mid;}
 const [beforeBlock,afterBlock,leaf,beforeRoots,afterRoots,beforeLeaf,afterLeaf,beforeContractProof,afterContractProof,beforeCheckpointProof,afterCheckpointProof,anchorRoot]=await Promise.all([
 state(low),state(high),rpc('psy_get_contract_leaf_data',{contract_id:id}),rpc('psy_get_checkpoint_global_state_roots',{checkpoint_id:low}),rpc('psy_get_checkpoint_global_state_roots',{checkpoint_id:high}),rpc('psy_get_checkpoint_leaf_data',{checkpoint_id:low}),rpc('psy_get_checkpoint_leaf_data',{checkpoint_id:high}),rpc('psy_get_contract_tree_merkle_proof',{checkpoint_id:low,contract_id:id}),rpc('psy_get_contract_tree_merkle_proof',{checkpoint_id:high,contract_id:id}),rpc('psy_get_checkpoint_tree_merkle_proof',{checkpoint_id:anchor,leaf_checkpoint_id:low}),rpc('psy_get_checkpoint_tree_merkle_proof',{checkpoint_id:anchor,leaf_checkpoint_id:high}),rpc('psy_get_checkpoint_tree_root',{checkpoint_id:anchor})]);
 const result={version:1,contractId:id,beforeCheckpoint:low,includedCheckpoint:high,anchorCheckpoint:anchor,anchorRoot,expectedContentHash:read(join(attempt,'receipt.json')).receipt,expectedDeployer,beforeBlock,afterBlock,leaf,beforeRoots,afterRoots,beforeLeaf,afterLeaf,beforeContractProof,afterContractProof,beforeCheckpointProof,afterCheckpointProof};
 save(join(out,'observation.json'),result);save(join(out,'provenance.json'),{checkedAt:new Date().toISOString(),rpcConfig:join(base,'public/rpc.json'),coordinator:s.coordinator,network:s.networkName,networkMagic:s.network.magic,anchorSource:'pinned coordinator HTTPS RPC, not independently attested finality',search:observations,readOnly:true});return result;
}
export async function verifyDeploymentCheckpoint({base,market,expectedDeployer,out,binary}){
 await collectDeploymentCheckpoint({base,market,expectedDeployer,out});
 await run(binary,[join(out,'observation.json'),join(base,'markets-v1',market,'compiled/compilation_artifact.json'),join(base,'attempts','deploy-'+market+'-v1/request.json'),join(out,'verified.json')],join(out,'verify.log'),{RAYON_NUM_THREADS:'2'});return read(join(out,'verified.json'));
}
