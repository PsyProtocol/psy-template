import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {publishFile} from '../../executor/durableFile.mjs';import {losslessJson} from '../../amm/u124/client.mjs';
function identity(r){
 assert.equal(r.coordinatorMappingVerified,true);assert.equal(r.indexedReceiptVerified,true);assert.ok(Number.isSafeInteger(r.marketId)&&r.marketId>=5&&r.marketId<16777216);assert.ok(Number.isSafeInteger(r.vaultId)&&r.vaultId>0&&r.vaultId<16777216);
 for(const key of ['publicKeyHash','fingerprint','publicKeyParam'])assert.match(r[key],/^[0-9a-f]{64}$/);
 const d=r.receipt.data,e=r.event;assert.equal(r.receipt.success,true);assert.equal(d.status,'included');assert.equal(d.result.user_id,r.vaultId);assert.equal(d.result.public_key,r.publicKeyHash);assert.equal(e.result.user_id,r.vaultId);assert.equal(e.result.public_key,r.publicKeyHash);assert.equal(e.owner_user_id,r.vaultId);assert.equal(e.content_hash,d.content_hash);assert.match(d.content_hash,/^[0-9a-f]{64}$/);assert.ok(Number.isSafeInteger(d.included_checkpoint_id)&&d.included_checkpoint_id>0);assert.equal(e.included_checkpoint_id,d.included_checkpoint_id);assert.ok(Array.isArray(r.contracts)&&r.contracts.length>0);
 return {marketId:r.marketId,vaultId:r.vaultId,admissionMode:r.admissionMode??'single-v1',publicKeyHash:r.publicKeyHash,fingerprint:r.fingerprint,publicKeyParam:r.publicKeyParam,contracts:r.contracts,contentHash:d.content_hash,includedCheckpoint:d.included_checkpoint_id};
}
// The first fully published included record is canonical. A read-only restart
// may observe a later checkpoint, but never rewrites that original record.
export async function publishRegistration({includedPath,livePath,registration},publish=publishFile){
 const expected=identity(registration),candidate=losslessJson(registration)+'\n';
 let text;try{text=await readFile(includedPath,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;try{await publish(includedPath,candidate);}catch(error){if(error.code!=='EEXIST')throw error;}text=await readFile(includedPath,'utf8');}
 const canonical=JSON.parse(text);assert.deepEqual(identity(canonical),expected,'saved registration identity or binding changed');
 let existing;try{existing=await readFile(livePath,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;try{await publish(livePath,text);}catch(error){if(error.code!=='EEXIST')throw error;}existing=await readFile(livePath,'utf8');}
 assert.equal(existing,text,'live registration differs from canonical included record');return canonical;
}
