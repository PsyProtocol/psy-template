import test from 'node:test';import assert from 'node:assert/strict';import {auditPairArtifact} from './pair-artifact.mjs';
const config={tokenId:42,nftId:41};
const constant=(index,value)=>({index,data_type:0,op_type:1,inputs:[value]});
const fixture=()=>({state_tree_height:31,circuit_definitions:[{name:'paired_read',definitions:[constant(1,42),constant(2,41),constant(3,31),constant(4,30),constant(5,0),constant(6,32)],state_commands:[{type:'GetSelfUserExternalContractStateSlotSingle',contract_id:1,contract_state_tree_height:3},{type:'GetOtherUserContractStateSlotSingle',contract_id:2,contract_state_tree_height:4},{type:'GetOtherUserContractStateSlotSingle',contract_id:5,contract_state_tree_height:6}]}]});
test('reviewed NFT, FT and native heights have independent compiler-output checks',()=>{assert.equal(auditPairArtifact('nftmarket',config,fixture()).foreignReadCommandsChecked,3);});
for(const name of ['swapped-nft-ft','native-height','unknown-contract','unresolved-height'])test(`reject ${name} before policy generation`,()=>{
 const a=fixture(),d=a.circuit_definitions[0];
 if(name==='swapped-nft-ft'){d.state_commands[0].contract_state_tree_height=4;d.state_commands[1].contract_state_tree_height=3;}
 if(name==='native-height')d.state_commands[2].contract_state_tree_height=3;
 if(name==='unknown-contract')d.definitions[0].inputs[0]=43;
 if(name==='unresolved-height')d.state_commands[0].contract_state_tree_height=999;
 assert.throws(()=>auditPairArtifact('nftmarket',config,a));
});
