// Independent, offline full-proof/receipt/accounting audit. Never broadcasts.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {sha256} from '../requestBinding.mjs';
import {save} from '../../batching/admission/liveSupport.mjs';
import {indexBroadcastIntents,insideCase} from '../../composition/acceptance/receiptRequestLocator.mjs';
import {exactReceiptRequest} from './exactReceiptRequest.mjs';
const [base,selection,original,out]=process.argv.slice(2);assert.ok(out);
const exact=p=>parseLosslessJson(readFileSync(p,'utf8'));
const done=exact(join(base,'public',selection+'-COMPLETE.json')),round=join(base,done.roundTag);
assert.equal(done.fills,1n);assert.equal(done.ordinaryClaimsIncluded,true);
const verifier=JSON.parse(readFileSync(join(original,'public/TOOLS-v2.json'),'utf8')).binaries.verifier;
assert.equal(sha256(readFileSync(verifier.file)),verifier.sha256);mkdirSync(out);
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
 if(['.secrets','drivers'].includes(e.name))return[];assert.ok(!e.isSymbolicLink());const p=join(dir,e.name);return e.isDirectory()?walk(p):[p];
});
const index=indexBroadcastIntents(round),receipts=new Map(),proofs=new Map();
for(const source of walk(round).filter(p=>p.endsWith('/included.json')||/\d+-included\.json$/.test(p))){
 const raw=exact(source),r=raw.result?.receipt?raw.result:raw;if(r.status!=='included'||!r.receipt?.data?.result?.fees_collected)continue;
 assert.equal(r.receipt.data.status,'included');assert.equal(r.contentHash,r.receipt.data.content_hash);
 if(receipts.has(r.contentHash)){assert.deepEqual(receipts.get(r.contentHash).r,r);continue;}
 receipts.set(r.contentHash,{r,raw,source});
}
const actual=[];
for(const [contentHash,{r,raw,source}]of receipts){
 const request=exactReceiptRequest(round,source,raw,r.userId,index),bytes=readFileSync(request),digest=sha256(bytes),q=exact(request),core=q.user_ec_input.core;
 if(!proofs.has(digest)){
  const report=join(out,digest+'.json'),start=performance.now();const result=await promisify(execFile)(verifier.file,[insideCase(round,request),report],{timeout:120000,maxBuffer:2000000,env:{...process.env,RAYON_NUM_THREADS:'2'}});
  writeFileSync(report+'.log',result.stdout+'\n'+result.stderr,{flag:'wx'});
  const v=exact(report);assert.equal(v.fullProofVerifiedAgainstPinnedNodeKeyAndCommon,true);assert.equal(v.metadataEndpointsAndFeesVerified,true);assert.equal(v.requestSha256,digest);assert.equal(v.publicKeyHash,core.new_user_leaf.public_key);assert.equal(v.nonce,core.new_user_leaf.nonce);
  proofs.set(digest,{verificationMilliseconds:Math.round(performance.now()-start),report});
 }
 assert.equal(core.new_user_leaf.user_id,r.userId);assert.equal(core.state_transition.end_user_leaf_hash,r.endUserLeafHash);assert.equal(r.receipt.data.owner_user_id,r.userId);assert.equal(r.receipt.data.included_checkpoint_id,r.checkpoint);
 const fee=core.stats.guta_fees_collected+core.stats.da_fees_collected;assert.equal(fee,r.receipt.data.result.fees_collected);
 for(const field of ['slots_modified','total_transactions','user_ops_processed'])assert.equal(core.stats[field],r.receipt.data.result[field]);
 actual.push({contentHash,source,request,requestSha256:digest,userId:r.userId,nonce:core.new_user_leaf.nonce,start:core.state_transition.start_user_leaf_hash,end:r.endUserLeafHash,checkpoint:r.checkpoint,fee,...proofs.get(digest)});
}
assert.equal(actual.length,17,'11 ordinary UPSs plus six market UPSs');
const before=exact(join(round,'public/assets-before.json')),after=exact(join(round,'public/assets-after.json'));
for(const user of new Set(actual.map(r=>r.userId))){const rows=actual.filter(r=>r.userId===user).sort((a,b)=>a.nonce<b.nonce?-1:1);for(let i=1;i<rows.length;i++){assert.equal(rows[i].nonce,rows[i-1].nonce+1n);assert.equal(rows[i].start,rows[i-1].end);}}
const totalFees=actual.reduce((n,r)=>n+r.fee,0n);assert.equal(before.nativeTotal-after.nativeTotal,totalFees);
const u='1717440',b='406720',unit=10n**18n;
for(const asset of [2483,2484]){
 assert.equal(before.totals[asset],1000n*unit);assert.equal(after.totals[asset],before.totals[asset]);
 for(const [id,row]of Object.entries(before.accounts))assert.equal(after.accounts[id].ft[asset]-row.ft[asset],id===u?(asset===2483?-unit:unit):id===b?(asset===2483?unit:-unit):0n);
}
for(const row of after.pending)if((row.sender===662720n&&[1717440n,406720n].includes(row.recipient))||(row.recipient===662720n&&[1717440n,406720n].includes(row.sender)))for(const asset of [2483,2484])assert.equal(row.ft[asset],0n,'market/user FT outboxes clear');
assert.deepEqual(after.nfts,before.nfts);assert.deepEqual(after.nftPending,before.nftPending);
save(join(out,'SUMMARY.json'),{at:new Date().toISOString(),selection,round:done.roundTag,fills:1,actualUps:actual.length,uniqueFullProofs:proofs.size,totalFees,actual,ordinaryClaimsVerified:true,ftAndNativeConservationVerified:true,nftUnchanged:true,nonceAndStateChainsVerified:true,fullProofAccountingPending:false,scope:'one actual paired Book cohort; native verifier checks all signed requests against the fixed Node key/common data; does not attest deployed server binaries'});
