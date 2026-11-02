import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalAuditNativeLayout} from './audit-native-layout.mjs';
const bytes=readFileSync(new URL('./audit-20261102/native-abi.json',import.meta.url));
test('exact audit source projects all Native state/type descriptors without method claims',()=>{
 const p=canonicalAuditNativeLayout(bytes),a=JSON.parse(bytes);assert.equal(p.contract.state_layout.field_count,8);assert.equal(p.contract.state_layout.slot_count,8594128984);assert.deepEqual(p.types,a.types);assert.equal(p.contract.methods,undefined);
 for(const[f,i]of p.contract.state_layout.fields.map((f,i)=>[f,i])){assert.equal(f.start_slot,a.contract.state[i].offset);assert.deepEqual(f.type,a.contract.state[i].type);}
});
test('different bytes, altered offsets/types or forged method declarations cannot select a layout',()=>{
 assert.throws(()=>canonicalAuditNativeLayout(Buffer.concat([bytes,Buffer.from('\n')])),/Exact frozen/);
 for(const change of [a=>a.contract.state[0].offset=1,a=>a.contract.state[3].type.length=1,a=>a.contract.state.pop(),a=>a.types=[],a=>a.contract.methods=[]]){const a=JSON.parse(bytes);change(a);assert.throws(()=>canonicalAuditNativeLayout(Buffer.from(JSON.stringify(a))),/Exact frozen/);}
});
