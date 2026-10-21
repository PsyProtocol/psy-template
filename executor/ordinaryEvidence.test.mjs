import test from'node:test';import assert from'node:assert/strict';
import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{createHash}from'node:crypto';
import{ordinaryEvidenceDirectory}from'./acceptance/ordinaryEvidence.mjs';
function fixture(fn){const base=mkdtempSync(join(tmpdir(),'psy-ordinary-evidence-'));try{
 const original='maximum-dave-consent',replacement=original+'-recovery-v2';
 for(const p of ['public/ordinary-recoveries','attempts/'+original,'attempts/'+replacement])mkdirSync(join(base,p),{recursive:true});
 const put=(p,v)=>writeFileSync(join(base,p),JSON.stringify(v)),sha=p=>createHash('sha256').update(readFileSync(join(base,p))).digest('hex');
 const input={calls:{contract_calls:[{contract_id:100,method_name:'request_admission',inputs:[1,120]}],software_defined_call:{inputs:[]}},contracts:[{contract:{contractId:100,codeRoot:'a'.repeat(64)}}],validUntilCheckpoint:128};
 put('public/'+original+'.json',input);put('public/'+replacement+'.json',{...input,validUntilCheckpoint:200});
 const core={state_transition:{user_id:2,end_user_leaf_hash:'b'.repeat(64)},new_user_leaf:{user_id:2,nonce:3}};
 put('attempts/'+replacement+'/request.json',{user_ec_input:{core},proof:[1]});put('attempts/'+replacement+'/intent.json',{userId:2,nonce:3,endUserLeafHash:'b'.repeat(64)});
 const preflight={fullUpsVerified:true,broadcast:false,userId:2,nonce:3,inputSha256:sha('public/'+replacement+'.json'),endUserLeafHash:'b'.repeat(64),core};
 put('attempts/'+replacement+'/included.json',{userId:2,checkpoint:10,commonCheckpoint:10,endUserLeafHash:'b'.repeat(64),contentHash:'c'.repeat(64),receipt:{success:true,data:{owner_user_id:2,status:'included',included_checkpoint_id:10,content_hash:'c'.repeat(64)}},preflight});
 const record={version:1,originalLabel:original,replacementLabel:replacement,userId:2,originalInputSha256:sha('public/'+original+'.json'),replacementInputSha256:sha('public/'+replacement+'.json'),receiptSha256:sha('attempts/'+replacement+'/included.json'),requestSha256:sha('attempts/'+replacement+'/request.json')};
 const recordFile='public/ordinary-recoveries/'+original+'.json';put(recordFile,record);fn({base,original,replacement,put,sha,record,recordFile});
 }finally{rmSync(base,{recursive:true,force:true});}}
test('explicit replacement retains original empty attempt and requires exact included identity',()=>fixture(x=>{
 assert.equal(ordinaryEvidenceDirectory(x.base,x.original,2),join(x.base,'attempts',x.replacement));assert.equal(ordinaryEvidenceDirectory(x.base,'another-task'),join(x.base,'attempts/another-task'));
 assert.throws(()=>ordinaryEvidenceDirectory(x.base,x.original,3),/another actor/);
}));
test('an original proof or request cannot be silently superseded by a replacement',()=>fixture(x=>{
 x.put('attempts/'+x.original+'/request.json',{});assert.throws(()=>ordinaryEvidenceDirectory(x.base,x.original,2),/manual reconciliation/);
}));
test('replacement cannot change business calls even if its input checksum is updated',()=>fixture(x=>{
 const path='public/'+x.replacement+'.json',value=JSON.parse(readFileSync(join(x.base,path),'utf8'));value.calls.contract_calls[0].inputs[0]=9;x.put(path,value);x.record.replacementInputSha256=x.sha(path);x.put(x.recordFile,x.record);
 assert.throws(()=>ordinaryEvidenceDirectory(x.base,x.original,2),/business calls differ/);
}));
test('receipt substitution and path escape fail before a caller skips its task',()=>fixture(x=>{
 x.put('attempts/'+x.replacement+'/included.json',{});assert.throws(()=>ordinaryEvidenceDirectory(x.base,x.original,2),/evidence changed/);
 x.record.replacementLabel='../other';x.put(x.recordFile,x.record);assert.throws(()=>ordinaryEvidenceDirectory(x.base,x.original,2));
}));
