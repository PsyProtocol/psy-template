import assert from 'node:assert/strict';
export const METHOD_INPUTS=Object.freeze({set_metadata:2,set_extended_metadata:7,set_max_supply:2,mint:2,mint_to:3,burn:2,settle_burn:1,set_mint_authority:1,renounce_mint_authority:0,transfer:3,claim:1,cancel_unclaimed_payment:1,refund_claimed_payment:3,batch_transfer_2:6,batch_transfer_5:15,open_delegation_channel:4,spend_delegation:5,request_revoke_delegation:1,close_delegation_channel:3,finalize_revoke_delegation:2});
export function checkWideTokenArtifact(artifact){
 const abi=artifact.abi.contract,methods=abi.methods,definitions=artifact.circuit_definitions;
 assert.deepEqual(methods.map(m=>m.name).sort(),Object.keys(METHOD_INPUTS).sort());assert.equal(definitions.length,20);
 for(const method of methods){assert.equal(method.input_felt_count,METHOD_INPUTS[method.name],method.name+' ABI');const def=definitions.find(d=>d.name===method.name);assert.equal(def.circuit_inputs.length,method.input_felt_count,method.name+' IR');}
 const fields=new Map(abi.state.map(f=>[f.name,f]));
 for(const name of ['balance','total_minted','total_supply','max_supply','burn_requested']){const f=fields.get(name);assert.equal(f.felt_size,2,name);assert.equal(f.type.length,2,name);}
 for(const[name,stride]of [['other_user_info',4],['delegations',5],['delegation_spends',4],['burn_settled',2]])assert.equal(fields.get(name).type.item_felt_size,stride,name+' stride');
 assert.ok(artifact.state_tree_height<=32&&artifact.state_tree_height>=1);
 const slots=abi.state.reduce((n,f)=>Math.max(n,f.offset+f.felt_size),0);assert.ok(slots<=2**artifact.state_tree_height);
 return {valid:true,methods:20,fields:abi.state.length,slots,stateTreeHeight:artifact.state_tree_height,amountBits:124,limbBits:62,deploymentReady:false};
}
