import test from 'node:test';
import assert from 'node:assert/strict';
import {editingKey,serializeEditingForm,hydrateEditingForm,EDITING_FIELDS} from '../src/markets/editingDrafts.mjs';
const f={pool:'2485',amountA:'4.611686018427387921',amountB:'',receiver:'12345',slippageBps:'50',feeCap:'5'};
test('editing record preserves exact unfinished strings without a quote or authorization',()=>{
 const raw=serializeEditingForm('add',f),v=JSON.parse(raw);
 assert.equal(v.financialAuthorization,false);
 assert.equal(v.source,'local-editing-preference');
 assert.deepEqual(hydrateEditingForm(raw,'add'),f);
 assert.equal(Object.hasOwn(v,'nonce'),false);
 assert.deepEqual(hydrateEditingForm(serializeEditingForm('add',{...f,amountA:'1.'}),'add'),{...f,amountA:'1.'});
});
test('editing scopes, versions, unsafe fields, shape and resource limits fail closed',()=>{
 const raw=serializeEditingForm('add',f);
 for(const extra of ['nonce','balance','proof','privateKey','financialAuthorization','quote'])
  assert.throws(()=>serializeEditingForm('add',{...f,[extra]:'1'}));
 for(const mutate of [v=>v.schema=2,v=>v.financialAuthorization=true,v=>v.source='rpc-observed',v=>v.form.pool='9999',v=>v.form.feeCap='1'.repeat(129)]) {
  const v=JSON.parse(raw);mutate(v);assert.throws(()=>hydrateEditingForm(JSON.stringify(v),'add'));
 }
 assert.throws(()=>hydrateEditingForm(raw,'remove'));
 assert.throws(()=>hydrateEditingForm('not json','add'));
 assert.throws(()=>hydrateEditingForm(' '.repeat(8193),'add'));
 assert.throws(()=>editingKey('__proto__'));
});
test('each form has an independent versioned key and schema',()=>{
 const keys=Object.keys(EDITING_FIELDS).map(editingKey);
 assert.equal(new Set(keys).size,7);
 assert(keys.every(k=>k.startsWith('psy.markets.editing.v1.')));
});
