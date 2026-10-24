// Saved wire evidence is an attempted transport, never proof of remote receipt.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {sha256} from '../requestBinding.mjs';
export function transportEvidence(base,actual) {
 const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.name==='.secrets'||e.name==='drivers')return[];assert.ok(!e.isSymbolicLink());const p=join(dir,e.name);return e.isDirectory()?walk(p):[p];});
 const hashes=new Set(actual.map(a=>a.requestSha256)),attempts=[];
 for(const wire of walk(base).filter(p=>p.endsWith('/rpc-request.json'))){const dir=dirname(wire),request=join(dir,'request.json');if(!existsSync(request))continue;const digest=sha256(readFileSync(request));if(!hashes.has(digest))continue;
  let meta=null,body=null;try{meta=JSON.parse(readFileSync(join(dir,'rpc-response-meta.json'),'utf8'));body=JSON.parse(readFileSync(join(dir,'rpc-response.body'),'utf8'));}catch{}
  const acknowledged=meta?.httpStatus>=200&&meta.httpStatus<300&&meta.truncated===false&&body?.jsonrpc==='2.0'&&body.id===1&&!Object.hasOwn(body,'error')&&(body.result==='ok'||typeof body.result==='string'&&/^[0-9a-f]{64}$/i.test(body.result));
  attempts.push({directory:dir,requestSha256:digest,wireSha256:sha256(readFileSync(wire)),acknowledged:!!acknowledged,remoteInclusionProvenByThisAttempt:false});
 }
 const groups=[...new Set(attempts.map(a=>a.requestSha256))].map(d=>{const rows=attempts.filter(a=>a.requestSha256===d);return{requestSha256:d,attempts:rows.length,sameWireBytes:new Set(rows.map(r=>r.wireSha256)).size===1};});
 return{attempts,distinctSignedRequests:groups.length,exactSignedRequestRetransmissions:groups.reduce((n,g)=>n+g.attempts-1,0),acknowledged:attempts.filter(a=>a.acknowledged).length,ambiguousOrRejected:attempts.filter(a=>!a.acknowledged).length,groups,scope:'local durable wire records, including deliberate exact-request retransmission; not evidence each HTTP request reached server, not duplicate fills, indexed receipts audited independently'};
}
