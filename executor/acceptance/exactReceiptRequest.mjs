// Multiple local send attempts may reference ONE immutable prepared UPS. Never
// pick a request by end leaf alone or silently accept different signed bytes.
import assert from'node:assert/strict';import{readFileSync,realpathSync}from'node:fs';import{join,dirname}from'node:path';import{originalReceiptRequest,insideCase}from'../../composition/acceptance/receiptRequestLocator.mjs';import{parseLosslessJson}from'../../amm/u124/client.mjs';import{sha256}from'../requestBinding.mjs';
const exact=p=>parseLosslessJson(readFileSync(p,'utf8'));
export function exactReceiptRequest(base,source,record,userId,index){
 const matches=index.get(record.taskId)??[];if(record.preflight||matches.length<=1)return originalReceiptRequest(base,source,record,userId,index);insideCase(base,source);assert.equal(record.status,'included');const first=matches[0].record,requests=[];
 for(const {path,record:r}of matches){insideCase(base,path);assert.equal(realpathSync(dirname(path)),realpathSync(dirname(source)));assert.deepEqual(r.scope,first.scope);assert.deepEqual(r.task,first.task);assert.equal(r.scope.vaultId,userId);assert.equal(r.proof.version,1n);assert.equal(r.proof.driverSha256,first.proof.driverSha256);assert.equal(r.proof.manifestSha256,first.proof.manifestSha256);const p=insideCase(base,join(r.proof.preparedDirectory,'request.json')),m=insideCase(base,join(r.proof.preparedDirectory,'prepared.json'));assert.equal(sha256(readFileSync(m)),r.proof.manifestSha256);assert.equal(sha256(readFileSync(p)),exact(m).requestSha256);requests.push(p);}
 const digest=sha256(readFileSync(requests[0]));assert.ok(requests.every(p=>sha256(readFileSync(p))===digest),'multiple different signed requests cannot be attributed to one receipt');return requests[0];
}
