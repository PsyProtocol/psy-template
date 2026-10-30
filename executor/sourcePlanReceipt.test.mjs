import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {SOURCE_PLAN_RECEIPT_PREFIX,validateSourcePlanReceipt,receiptFromNativeOutput,readReceiptBoundOutputs,readPublicBytes} from './sourcePlanReceipt.mjs';
import {losslessJson,parseLosslessJson} from '../amm/u124/client.mjs';import {sha256} from './requestBinding.mjs';
function fixture(){
 const profile='source-covered-producer-sealed-minimum-v1',inputs=Object.fromEntries(['review','snapshot','draw','policy','acceptedSeal'].map(n=>[n,'a'.repeat(64)]));
 const outputNames=['plan','source-pages','minimum-pages','queue'],outputs=Object.fromEntries(outputNames.map(n=>[n,sha256('{}\n')]));
 const expected={profile,binding:{historyRoot:'b'.repeat(64),inputs},outputNames};
 const receipt={schema:1,kind:'source-stream-plan-receipt-v1',profile,historyRoot:expected.binding.historyRoot,inputs,outputs,financialOperations:0,proofsGenerated:0,canSign:false,canBroadcast:false,finalityVerified:false,seedSecrecyAuthenticated:false,qualifiedRandomness:false};return {expected,receipt};
}
test('one exact native receipt binds every input and output and cannot upgrade authority',()=>{
 const {expected,receipt}=fixture(),line=SOURCE_PLAN_RECEIPT_PREFIX+losslessJson(receipt)+'\n';assert.equal(receiptFromNativeOutput('ordinary native log\n'+line,expected).receipt.canSign,false);
 for(const change of [r=>r.inputs.acceptedSeal='c'.repeat(64),r=>r.outputs.extra='c'.repeat(64),r=>delete r.outputs.queue,r=>r.historyRoot='c'.repeat(64),r=>r.profile='source-covered-producer-minimum-stream-v1',r=>r.schema=true,r=>r.financialOperations=false,r=>r.proofsGenerated='0',r=>r.finalityVerified=true,r=>r.canSign=true,r=>r.qualifiedRandomness=true,r=>r.seedSecrecyAuthenticated=true,r=>r.injectedVerifier='external']){
  const r=parseLosslessJson(losslessJson(receipt));change(r);assert.throws(()=>validateSourcePlanReceipt(r,expected));
 }
 for(const stdout of ['',line+line,'{"verificationPassed":true}\n'])assert.throws(()=>receiptFromNativeOutput(stdout,expected));
});
test('outputs are hashed and parsed once; replacement, symlink and oversized files reject',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'psy-plan-receipt-'));try{
  const {expected,receipt}=fixture();for(const name of expected.outputNames)await writeFile(join(dir,name+'.json'),'{}\n');
  const loaded=await readReceiptBoundOutputs(dir,receipt,expected);assert.deepEqual(Object.keys(loaded.values),expected.outputNames);
  await writeFile(join(dir,'queue.json'),'[]\n');await assert.rejects(readReceiptBoundOutputs(dir,receipt,expected),/differs from owned native receipt/);
  await assert.rejects(readPublicBytes(join(dir,'queue.json'),1),/bounded regular/);
  await rm(join(dir,'queue.json'));await symlink('plan.json',join(dir,'queue.json'));await assert.rejects(readReceiptBoundOutputs(dir,receipt,expected),/bounded regular/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
