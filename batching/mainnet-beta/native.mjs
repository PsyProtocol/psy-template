// Explicit build-time native ABI migration for fresh keys/deployments only.
// Never changes old artifacts or treats ABI equivalence as identity approval.
import assert from 'node:assert/strict';
export const PROFILE='mainnet-beta-20261027';
export const METHODS=Object.freeze({claim:{name:'claim',id:3824212239,arity:1},
 transfer:{name:'transfer',id:2789897329,arity:2},burn:{name:'burn',id:3998182541,arity:1}});
const legacy={simple_claim:{...METHODS.claim,old:2293029357},
 simple_transfer:{...METHODS.transfer,old:354447671},simple_burn:{...METHODS.burn,old:2923993647}};
export function nativeName(profile,operation){
 assert.ok(['legacy-v1',PROFILE].includes(profile),'explicit native protocol');
 assert.ok(Object.hasOwn(METHODS,operation),'known native operation');
 return profile===PROFILE?operation:'simple_'+operation;
}
export function verifyDeploymentOwner(leaf,owner,profile='legacy-v1'){
 assert.ok(['legacy-v1',PROFILE].includes(profile),'explicit owner protocol');
 if(profile===PROFILE)assert.ok(Number.isSafeInteger(owner)&&owner>0&&owner<4294967296,'registered numeric deployer required');
 else assert.match(owner,/^[0-9a-f]{64}$/,'legacy hash owner required');
 assert.equal(leaf.deployer,owner,'exact deployment owner; no schema coercion');
}
export function validateNativeArtifact(a,profile='legacy-v1'){
 assert.equal(a.state_tree_height,32,'native height');
 assert.ok(['legacy-v1',PROFILE].includes(profile),'explicit native protocol');
 const methods=profile===PROFILE?Object.values(METHODS):Object.entries(legacy).map(([name,m])=>({name,id:m.old,arity:m.arity}));
 for(const m of methods)assert.ok(a.circuit_definitions.some(d=>d.name===m.name&&d.method_id===m.id&&d.circuit_inputs.length===m.arity&&d.circuit_outputs.length===0),'native method identity '+m.name);
}
export function bindNativePolicy(policy,profile='legacy-v1'){
 assert.ok(['legacy-v1',PROFILE].includes(profile),'explicit native policy profile');
 const out=structuredClone(policy),visited=new WeakSet();
 function visit(value){
  if(!value||typeof value!=='object')return;
  if(visited.has(value))return;
  visited.add(value);
  if(value.contract_id===0&&Object.hasOwn(value,'method_id')){
   const m=legacy[value.method_name];
   assert.ok(m&&value.method_id===m.old&&Array.isArray(value.inputs)&&value.inputs.length===m.arity,'known complete native policy descriptor required');
   if(profile===PROFILE){value.method_name=m.name;value.method_id=m.id;}
  }
  for(const nested of Object.values(value))if(typeof nested==='object')visit(nested);
 }
 visit(out);
 if(profile===PROFILE){out.native_protocol=PROFILE;out.sdk_commit='c92880c8b6e2c8d392f19368bc8801a2584fd427';out.client_commit='b280d714a8f0930c61962c885374ea63ea63d274';}
 return out;
}
