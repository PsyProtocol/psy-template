// Seal completed acceptance evidence without submitting or changing runtime.
import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {ExecutionJournal} from '../journal.mjs';
const operation=resolve(process.argv[2]??'executor/operations/staging-2026-10-11');
const output=resolve(process.argv[3]??'executor/verification/2026-10-11-live');
const hash=data=>createHash('sha256').update(data).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const save=(name,data)=>writeFile(join(output,name),JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
const result=await json(join(operation,'acceptance/result.json'));
assert.equal(result.status,'passed');assert.equal(result.ordinaryWalletTransactions,31);
assert.equal(result.publicSettlements,7);assert.equal(result.crashTested,true);
const status=await json(join(operation,'runtime/status.json'));
assert.equal(status.mode,'watch');assert.equal(status.vaults.length,3);
assert.ok(Date.now()-Date.parse(status.updatedAt)<30000,'service heartbeat stale');
assert.ok(status.vaults.every(x=>['idle','scanning','reconciling'].includes(x.status)),'worker is not healthy');
const release=await json(join(operation,'release-manifest-v2.json'));
for(const [name,digest] of Object.entries(release.files))assert.equal(hash(await readFile(join(operation,name))),digest,'release changed: '+name);
assert.equal(hash(await readFile('/Users/geir/Library/LaunchAgents/xyz.psy.executor.staging.plist')),release.files[release.launchAgent]);
const original=await json(join(operation,'release-manifest.json'));
assert.equal(hash(await readFile(join(operation,'release-manifest.json'))),release.parentManifestSha256);
for(const [name,digest] of Object.entries(original.files))assert.equal(hash(await readFile(join(operation,name))),digest,'original release changed: '+name);
const histories=[];
for(const name of ['amm','orderbook','bondingcurve']){
 const config=await json(join(operation,name+'.json'));
 const journal=new ExecutionJournal({directory:config.runtimeDirectory,network:config.network,vaultId:config.vaultId,fingerprint:config.fingerprint});
 const records=await journal.records();assert.equal((await journal.unresolved()).length,0);
 const included=records.filter(x=>x.status==='included');
 assert.equal(new Set(included.map(x=>x.taskId)).size,included.length);
 for(const event of included){
  assert.equal(records.filter(x=>x.taskId===event.taskId&&x.status==='broadcast-intent').length,1);
  assert.equal(event.result.userId,config.vaultId);assert.equal(event.result.receipt.data.status,'included');
  assert.equal(event.result.receipt.data.content_hash,event.result.contentHash);
  assert.equal(event.result.receipt.data.included_checkpoint_id,event.result.checkpoint);
 }
 histories.push({kind:name,vaultId:config.vaultId,records,included:included.length});
}
assert.deepEqual(histories.map(x=>x.included),[5,2,0]);
const crash=await json(join(operation,'acceptance/controlled-service-crash.json'));
const crashEvents=histories[0].records.filter(x=>x.taskId===crash.taskId);
assert.equal(crashEvents.filter(x=>x.status==='broadcast-intent').length,1);
assert.equal(crashEvents.filter(x=>x.status==='broadcast-result').length,0,'test must recover without the parent result record');
assert.equal(crashEvents.filter(x=>x.status==='included').length,1);
assert.ok(Date.parse(status.startedAt)>=Date.parse(crash.time),'service must have restarted after the injected crash');
const before=await json(join(operation,'acceptance/balances-before.json'));
const after=await json(join(operation,'acceptance/balances-after.json'));
assert.equal(after.pending.length,0);assert.equal(before.pending.length,0);
assert.equal(after.totals.pusdt,before.totals.pusdt);
assert.equal(BigInt(after.totals.psy)+BigInt(result.fees),BigInt(before.totals.psy));
const evidenceNames=await readdir(join(operation,'acceptance'));
const ordinary=[];
for(const name of evidenceNames.filter(x=>x.startsWith('receipt-'))){
 const receipt=await json(join(operation,'acceptance',name));
 assert.equal(receipt.status,'included');assert.equal(receipt.receipt.data.status,'included');
 assert.equal(receipt.contentHash,receipt.receipt.data.content_hash);
 ordinary.push(receipt);
}
assert.equal(ordinary.length,31);assert.equal(new Set(ordinary.map(x=>x.contentHash)).size,31);
// Check each user's assets as well as cohort totals, so a refund to the wrong
// user cannot pass merely because the cohort sum is conserved.
const outgoing=(receipt,user,asset)=>{
 const updates=receipt.receipt.data.slot_updates.filter(x=>x.contract_id===asset&&x.slot_index===3+2*user);
 assert.ok(updates.length<=1);return updates.length?BigInt(updates[0].new_value)-BigInt(updates[0].old_value):0n;
};
const publicIncluded=histories.flatMap(x=>x.records.filter(r=>r.status==='included').map(r=>r.result));
const userChecks=[];
for(const user of [1882112,1283072,861696]){
 const fees=ordinary.filter(x=>x.userId===user).reduce((n,x)=>n+BigInt(x.receipt.data.result.fees_collected),0n);
 const sent={psy:0n,pusdt:0n};
 for(const name of evidenceNames.filter(x=>x.startsWith('request-'))){
  const request=await json(join(operation,'acceptance',name));if(request.user!==user)continue;
  for(const transfer of request.args.transfers??[])sent[transfer.token==='PSY'?'psy':'pusdt']+=BigInt(transfer.amount);
 }
 for(const [asset,key] of [[0,'psy'],[4,'pusdt']]){
  const received=publicIncluded.reduce((n,x)=>n+outgoing(x,user,asset),0n);
  assert.equal(BigInt(after.users[user][key]),BigInt(before.users[user][key])-sent[key]+received-(asset===0?fees:0n),'individual asset mismatch: '+user+'/'+key);
  userChecks.push({user,asset:key,sent:String(sent[key]),received:String(received),fees:asset===0?String(fees):'0'});
 }
}
for(const [kind,user,asset,amount] of [['orderbook',861696,4,1000n],['amm',1882112,0,1000n]]){
 const history=histories.find(x=>x.kind===kind);
 const refund=history.records.find(x=>x.status==='broadcast-intent'&&x.task.kind==='refund');assert.ok(refund);
 const result=history.records.find(x=>x.taskId===refund.taskId&&x.status==='included').result;
 assert.equal(outgoing(result,user,asset),amount);
 for(const other of [1882112,1283072,861696].filter(x=>x!==user))assert.equal(outgoing(result,other,asset),0n);
}
const sealed=[];
for(const path of ['tests/live/three-contracts-2026-10-09','executor/verification/2026-10-09','executor/verification/2026-10-10','executor/verification/2026-10-11']){
 const directory=resolve(path),lines=(await readFile(join(directory,'SHA256SUMS'),'utf8')).trim().split('\n');
 for(const line of lines){const match=line.match(/^([0-9a-f]{64})\s+\*?(.+)$/);assert.ok(match);assert.equal(hash(await readFile(join(directory,match[2]))),match[1],'sealed evidence changed: '+path+'/'+match[2]);}
 sealed.push({directory:path,verified:lines.length});
}
await mkdir(output,{recursive:false,mode:0o700});
await mkdir(join(output,'evidence'),{mode:0o700});
for(const name of evidenceNames){
 if(!name.endsWith('.json'))throw Error('unexpected acceptance evidence file');
 await copyFile(join(operation,'acceptance',name),join(output,'evidence',name));
}
await save('journals.json',histories);await save('service-status.json',status);
await save('summary.json',{status:'passed',verifiedAt:new Date().toISOString(),operation,ordinaryWalletTransactions:31,publicSettlements:7,fees:result.fees,crashTaskId:crash.taskId,unresolved:0,releaseFilesVerified:Object.keys(release.files).length,sealedEvidence:sealed,curve:'Graduated instance observed idle; no fresh buy/sell lifecycle in this run.',balancesBefore:before,balancesAfter:after,individualAssetChecks:userChecks});
await copyFile(join(operation,'release-manifest.json'),join(output,'release-manifest.json'));
await copyFile(join(operation,'release-manifest-v2.json'),join(output,'release-manifest-v2.json'));
await copyFile(join(operation,'read-recovery-tests.log'),join(output,'read-recovery-tests.log'));
await copyFile(join(operation,'recovery-regression.log'),join(output,'recovery-regression.log'));
await copyFile(join(operation,'OPERATIONS.md'),join(output,'OPERATIONS.md'));
await copyFile(join(operation,release.launchAgent),join(output,'launchagent.plist'));
console.log(JSON.stringify({status:'verified',output,transactions:38,unresolved:0}));
