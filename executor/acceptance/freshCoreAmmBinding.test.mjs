// Unit ABI projections and synthetic public deployment metadata only.
import test from 'node:test';import assert from 'node:assert/strict';
import {readReviewedAbis} from '../../tests/fixtures/reviewedAbis.mjs';
import {generateBatch,methodSpans} from '../../batching/v2/generate.mjs';
import {makeCorePolicy} from '../../amm/u124/core-build.mjs';
import {projectFreshCoreAmmBinding} from './freshCoreAmmBinding.mjs';
import {bindCoreDependencies} from '../coreDependencyPolicy.mjs';
const hash='a'.repeat(64);
function fixture(){
 const reviewed=readReviewedAbis().admission,config={assetA:56,assetB:57,networkMagic:'1384803358401154921'},marketAbi=structuredClone(reviewed.markets.amm.artifact.abi),base=new Set(methodSpans(generateBatch('amm',config)).map(m=>m.name));marketAbi.contract.methods=marketAbi.contract.methods.filter(m=>base.has(m.name));
 const leaf={deployer:1975680,code_root:hash,state_layout_root:hash,function_tree_root:hash,state_tree_height:31,state_layout_field_count:58,state_layout_slot_count:1325400292},
  marketDeployment={contractId:58,leaf,preflight:{initialLayoutVerified:true,publicEndpointsBound:true,oldFieldCount:0,oldSlotCount:0,codeRoot:hash,layoutRoot:hash,functionTreeRoot:hash,stateTreeHeight:31,newFieldCount:58,newSlotCount:1325400292}},
  qaDeployments={ownerUserId:1975680,ownerPublicKeyHash:hash,rows:['asset-a','asset-b'].map((role,i)=>({role,contractId:56+i,initialLayoutVerified:true,initialLayoutOldFields:0,artifactSha256:hash,leaf:{...leaf}}))},
  nativeBinding={contract:{contractId:0,codeRoot:hash,layoutRoot:hash,stateTreeHeight:32},functionTreeRoot:hash,layoutFieldCount:8,layoutSlotCount:8594128984};
 const nativeContractLeaf={deployer:0,code_root:hash,state_layout_root:hash,function_tree_root:hash,state_tree_height:32,state_layout_field_count:8,state_layout_slot_count:8594128984};
 return {config,chainRootAt1:hash,marketDeployment,qaDeployments,nativeBinding,nativeContractLeaf,marketAbi,tokenAAbi:structuredClone(reviewed.token.abi),tokenBAbi:structuredClone(reviewed.token.abi)};
}
test('actual allocated market policy uses the exact canonical factory and explicit deployment bindings',()=>{
 const x=fixture(),before=structuredClone(x),r=projectFreshCoreAmmBinding(x);
 assert.equal(r.marketId,58);assert.deepEqual(r.dependencies.map(b=>b.contract.contractId),[0,56,57,58]);
 assert.equal(r.profile,'amm-core-dependency-bound-v1');assert.deepEqual(r.policy,bindCoreDependencies(makeCorePolicy(58,x.config,{state_tree_height:31,abi:x.marketAbi},{abi:x.tokenAAbi},hash),r.policy.dependency_bindings));
 assert.notDeepEqual(r.policy,makeCorePolicy(1000,x.config,{state_tree_height:31,abi:x.marketAbi},{abi:x.tokenAAbi},hash));assert.deepEqual(x,before,'projection never rewrites source artifacts');
 assert.equal(Object.hasOwn(r,'compilation_artifact'),false);
});
test('provisional namespaces, altered deployment roots/owners and mismatched ABI projections fail',()=>{
 const edits=[x=>x.marketDeployment.contractId=51,x=>x.marketDeployment.contractId=56,x=>x.config.assetA=49,
  x=>x.qaDeployments.rows[0].contractId=42,x=>x.qaDeployments.rows[1].role='asset-a',x=>x.qaDeployments.rows[0].initialLayoutVerified=false,
  x=>x.marketDeployment.preflight.oldFieldCount=1,x=>x.marketDeployment.preflight.oldSlotCount=1,x=>x.marketDeployment.preflight.publicEndpointsBound=false,
  x=>x.marketDeployment.preflight.codeRoot='b'.repeat(64),x=>x.marketDeployment.leaf.deployer=668800,x=>x.qaDeployments.ownerUserId=971904,
  x=>x.nativeBinding.contract.stateTreeHeight=31,x=>delete x.nativeContractLeaf,x=>x.nativeContractLeaf.code_root='b'.repeat(64),x=>x.nativeContractLeaf.deployer=undefined,x=>x.tokenBAbi.contract.methods.find(m=>m.name==='transfer').method_id=1,
  x=>x.marketAbi.contract.methods.push({name:'stream_scan'}),x=>x.chainRootAt1='0'.repeat(64),x=>x.config.networkMagic='1'];
 for(const edit of edits){const x=fixture();edit(x);assert.throws(()=>projectFreshCoreAmmBinding(x));}
});
