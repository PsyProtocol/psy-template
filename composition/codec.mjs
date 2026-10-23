// Intent/plan documents preserve the distinction between bounded JS metadata
// numbers and unsigned financial BigInts. Raw proof JSON uses the lossless
// protocol parser instead; never reserialize a compiled artifact with this.
import assert from 'node:assert/strict';
import {parseLosslessJson} from '../amm/u124/client.mjs';
export const encodeDocument=value=>JSON.stringify(value,(_k,v)=>{
 if(typeof v==='bigint'){assert.ok(v>=0n);return{$u:v.toString()};}
 if(typeof v==='number')assert.ok(Number.isSafeInteger(v)&&v>=0);
 return v;
},2)+'\n';
export const decodeDocument=text=>{assert.equal(typeof text,'string');assert.ok(Buffer.byteLength(text)<=2000000,'bounded intent/plan document');parseLosslessJson(text);return JSON.parse(text,(_k,v)=>{
 if(typeof v==='number')assert.ok(Number.isSafeInteger(v)&&v>=0,'unsafe metadata number');
 if(v&&typeof v==='object'&&Object.hasOwn(v,'$u')){assert.deepEqual(Object.keys(v),['$u']);assert.match(v.$u,/^(0|[1-9]\d*)$/);assert.ok(v.$u.length<=78);return BigInt(v.$u);}
 return v;
});};
