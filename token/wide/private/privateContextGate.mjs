// Structural artifact gate; full VM/CFC/UPS authentication is a separate test.
import assert from 'node:assert/strict';
const id=n=>BigInt(n.data_type)*(1n<<32n)+BigInt(n.index);
const refs=n=>{
 if([0,1,2,3,46,47,48,49,50,53,54,55,66,67,74,79,80,83,84].includes(n.op_type))return [];
 return (n.op_type===18?n.inputs.slice(1):n.inputs).map(BigInt);
};
export function checkPrivateContext(def){
 assert.equal(def.name,'private_claim');assert.equal(def.circuit_inputs.length,86);
 assert.equal(def.state_commands.length,def.state_command_resolution_indices.length);
 const roots=def.state_commands.map((c,i)=>({c,i})).filter(({c})=>c.type==='GetGlobalStateRoots');
 assert.equal(roots.length,1,'one authenticated checkpoint read required');
 assert.equal(BigInt(roots[0].c.checkpoint_id),BigInt(def.circuit_inputs[10]),'checkpoint must bind the actual ABI input');
 const map=new Map(def.definitions.map(n=>[id(n),n]));
 const constants=new Map(def.definitions.filter(n=>n.op_type===1).map(n=>[id(n),BigInt(n.inputs[0])]));
 const readers=def.definitions.filter(n=>n.op_type===55&&n.inputs.length===1&&n.inputs[0]===roots[0].i);
 assert.equal(readers.length,1,'unique checkpoint result reader required');
 const rootReader=readers[0],at=def.definitions.indexOf(rootReader);
 assert.equal(rootReader.data_type,5,'checkpoint result must be the complete state-root array');
 assert.equal(def.state_command_resolution_indices[roots[0].i],at,'checkpoint result timing differs');
 const reachable=new Set(),pending=def.assertions.flatMap(a=>[BigInt(a.left),BigInt(a.right)]);
 while(pending.length){const value=pending.pop();if(reachable.has(value))continue;reachable.add(value);const n=map.get(value);if(n)pending.push(...refs(n));}
 for(let limb=0;limb<4;limb++){
  const elements=def.definitions.filter(n=>n.op_type===20&&BigInt(n.inputs[0])===id(rootReader)&&constants.get(BigInt(n.inputs[1]))===BigInt(8+limb));
  assert.equal(elements.length,1,'each user-root limb must be read exactly once');
  const actual=id(elements[0]),approved=BigInt(def.circuit_inputs[6+limb]);
  const eq=def.definitions.filter(n=>n.op_type===13&&n.inputs.length===2&&
   ((BigInt(n.inputs[0])===actual&&BigInt(n.inputs[1])===approved)||(BigInt(n.inputs[1])===actual&&BigInt(n.inputs[0])===approved)));
  assert.equal(eq.length,1,'each supplied root limb must equal its authenticated checkpoint limb');
  assert.ok(reachable.has(id(eq[0])),'root comparison must constrain an actual assertion');
 }
 assert.equal(def.definitions.filter(n=>n.op_type===80).length,1,'one authenticated session proof root required');
 return {checkpointInput:10,userRootInputs:[6,7,8,9],globalRootOffsets:[8,9,10,11],assertedRootLimbs:4,sessionRootReads:1};
}
