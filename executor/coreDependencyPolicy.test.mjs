// Public policy shape tests only, not Merkle/circuit or live authorization.
import test from 'node:test';import assert from 'node:assert/strict';
import {bindCoreDependencies,requireCoreDependencyPolicy,fullCoreDependency,CORE_DEPENDENCY_KEY_PROFILE,assertCoreDependencyEvidence} from './coreDependencyPolicy.mjs';
import {sha256} from './requestBinding.mjs';
import {canonicalCorePolicy,isDependencyBoundCoreProfile} from './coreMarketProfiles.mjs';
import {readReviewedAbis} from '../tests/fixtures/reviewedAbis.mjs';
import {generateBatch,methodSpans} from '../batching/v2/generate.mjs';
const hash='a'.repeat(64);
function fixture(){const base={version:2,market:'amm',market_id:1000,config:{assetA:56,assetB:57},execution_scope:'explicit-selected-orders-v1',whole_market_completeness:false,qualified_randomness:false};return{base,bindings:[0,56,57,1000].map(contractId=>({contractId,deployer:contractId?1975680:0,codeRoot:hash,layoutRoot:hash,functionTreeRoot:hash,stateTreeHeight:contractId?31:32,layoutFieldCount:15,layoutSlotCount:1174405221}))};}
test('new dependency profile pins every full leaf field without mutating legacy policy or 74-field call shape',()=>{
 const {base,bindings}=fixture(),before=structuredClone(base),p=bindCoreDependencies(base,bindings);assert.equal(p.key_profile,CORE_DEPENDENCY_KEY_PROFILE);assert.deepEqual(requireCoreDependencyPolicy(p),bindings);assert.deepEqual(base,before);assert.equal(base.key_profile,undefined);
 assert.throws(()=>bindCoreDependencies(p,bindings),/new policy once/);assert.throws(()=>requireCoreDependencyPolicy(base),/requires dependency-bound/);
 bindings[1].deployer=123;assert.equal(p.dependency_bindings[1].deployer,1975680,'new policy owns immutable pin projection');
});
test('missing, duplicate, extra and noncanonical full dependency pins fail closed',()=>{
 const edits=[b=>b.pop(),b=>b.push(b[0]),b=>b[1].contractId=0,b=>b.reverse(),b=>delete b[1].deployer,b=>b[1].extra=true,
  b=>b[0].stateTreeHeight=31,b=>b[1].stateTreeHeight=30,b=>b[0].deployer=1,b=>b[1].deployer=0,b=>b[1].deployer=16777216,b=>b[1].deployer=-1,b=>b[1].deployer=9007199254740992,
  b=>b[1].layoutFieldCount=0,b=>b[1].layoutSlotCount=1.5,b=>b[1].codeRoot='0'.repeat(64),b=>b[1].layoutRoot='A'.repeat(64),b=>b[1].functionTreeRoot='f'.repeat(64)];
 for(const edit of edits){const {base,bindings}=fixture();edit(bindings);assert.throws(()=>bindCoreDependencies(base,bindings));}
 const {base,bindings}=fixture();assert.throws(()=>bindCoreDependencies({...base,qualified_randomness:true},bindings));
 const b=bindings[1],leaf={deployer:b.deployer,code_root:b.codeRoot,state_layout_root:b.layoutRoot,function_tree_root:b.functionTreeRoot,state_tree_height:b.stateTreeHeight,state_layout_field_count:b.layoutFieldCount,state_layout_slot_count:b.layoutSlotCount};assert.deepEqual(fullCoreDependency(56,leaf),b);
});
test('distinct formal option selects new key policy while legacy factory output remains unchanged',async()=>{
 const reviewed=readReviewedAbis().admission,config={assetA:56,assetB:57,networkMagic:'1384803358401154921'},abi=structuredClone(reviewed.markets.amm.artifact.abi),names=new Set(methodSpans(generateBatch('amm',config)).map(m=>m.name));abi.contract.methods=abi.contract.methods.filter(m=>names.has(m.name));
 const o={profile:'amm-core-compact-v1',kind:'amm',network:'testnet',testnetProfile:'sdk-audit-20261102-v1',chainRootAt1:hash,contractId:1000,vaultId:100,users:[]},files={config,abi};
 const legacy=await canonicalCorePolicy(o,files,reviewed.token.abi);assert.equal(legacy.key_profile,undefined);
 const {bindings}=fixture(),bound=bindCoreDependencies(legacy,bindings);assert.equal(isDependencyBoundCoreProfile(o.profile),false);
 const current={...o,profile:'amm-core-dependency-bound-v1'};assert.equal(isDependencyBoundCoreProfile(current.profile),true);
 assert.deepEqual(await canonicalCorePolicy(current,{...files,policy:bound},reviewed.token.abi),bound);
 assert.deepEqual(await canonicalCorePolicy(o,files,reviewed.token.abi),legacy);
 await assert.rejects(canonicalCorePolicy(current,files,reviewed.token.abi),/four dependency/);
});
test('bound Native evidence requires both circuit assurances and the exact saved public opening',()=>{
 const openingBytes=Buffer.from('synthetic public dependency opening'),report={keyProfile:CORE_DEPENDENCY_KEY_PROFILE,dependencyBindingsInCircuit:true,chainAnchorInCircuit:true,fullUpsVerified:true,dependencyOpeningSha256:sha256(openingBytes)};
 assert.doesNotThrow(()=>assertCoreDependencyEvidence(report));assert.doesNotThrow(()=>assertCoreDependencyEvidence(report,{openingBytes}));
 for(const change of [{keyProfile:'legacy'},{dependencyBindingsInCircuit:false},{chainAnchorInCircuit:false},{fullUpsVerified:false},{dependencyOpeningSha256:'b'.repeat(64)}])assert.throws(()=>assertCoreDependencyEvidence({...report,...change},{openingBytes}));
 assert.throws(()=>assertCoreDependencyEvidence({}));assert.throws(()=>assertCoreDependencyEvidence(report,{openingBytes:Buffer.from('changed')}));
});
