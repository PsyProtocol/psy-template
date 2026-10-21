// Read-only tail interval: the mid-LP fixed snapshot through the maximum
// stage's pre-order snapshot. This does NOT include earlier LP order/start fees.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {save,read} from '../../batching/admission/liveSupport.mjs';
import {ExecutionJournal} from '../journal.mjs';
const [base,output]=process.argv.slice(2);
assert.ok(existsSync(join(base,'public/liquidity-complete-v1.json')),'LP must finish');
const exact=path=>parseLosslessJson(readFileSync(path,'utf8'));
const before=exact(join(base,'public/nft-inventory-audit-before-maximum-v1.json'));
const after=exact(join(base,'public/maximum-assets-pre-orders.json'));
assert.deepEqual(Object.keys(before.accounts).sort(),Object.keys(after.accounts).sort());
assert.ok(after.checkpoint>before.checkpoint);
for(const asset of [2464,2466]){assert.equal(before.totals[asset],1000n*10n**18n);assert.equal(after.totals[asset],before.totals[asset]);}
assert.equal(before.nftTotal,2n);assert.equal(after.nftTotal,2n);
assert.equal(before.nftPending.length,0);assert.equal(after.nftPending.length,0);
assert.deepEqual(after.nfts,before.nfts);
const included=[],seen=new Set();
function add(result,source){
 const cp=BigInt(result.checkpoint);if(cp<=before.checkpoint||cp>after.checkpoint)return;
 const receipt=result.receipt.data;
 assert.equal(receipt.status,'included');assert.equal(receipt.content_hash,result.contentHash);
 assert.equal(BigInt(receipt.included_checkpoint_id),cp);
 assert.ok(!seen.has(result.contentHash),'duplicate interval identity');seen.add(result.contentHash);
 included.push({source,contentHash:result.contentHash,checkpoint:cp,fee:BigInt(receipt.result.fees_collected)});
}
for(const name of readdirSync(join(base,'attempts'))){const path=join(base,'attempts',name,'included.json');if(existsSync(path))add(read(path),'attempts/'+name+'/included.json');}
const o=read(join(base,'public/liquidity-amm-executor/executor.json'));
const journal=new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,vaultId:o.vaultId,fingerprint:o.fingerprint});
for(const record of(await journal.records()).filter(r=>r.status==='included'))add(record.result,'LP journal/'+record.taskId);
assert.equal(included.length,4,'expected seal, commit sponsorship, commitment and settlement only');
const fees=included.reduce((total,r)=>total+r.fee,0n);
assert.equal(before.nativeTotal-after.nativeTotal,fees,'closed cohort native decrease must equal included fees');
save(output,{checkedAt:new Date().toISOString(),scope:'live LP tail only: fixed mid-LP checkpoint through next stage pre-orders; excludes earlier LP order/start/admit fees',beforeCheckpoint:before.checkpoint,afterCheckpoint:after.checkpoint,included,fees,qaFtTotalsConserved:true,qaNftIdentityUnchanged:true,nativeBefore:before.nativeTotal,nativeAfter:after.nativeTotal,originalsChanged:false});
console.log(JSON.stringify({scope:'LP tail interval, not total LP cost',transactions:included.length,fees:String(fees)}));
