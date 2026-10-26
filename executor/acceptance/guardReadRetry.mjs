// A bounded exact-proof retry after a native PRE-WIRE read failure only.
// Never recognizes HTTP broadcast failures, unknown sends or logical rejection.
import assert from 'node:assert/strict';import {readFileSync,readdirSync,realpathSync} from 'node:fs';import {join,resolve} from 'node:path';import {sha256} from '../requestBinding.mjs';
export function guardReadRetry(records,taskId,{base,driverSha256,urls}){
 const last=records.at(-1);if(last?.taskId!==taskId||last.status!=='not-submitted')return null;
 const intent=records.findLast(r=>r.taskId===taskId&&r.status==='broadcast-intent');if(!intent)return null;
 const p=intent.proof,inside=file=>{const actual=realpathSync(file);assert.ok(actual.startsWith(realpathSync(base)+'/'),'proof retry path escape');return actual;};
 assert.equal(p.version,1);assert.equal(p.driverSha256,driverSha256);const out=inside(p.submissionDirectory);
 if(JSON.stringify(readdirSync(out).sort())!==JSON.stringify(['failure.json']))return null;
 const failureBytes=readFileSync(join(out,'failure.json')),f=JSON.parse(failureBytes);
 if(f.ok!==false||f.automaticRetry!==false||f.broadcastMayHaveBeenAttempted!==false||f.phase!=='check-prepared-live-state'||f.reason!==last.reason)return null;
 const eof=f.reason==='Failed to parse JSON response: EOF while parsing a value at line 1 column 0';
 const transport=urls.some(url=>['Connection error','Request error'].some(label=>f.reason.startsWith(label+' to '+url.replace(/\/$/,'')+': error sending request for url ('+new URL(url).href+')')));
 if(!eof&&!transport)return null;
 const prepared=inside(p.preparedDirectory),mb=readFileSync(join(prepared,'prepared.json')),m=JSON.parse(mb),rb=readFileSync(join(prepared,'request.json'));assert.equal(sha256(mb),p.manifestSha256);assert.equal(sha256(rb),m.requestSha256);
 const pre=JSON.parse(readFileSync(join(prepared,'preflight.json')));assert.equal(pre.fullUpsVerified,true);assert.equal(pre.exactStackAndSessionVerified,true);assert.equal(pre.broadcast,false);
 return{taskId,proof:p,requestSha256:m.requestSha256,failureSha256:sha256(failureBytes),originalTask:intent.task,financialBroadcastRetried:false,reproved:false,expiryExtended:false};
}
