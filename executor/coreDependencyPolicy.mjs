// A distinct key profile. Historical policies/fingerprints are never rewritten.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const CORE_DEPENDENCY_KEY_PROFILE='selected-dependency-bound-v1';
const fields=['contractId','deployer','codeRoot','layoutRoot','functionTreeRoot','stateTreeHeight','layoutFieldCount','layoutSlotCount'];
const P=18446744069414584321n;
function root(value){assert.match(value??'',/^[a-f0-9]{64}$/);assert.notEqual(value,'0'.repeat(64),'nonzero dependency root required');for(let i=0;i<64;i+=16)assert.ok(BigInt('0x'+value.slice(i,i+16))<P,'canonical dependency root limbs required');}
export function fullCoreDependency(contractId,leaf){
 assert.ok(leaf&&typeof leaf==='object');
 return {contractId,deployer:leaf.deployer,codeRoot:leaf.code_root,layoutRoot:leaf.state_layout_root,functionTreeRoot:leaf.function_tree_root,
  stateTreeHeight:leaf.state_tree_height,layoutFieldCount:leaf.state_layout_field_count,layoutSlotCount:leaf.state_layout_slot_count};
}
export function assertCoreDependencyBindings(policy,bindings){
 assert.ok(Array.isArray(bindings)&&bindings.length===4,'exact four dependency leaf pins required');
 const config=policy.config,assets=policy.market==='nftmarket'?[config.tokenId,config.nftId]:[config.assetA,config.assetB],ids=[0,...assets,policy.market_id].sort((a,b)=>a-b);
 assert.equal(new Set(ids).size,4,'distinct Native/assets/market dependency set');assert.deepEqual(bindings.map(b=>b.contractId),ids,'sorted exact dependency identity set required');
 for(const b of bindings){
  assert.deepEqual(Object.keys(b).sort(),[...fields].sort(),'exact full contract leaf projection required');
  assert.ok(Number.isSafeInteger(b.contractId)&&b.contractId>=0&&b.contractId<2**24);
  assert.ok(Number.isSafeInteger(b.deployer)&&(b.contractId===0?b.deployer===0:b.deployer>0&&b.deployer<2**24),'Native deployer zero or exact non-Native user deployer required');
  for(const key of ['codeRoot','layoutRoot','functionTreeRoot'])root(b[key]);
  assert.equal(b.stateTreeHeight,b.contractId===0?32:policy.market==='nftmarket'&&b.contractId===config.nftId?30:31,'exact dependency tree height required');
  for(const key of ['layoutFieldCount','layoutSlotCount'])assert.ok(Number.isSafeInteger(b[key])&&b[key]>0&&BigInt(b[key])<P,'exact positive layout scalar required');
 }
 return bindings;
}
export function bindCoreDependencies(basePolicy,bindings){
 assert.equal(basePolicy.version,2);assert.equal(basePolicy.execution_scope,'explicit-selected-orders-v1');
 assert.equal(basePolicy.whole_market_completeness,false);assert.equal(basePolicy.qualified_randomness,false);
 assert.equal(basePolicy.key_profile,undefined,'dependency binding creates a new policy once');assert.equal(basePolicy.dependency_bindings,undefined);
 assertCoreDependencyBindings(basePolicy,bindings);
 return {...basePolicy,key_profile:CORE_DEPENDENCY_KEY_PROFILE,dependency_bindings:structuredClone(bindings)};
}
export function requireCoreDependencyPolicy(policy){
 assert.equal(policy.key_profile,CORE_DEPENDENCY_KEY_PROFILE,'new funded execution requires dependency-bound key profile');
 return assertCoreDependencyBindings(policy,policy.dependency_bindings);
}
export function assertCoreDependencyEvidence(report,{openingBytes}={}){
 assert.equal(report?.keyProfile,CORE_DEPENDENCY_KEY_PROFILE,'bound Native key profile evidence required');
 assert.equal(report.dependencyBindingsInCircuit,true,'Native dependency circuit binding evidence required');
 assert.equal(report.chainAnchorInCircuit,true,'Native chain anchor circuit binding evidence required');
 if(openingBytes!==undefined){
  assert.equal(report.fullUpsVerified,true,'full UPS required with dependency opening');
  assert.match(report.dependencyOpeningSha256??'',/^[a-f0-9]{64}$/);
  assert.equal(createHash('sha256').update(openingBytes).digest('hex'),report.dependencyOpeningSha256,'saved dependency opening changed');
 }
}
