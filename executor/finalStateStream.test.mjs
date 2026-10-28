// Actual frozen native CLI composition; synthetic checkpoints, no RPC or funds.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {prepareFinalStateStream} from './finalStateStream.mjs';
import {sha256} from './requestBinding.mjs';
import {parseLosslessJson,losslessJson} from '../amm/u124/client.mjs';
const base=process.env.FINAL_STATE_CASE,fixtures=process.env.FINAL_STATE_EXPORTED,sourceWallet=process.env.FINAL_STATE_DRIVER,streamWallet=process.env.CHECKPOINT_STREAM_DRIVER;
assert.ok(base&&fixtures&&sourceWallet&&streamWallet,'fresh evidence directory, reviewed binaries and fixture export required');await mkdir(base);
const sourceWalletSha256=sha256(await readFile(sourceWallet)),streamWalletSha256=sha256(await readFile(streamWallet));
const read=async p=>parseLosslessJson(await readFile(p,'utf8'));
const opts=async kind=>{const p=join(fixtures,kind);return {review:join(p,'review.json'),reviewSha256:sha256(await readFile(join(p,'review.json'))),snapshot:join(p,'snapshot.json'),historyRoot:(await read(join(p,'history.json'))).root,sourceWallet,sourceWalletSha256,streamWallet,streamWalletSha256,runtimeDirectory:join(base,kind)};};
for(const kind of ['amm','bondingcurve'])test(`${kind}: complete authenticated source, nine members and exact resume`,async()=>{
 const o=await opts(kind),job=await prepareFinalStateStream(o),s=await job.status();assert.equal(s.accounts,18n);assert.equal(s.eligible,9n);assert.equal(s.fundedRecoveryCandidates,3n);assert.equal(s.canBroadcast,false);assert.equal(s.finalityVerified,false);assert.throws(()=>job.authorizeSettlement(),{code:'STREAM_MARKET_UPS_UNAVAILABLE'});
 const done=await job.prove();assert.equal(done.proofs.members,9n);assert.equal(done.proofs.conditionalOrderChainVerified,true);assert.equal(done.settlementCursor,0);assert.equal(done.source.ordering.pages,3);
 const restart=await prepareFinalStateStream(o),again=await restart.prove();assert.deepEqual(again,done);
 const coverage=await read(join(job.sourceDirectory,'coverage.json'));assert.deepEqual(coverage.trading_manifest,(await read(join(job.sourceDirectory,'manifest.json'))));
 const captured=join(job.directory,'source-input','snapshot.json'),raw=await readFile(captured);await writeFile(captured,Buffer.concat([raw,Buffer.from('\n')]));await assert.rejects(()=>job.status(),/captured source changed/);await writeFile(captured,raw);
 await writeFile(join(base,`${kind}-SUMMARY.json`),losslessJson({scope:'synthetic complete final-state Merkle coverage + actual native ordering proofs; no financial UPS or network acceptance',sourceWalletSha256,streamWalletSha256,sourceStatus:s,completed:done,exactRestart:again,sourceSha256:sha256(await readFile(join(job.sourceDirectory,'snapshot.json'))),financialOperations:0,wireRpc:0})+'\n',{flag:'wx'});
});
test('wrong review, old root format, forged source and omission never reach proof generation',async()=>{
 const o=await opts('amm');await assert.rejects(()=>prepareFinalStateStream({...o,reviewSha256:'0'.repeat(64)}),/review pin changed/);
 await assert.rejects(()=>prepareFinalStateStream({...o,historyRoot:'0x'+o.historyRoot}),/canonical history root/);
 const s=await read(o.snapshot);const dir=join(base,'attacks');await mkdir(dir);
 for(const [name,change]of [['missing-unrelated',x=>x.accounts.shift()],['duplicate-account',x=>x.accounts.push(x.accounts.at(-1))],['post-source-seed',x=>x.fields[21]++],['selected-count',x=>x.fields[8]=1n]]){const bad=structuredClone(s);change(bad);const path=join(dir,name+'.json');await writeFile(path,losslessJson(bad)+'\n',{flag:'wx'});await assert.rejects(()=>prepareFinalStateStream({...o,snapshot:path,runtimeDirectory:join(dir,name)}));}
 assert.ok(!(await readdir(dir)).includes('proofs'));
 await writeFile(join(base,'ATTACKS.json'),JSON.stringify({scope:'actual native rejection before any component proving or financial operation',rejected:['wrong-review-pin','noncanonical-root','missing-unrelated-account','duplicate-account','post-source-seed','selected-count'],financialOperations:0,wireRpc:0},null,2)+'\n',{flag:'wx'});
});
