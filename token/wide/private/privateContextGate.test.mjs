// Gate boundary fixtures only. Real compiled bytecode/proofs are tested by the
// explicit selected-SDK acceptance suite, not synthesized by these objects.
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPrivateContext} from './privateContextGate.mjs';
const B=2**32,A=5*B;
function fixture(){
 const definitions=Array.from({length:86},(_,i)=>({data_type:0,index:i,op_type:0,inputs:[i]}));
 for(let i=0;i<4;i++)definitions.push({data_type:0,index:86+i,op_type:1,inputs:[8+i]});
 const resolution=definitions.length;definitions.push({data_type:5,index:0,op_type:55,inputs:[0]});
 for(let i=0;i<4;i++){
  definitions.push({data_type:0,index:90+i,op_type:20,inputs:[A,86+i]});
  definitions.push({data_type:1,index:i,op_type:13,inputs:[90+i,6+i]});
 }
 for(let i=0;i<3;i++)definitions.push({data_type:1,index:4+i,op_type:9,inputs:[B+(i===0?0:3+i),B+1+i]});
 definitions.push({data_type:1,index:7,op_type:2,inputs:[]});
 definitions.push({data_type:3,index:0,op_type:80,inputs:[]});
 return {name:'private_claim',circuit_inputs:Array.from({length:86},(_,i)=>i),
  state_commands:[{type:'GetGlobalStateRoots',checkpoint_id:10}],state_command_resolution_indices:[resolution],
  definitions,assertions:[{left:B+6,right:B+7,message:'all authenticated limbs'}]};
}
test('all four user-root limbs bind the exact checkpoint input and constrain assertions',()=>{
 assert.deepEqual(checkPrivateContext(fixture()).globalRootOffsets,[8,9,10,11]);
});
test('wrong checkpoint, global slice, missing assertions, duplicate roots and absent session root fail',()=>{
 for(const change of [
  d=>d.state_commands[0].checkpoint_id=11,
  d=>d.definitions.find(n=>n.op_type===1&&n.inputs[0]===8).inputs[0]=0,
  d=>d.definitions.find(n=>n.op_type===13).inputs[1]=7,
  d=>d.assertions=[{left:B+7,right:B+7}],
  d=>d.state_commands.push({type:'GetGlobalStateRoots',checkpoint_id:10}),
  d=>d.state_command_resolution_indices[0]++,
  d=>d.definitions=d.definitions.filter(n=>n.op_type!==80),
 ]){const d=fixture();change(d);assert.throws(()=>checkPrivateContext(d));}
});
