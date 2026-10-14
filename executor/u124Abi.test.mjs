import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateU124TokenAbi} from './u124Abi.mjs';
const original=JSON.parse(readFileSync(new URL('../token/wide/verification-2026-10-12/compiled-reviewed/compilation_artifact.json',import.meta.url))).abi;
test('U124 ABI rejects misplaced limbs, incompatible outbox layouts and wrong wire method shapes',()=>{
 assert.equal(validateU124TokenAbi(original),original);
 const mutate=[a=>a.contract.state_tree_height=32,a=>a.contract.state.find(f=>f.name==='balance').offset=1,a=>a.contract.state.find(f=>f.name==='balance').type.item.name='u64',a=>a.contract.state.find(f=>f.name==='other_user_info').offset++,a=>a.contract.state.find(f=>f.name==='other_user_info').type.length--,a=>a.contract.state.find(f=>f.name==='other_user_info').type.item_felt_size=2,a=>a.types.find(t=>t.name==='OtherUserInfo').fields[1].offset_within_parent=0,a=>a.types.find(t=>t.name==='OtherUserInfo').fields[0].type.length=1,a=>a.contract.methods.find(m=>m.name==='claim').input_felt_count=2,a=>a.contract.methods.find(m=>m.name==='transfer').inputs[1].type.length=1,a=>a.contract.methods.find(m=>m.name==='transfer').output_felt_count=1,a=>a.contract.methods[1].method_id=a.contract.methods[0].method_id,a=>a.contract.state.push(a.contract.state[0])];
 for(const change of mutate){const abi=structuredClone(original);change(abi);assert.throws(()=>validateU124TokenAbi(abi));}
});
