// Remove JSON whitespace without parsing numbers through JS Number or changing
// any string/numeric token. This does not sign, broadcast or authorize retries.
import assert from 'node:assert/strict';
import {parseLosslessJson} from '../amm/u124/client.mjs';
export function compactExactJson(bytes){
 const source=Buffer.isBuffer(bytes)?bytes.toString('utf8'):bytes;assert.equal(typeof source,'string');
 if(Buffer.isBuffer(bytes))assert.ok(Buffer.from(source,'utf8').equals(bytes),'invalid UTF-8 request');
 const parsed=parseLosslessJson(source);let quoted=false,escaped=false,result='';
 for(const c of source){
  if(quoted){result+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}
  else if(c==='"'){quoted=true;result+=c;}
  else if(![' ','\t','\r','\n'].includes(c))result+=c;
 }
 assert.equal(quoted,false);assert.deepEqual(parseLosslessJson(result),parsed);
 return Buffer.from(result,'utf8');
}
export function userEndCapWire(requestBytes){
 const exact=compactExactJson(requestBytes);
 return Buffer.concat([Buffer.from('{"jsonrpc":"2.0","id":1,"method":"psy_submit_user_end_cap","params":'),exact,Buffer.from('}')]);
}
