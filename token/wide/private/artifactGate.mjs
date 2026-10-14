import assert from 'node:assert/strict';
import {METHOD_INPUTS,checkWideTokenArtifact} from '../artifactGate.mjs';
import {NOTE_ROOT_SLOTS,STATE_TREE_HEIGHT,PRIVATE_FINGERPRINT} from './constants.mjs';
export const PRIVATE_METHOD_INPUTS=Object.freeze({...METHOD_INPUTS,private_transfer:14,private_claim:151});
export function checkPrivateTokenArtifact(artifact,{fingerprint}={}){
 const abi=artifact.abi.contract,definitions=artifact.circuit_definitions;
 assert.deepEqual(abi.methods.map(m=>m.name).sort(),Object.keys(PRIVATE_METHOD_INPUTS).sort());
 assert.equal(definitions.length,22);
 for(const m of abi.methods){assert.equal(m.input_felt_count,PRIVATE_METHOD_INPUTS[m.name],m.name);assert.equal(definitions.find(d=>d.name===m.name)?.circuit_inputs.length,m.input_felt_count);}
 // Check all the public amount types/strides using the original public gate.
 checkWideTokenArtifact({...artifact,abi:{...artifact.abi,contract:{...abi,methods:abi.methods.filter(m=>m.name in METHOD_INPUTS)}},circuit_definitions:definitions.filter(d=>d.name in METHOD_INPUTS)});
 assert.equal(artifact.state_tree_height,STATE_TREE_HEIGHT);
 const fields=new Map(abi.state.map(f=>[f.name,f]));
 for(const [i,name] of ['low','high'].entries()){
  const root=fields.get('private_note_root_'+name);assert.equal(root.felt_size,4);assert.equal(root.offset,NOTE_ROOT_SLOTS[i]*4);
  const path=fields.get('private_last_path_'+name);assert.equal(path.type.length,20);assert.equal(path.type.item_felt_size,4);
 }
 assert.equal(fields.get('private_nullifiers').type.capacity,1048576);
 if(fingerprint)assert.deepEqual(fingerprint.map(String),PRIVATE_FINGERPRINT);
 const claim=definitions.find(d=>d.name==='private_claim');
 assert.ok(claim.definitions.some(d=>d.op_type===80), 'claim must read the authenticated session root');
 assert.ok(claim.state_commands.some(c=>c.type==='GetGlobalStateRoots'), 'claim must read the checkpoint root');
 return {valid:true,methods:22,amountBits:124,stateTreeHeight:32,noteRootSlots:[...NOTE_ROOT_SLOTS],verifierFingerprintMatched:Boolean(fingerprint),newDeploymentRequired:true,deploymentReady:false};
}
