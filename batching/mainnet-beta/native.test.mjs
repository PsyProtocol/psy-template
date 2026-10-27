import test from 'node:test';import assert from 'node:assert/strict';
import{PROFILE,bindNativePolicy,validateNativeArtifact,nativeName,verifyDeploymentOwner}from'./native.mjs';
test('numeric deployer and native names require explicit protocol, never coercion',()=>{
 assert.equal(nativeName(PROFILE,'claim'),'claim');
 assert.equal(nativeName('legacy-v1','claim'),'simple_claim');
 assert.throws(()=>nativeName('automatic','claim'));
 verifyDeploymentOwner({deployer:12345},12345,PROFILE);
 for(const owner of ['12345','0'.repeat(64),0,-1,4294967296])assert.throws(()=>verifyDeploymentOwner({deployer:owner},owner,PROFILE));
 assert.throws(()=>verifyDeploymentOwner({deployer:'12345'},12345,PROFILE));
 assert.throws(()=>verifyDeploymentOwner({deployer:12345},'0'.repeat(64),'legacy-v1'));
});
test('fresh native policy migration preserves order, amounts and logical membership',()=>{
 const p={version:2,tx_count:40,commit:[{contract_id:0,method_name:'simple_claim',method_id:2293029357,inputs:[{witness:4}]}],burn:{contract_id:0,method_name:'simple_burn',method_id:2923993647,inputs:[{witness:73}]}},old=structuredClone(p);
 const n=bindNativePolicy(p,PROFILE);assert.deepEqual(p,old);assert.equal(n.tx_count,40);assert.equal(n.commit[0].method_name,'claim');assert.equal(n.burn.method_id,3998182541);assert.deepEqual(n.commit[0].inputs,p.commit[0].inputs);
 for(const change of[x=>x.commit[0].method_id=1,x=>x.commit[0].inputs=[],x=>x.commit[0].method_name='transfer']){const bad=structuredClone(p);change(bad);assert.throws(()=>bindNativePolicy(bad,PROFILE));}
 assert.throws(()=>bindNativePolicy(n,PROFILE));assert.throws(()=>bindNativePolicy(p,'auto'));
 const shared={contract_id:0,method_name:'simple_claim',method_id:2293029357,inputs:[{witness:4}]};
 const aliased=bindNativePolicy({commit:[shared],branches:[{calls:[shared]}]},PROFILE);
 assert.equal(aliased.commit[0].method_name,'claim');
 assert.equal(aliased.branches[0].calls[0].method_id,3824212239);
});
test('new native artifact must match all new names, IDs and arities without alias fallback',()=>{
 const a={state_tree_height:32,circuit_definitions:[['claim',3824212239,1],['transfer',2789897329,2],['burn',3998182541,1]].map(([name,method_id,n])=>({name,method_id,circuit_inputs:Array(n).fill(0),circuit_outputs:[]}))};
 validateNativeArtifact(a,PROFILE);assert.throws(()=>validateNativeArtifact(a,'legacy-v1'));const bad=structuredClone(a);bad.circuit_definitions[2].method_id=2923993647;assert.throws(()=>validateNativeArtifact(bad,PROFILE));
});
