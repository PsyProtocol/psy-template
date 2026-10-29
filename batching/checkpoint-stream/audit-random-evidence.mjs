// Structural audit of public evidence. Native fixed-resource proof verification
// remains separate; this script cannot authorize a transaction or prove finality.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {auditUpsRow} from './audit-evidence.mjs';
const phases=['open','source-0','source-1','order-0','order-1','settle-0','settle-tail','timeout-tail','expire-unseeded','unseeded-refund-0','unseeded-refund-4','restart-expired-order','recovery-order-0','recovery-order-1','recovery-refund-0','recovery-refund-4'];
const edges=[['open','source-0'],['source-0','source-1'],['source-1','order-0'],['order-0','order-1'],['order-1','settle-0'],['settle-0','settle-tail'],['settle-0','timeout-tail'],['source-1','expire-unseeded'],['expire-unseeded','unseeded-refund-0'],['unseeded-refund-0','unseeded-refund-4'],['order-0','restart-expired-order'],['restart-expired-order','recovery-order-0'],['recovery-order-0','recovery-order-1'],['recovery-order-1','recovery-refund-0'],['recovery-refund-0','recovery-refund-4']];
export async function auditRandomEvidence(root,{selectedMarkets=['amm','bondingcurve']}={}){
 assert.ok(selectedMarkets.length>0&&selectedMarkets.length<=2&&new Set(selectedMarkets).size===selectedMarkets.length);for(const m of selectedMarkets)assert.ok(['amm','bondingcurve'].includes(m));
 const markets={};
 for(const market of selectedMarkets){
  const report=JSON.parse(await readFile(join(root,market+'-REPORT.json'),'utf8'));
  assert.equal(report.profile,'source-covered-producer-random-stream-v1');assert.equal(report.fullUpsVerified,true);assert.equal(report.broadcast,false);assert.equal(report.producerInfluence,true);assert.equal(report.qualifiedRandomness,false);assert.equal(report.ordinaryWalletUps,false);assert.equal(report.assetConservation,true);assert.equal(report.sameSeedPrefixRecovery,true);
  const rows={},plans={},digests={};let scope,key;const seed=report.seed.map(BigInt);
  for(const phase of phases){
   const dir=join(root,market+'-'+phase),data={};
   for(const name of ['verification.json','request.json','plan.json','source.json','current.json','public-session.json','key-proof.bin']){const b=await readFile(join(dir,name));digests[market+'-'+phase+'/'+name]=createHash('sha256').update(b).digest('hex');if(name.endsWith('.json'))data[name]=name==='verification.json'?JSON.parse(b):parseLosslessJson(b.toString());}
   const v=data['verification.json'],p=data['plan.json'];rows[phase]=auditUpsRow(v,data['request.json'],p,data['public-session.json']);plans[phase]=p;
   if(!key){key=v.keyFingerprint;scope=p.source.scope;}
   assert.equal(v.keyFingerprint,key);assert.deepEqual(p.source.scope,scope,'all branches retain the complete source set');
   if(p.random){const unseeded=phase.startsWith('unseeded-refund');assert.deepEqual(p.random.seed,unseeded?[0n,0n,0n,0n]:seed,'original seed across pages and recovery');assert.equal(p.random.refund_only,unseeded||phase.startsWith('recovery-'));}
  }
  for(const [a,b]of edges)assert.equal(rows[a].endLeaf,rows[b].startLeaf,'exact synthetic state chain '+a+' -> '+b);
  assert.equal(scope[6],BigInt(report.singleSource));assert.equal(scope[6]+1n,BigInt(report.singleDraw));
  for(const prefix of ['', 'recovery-']){
   const a=plans[prefix+'order-0'],b=plans[prefix+'order-1'];assert.equal(a.sort.cursor,0n);assert.equal(b.sort.cursor,4n);assert.equal(a.random.rows.length,4);assert.equal(b.random.rows.length,1);
   const members=[...a.random.rows,...b.random.rows].map(r=>String(r.origin.member.owner));assert.deepEqual(members,report.permutationOwners.map(String));assert.equal(new Set(members).size,5);
   const terminal=prefix?'recovery-refund-4':'settle-tail',first=prefix?'recovery-refund-0':'settle-0';
   const dispositions=[plans[first],plans[terminal]].flatMap(p=>Array.from({length:Number(p.fields[2])},(_,i)=>String(p.fields[22+13*i])));assert.deepEqual(dispositions,members,'all members receive ordered terminal disposition');assert.equal(plans[first].settled,0n);assert.equal(plans[terminal].settled,4n);
  }
  assert.equal(plans['unseeded-refund-0'].settled,0n);assert.equal(plans['unseeded-refund-4'].settled,4n);
  const normal=phases.slice(0,7);
  markets[market]={keyFingerprint:key,rows,normalPhases:normal,normalUpsSeconds:normal.reduce((n,k)=>n+rows[k].seconds,0),normalSyntheticFee:normal.reduce((n,k)=>n+BigInt(rows[k].syntheticNativeFee),0n).toString(),coldResources:report.measurements.filter(r=>r.phase==='cold-stream-resource-build'),members:5,orderingPages:[4,1],ordinaryWalletUps:false,assetConservationRecorded:true,fileSha256:digests};
 }
 return {schema:1,scope:'public evidence consistency; not cryptographic verification, finality or live acceptance',completeUps:16*selectedMarkets.length,cryptographicVerificationPerformed:false,financialOperations:0,canBroadcast:false,markets};
}
if(process.argv.length===3&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(await auditRandomEvidence(process.argv[2]),null,2)+'\n');
