// Pure public-data packaging projection. No compiler, RPC, registration, key
// generation or filesystem writes. Raw compiled artifacts must be copied as
// original bytes; never serialize their full-u64 constants through Number.
import assert from 'node:assert/strict';
import {makeCorePolicy} from '../../amm/u124/core-build.mjs';
import {contractBinding} from '../../batching/admission/liveSupport.mjs';
import {validateU124TokenAbi} from '../u124Abi.mjs';
import {bindCoreDependencies,fullCoreDependency} from '../coreDependencyPolicy.mjs';

const hash=v=>assert.match(v??'',/^[a-f0-9]{64}$/);
const id=v=>assert.ok(Number.isSafeInteger(v)&&v>=5&&v<2**24,'allocated contract identity required');
function binding(id,leaf){
 const b=contractBinding(id,leaf);for(const v of [b.contract.codeRoot,b.contract.layoutRoot,b.functionTreeRoot])hash(v);
 assert.equal(b.contract.stateTreeHeight,id===0?32:31);
 for(const v of [b.layoutFieldCount,b.layoutSlotCount])assert.ok(Number.isSafeInteger(v)&&v>0);
 return b;
}
export function projectFreshCoreAmmBinding({config,chainRootAt1,marketDeployment,qaDeployments,nativeBinding,nativeContractLeaf,marketAbi,tokenAAbi,tokenBAbi}){
 hash(chainRootAt1);assert.notEqual(chainRootAt1,'0'.repeat(64));
 const marketId=marketDeployment.contractId;for(const n of [marketId,config.assetA,config.assetB])id(n);
 assert.equal(new Set([marketId,config.assetA,config.assetB]).size,3);
 assert.ok(![marketId,config.assetA,config.assetB].some(n=>[49,50,51].includes(n)),'old QA deployment cannot be rebound');
 assert.equal(config.networkMagic,'1384803358401154921');
 assert.equal(marketDeployment.preflight.initialLayoutVerified,true);assert.equal(marketDeployment.preflight.publicEndpointsBound,true);
 assert.equal(marketDeployment.preflight.oldFieldCount,0);assert.equal(marketDeployment.preflight.oldSlotCount,0);
 assert.ok(Array.isArray(qaDeployments.rows)&&qaDeployments.rows.length===2);
 assert.ok(Number.isSafeInteger(qaDeployments.ownerUserId)&&qaDeployments.ownerUserId>0&&qaDeployments.ownerUserId<2**24);
 assert.ok(![971904,668800,1182848].includes(qaDeployments.ownerUserId),'fresh deployment owner required');hash(qaDeployments.ownerPublicKeyHash);
 const assetRows=['asset-a','asset-b'].map((role,i)=>{const row=qaDeployments.rows.find(r=>r.role===role);assert.ok(row,'exact QA asset role required');assert.equal(row.contractId,i===0?config.assetA:config.assetB);assert.equal(row.initialLayoutVerified,true);assert.equal(row.initialLayoutOldFields,0);hash(row.artifactSha256);assert.equal(row.leaf.deployer,qaDeployments.ownerUserId);return row;});
 assert.equal(marketDeployment.leaf.deployer,qaDeployments.ownerUserId,'market and QA issuer ownership differ');
 for(const [field,pre]of [['code_root','codeRoot'],['state_layout_root','layoutRoot'],['function_tree_root','functionTreeRoot'],['state_tree_height','stateTreeHeight'],['state_layout_field_count','newFieldCount'],['state_layout_slot_count','newSlotCount']])assert.equal(marketDeployment.leaf[field],marketDeployment.preflight[pre],'deployed market endpoint '+field);
 validateU124TokenAbi(tokenAAbi);validateU124TokenAbi(tokenBAbi);assert.deepEqual(tokenAAbi.contract.methods,tokenBAbi.contract.methods,'ordinary journey requires exact shared token method shape');
 assert.equal(marketAbi.contract.name,'U124Amm');assert.equal(marketAbi.contract.state_tree_height,31);assert.ok(!marketAbi.contract.methods.some(m=>/stream|admission|source|scan/.test(m.name)),'selected-order ABI only');
 const basePolicy=makeCorePolicy(marketId,config,{state_tree_height:31,abi:marketAbi},{abi:tokenAAbi},chainRootAt1),marketBinding=binding(marketId,marketDeployment.leaf);
 assert.equal(nativeBinding.contract.contractId,0);assert.equal(nativeBinding.contract.stateTreeHeight,32);for(const v of [nativeBinding.contract.codeRoot,nativeBinding.contract.layoutRoot,nativeBinding.functionTreeRoot])hash(v);
 assert.deepEqual(binding(0,nativeContractLeaf),nativeBinding,'complete Native leaf must match frozen Native projection');
 const dependencies=[nativeBinding,...assetRows.map(row=>binding(row.contractId,row.leaf)),marketBinding];
 const fullDependencies=[fullCoreDependency(0,nativeContractLeaf),...assetRows.map(row=>fullCoreDependency(row.contractId,row.leaf)),fullCoreDependency(marketId,marketDeployment.leaf)].sort((a,b)=>a.contractId-b.contractId),policy=bindCoreDependencies(basePolicy,fullDependencies);
 return {marketId,profile:'amm-core-dependency-bound-v1',issuerId:qaDeployments.ownerUserId,issuerPublicKeyHash:qaDeployments.ownerPublicKeyHash,chainRootAt1,config,policy,dependencies,abi:marketAbi,assetAAbi:tokenAAbi,assetBAbi:tokenBAbi,
  boundary:'Actual allocated-identity public projection only; key derivation/registration, current dependency reads, complete actual-identity UPS and live authorization remain separate gates.'};
}
