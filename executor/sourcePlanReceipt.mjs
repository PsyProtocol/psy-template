// Byte integrity for an owned native planning process. Not a proof or authority.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {parseLosslessJson} from '../amm/u124/client.mjs';
import {sha256} from './requestBinding.mjs';
export const SOURCE_PLAN_RECEIPT_PREFIX='PSY_SOURCE_STREAM_RECEIPT ';
const limits={plan:1048576,'source-pages':67108864,'ordering-pages':67108864,'minimum-pages':67108864,queue:16777216};
const exact=(value,names)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),[...names].sort(),'exact native receipt fields required');};
export async function readPublicBytes(path,limit){
 const before=await lstat(path);assert.ok(before.isFile()&&before.size<=limit,'bounded regular public planning file required');
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const opened=await file.stat();assert.ok(opened.isFile());assert.equal(opened.dev,before.dev);assert.equal(opened.ino,before.ino);
  const chunks=[];let total=0;
  for(;;){const chunk=Buffer.alloc(Math.min(65536,limit+1-total));const {bytesRead}=await file.read(chunk,0,chunk.length,null);if(!bytesRead)break;total+=bytesRead;assert.ok(total<=limit,'public planning file limit');chunks.push(chunk.subarray(0,bytesRead));}
  const after=await lstat(path);assert.ok(after.isFile());assert.equal(after.dev,opened.dev);assert.equal(after.ino,opened.ino);return Buffer.concat(chunks,total);
 }finally{await file.close();}
}
export function validateSourcePlanReceipt(receipt,{profile,binding,outputNames}){
 exact(receipt,['schema','kind','profile','historyRoot','inputs','outputs','financialOperations','proofsGenerated','canSign','canBroadcast','finalityVerified','seedSecrecyAuthenticated','qualifiedRandomness']);
 assert.ok(receipt.schema===1||receipt.schema===1n,'numeric receipt schema required');assert.equal(receipt.kind,'source-stream-plan-receipt-v1');assert.equal(receipt.profile,profile);assert.equal(receipt.historyRoot,binding.historyRoot);
 exact(receipt.inputs,Object.keys(binding.inputs));for(const key of Object.keys(binding.inputs))assert.equal(receipt.inputs[key],binding.inputs[key],'native receipt input binding changed');
 exact(receipt.outputs,outputNames);for(const digest of Object.values(receipt.outputs))assert.match(digest,/^[a-f0-9]{64}$/);
 for(const key of ['canSign','canBroadcast','finalityVerified','seedSecrecyAuthenticated','qualifiedRandomness'])assert.equal(receipt[key],false,'native planning receipt cannot authorize '+key);
 for(const key of ['financialOperations','proofsGenerated'])assert.ok(receipt[key]===0||receipt[key]===0n,'numeric zero operation count required');
 return receipt;
}
export function receiptFromNativeOutput(stdout,expected){
 assert.equal(typeof stdout,'string','owned native stdout receipt required; no old-driver fallback');
 const lines=stdout.split('\n').filter(line=>line.startsWith(SOURCE_PLAN_RECEIPT_PREFIX));assert.equal(lines.length,1,'exactly one owned native receipt required');
 const text=lines[0].slice(SOURCE_PLAN_RECEIPT_PREFIX.length);assert.ok(Buffer.byteLength(text)<=16384,'bounded native receipt');
 return {text:text+'\n',receipt:validateSourcePlanReceipt(parseLosslessJson(text),expected)};
}
export async function readReceiptBoundOutputs(directory,receipt,expected){
 validateSourcePlanReceipt(receipt,expected);const outputs={},values={};
 for(const name of expected.outputNames){
  assert.ok(Object.hasOwn(limits,name),'reviewed planning output name required');
  const bytes=await readPublicBytes(join(directory,name+'.json'),limits[name]);
  outputs[name]=sha256(bytes);assert.equal(outputs[name],receipt.outputs[name],'prepared plan changed or differs from owned native receipt');
  // Parse the same bytes just hashed; never validate one read and pin another.
  values[name]=parseLosslessJson(bytes.toString('utf8'));
 }
 return {outputs,values};
}
