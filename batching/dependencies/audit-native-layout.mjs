// Canonical state-layout projection of one exact source ABI, not a runtime ABI
// fallback. Every endpoint is still checked by bind_native_artifact and the UPS.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const freeze=JSON.parse(readFileSync(new URL('./audit-20261102/manifest.json',import.meta.url)));
const expected=freeze.sourcePins.find(p=>p.path==='psy-sdk/psy-genesis').sourceFiles['genesis_abi/PsyTokenContract.json'];
const width=t=>{
 if(t.kind==='primitive'){assert.ok(['Felt','Hash'].includes(t.name),'reviewed Native primitive');return t.name==='Hash'?4:1;}
 if(t.kind==='array'){assert.ok(Number.isSafeInteger(t.length)&&t.length>0&&Number.isSafeInteger(t.item_felt_size)&&t.item_felt_size>0);return t.length*t.item_felt_size;}
 assert.equal(t.kind,'map');assert.equal(t.map_kind,'map');assert.equal(t.value_felt_size,4);assert.equal(t.alignment_felts,4);assert.ok(Number.isSafeInteger(t.capacity)&&t.capacity>0);return t.capacity*t.value_felt_size;
};
export function canonicalAuditNativeLayout(bytes){
 assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,'Exact frozen audit Native ABI bytes required');
 const abi=JSON.parse(bytes),state=abi.contract.state;assert.equal(abi.contract.state_tree_height,32);assert.equal(abi.contract.name,'PsyTokenContract');
 assert.deepEqual(state.map(f=>f.name),['balance','reserved_1','reserved_2','other_user_info','note_count','note_root','last_path','state_map']);
 let end=0;const fields=state.map((f,i)=>{const count=width(f.type);assert.ok(Number.isSafeInteger(count)&&count>0);assert.equal(f.offset,end,'contiguous source state offsets required');end+=count;assert.ok(Number.isSafeInteger(end));return{field_id:i+1,name:f.name,type:f.type,start_slot:f.offset,payload_offset:0,slot_count:count};});
 assert.equal(end,8594128984);return{contract:{state_tree_height:32,state_layout:{layout_version:1,encoding_version:1,field_count:fields.length,slot_count:end,fields}},types:abi.types};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4,'FROZEN_NATIVE_ABI FRESH_CANONICAL_LAYOUT_ABI');
 writeFileSync(process.argv[3],JSON.stringify(canonicalAuditNativeLayout(readFileSync(process.argv[2])),null,2)+'\n',{flag:'wx'});
}
