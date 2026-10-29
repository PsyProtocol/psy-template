// Structural audit of already native-verified paired refund UPS artifacts.
// This does not independently verify ZK proofs or authorize any live operation.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {parseLosslessJson} from '../../amm/u124/client.mjs';import {auditUpsRow} from './audit-evidence.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function auditPairEvidence(root,selected=['orderbook','nftmarket']){
 assert.ok(selected.length>0&&selected.length<=2&&new Set(selected).size===selected.length&&selected.every(n=>['orderbook','nftmarket'].includes(n)),'reviewed paired markets');
 const markets={};const n=(1n<<62n)+17n;
 for(const market of selected){
  const report=JSON.parse(await readFile(join(root,`${market}-REPORT.json`),'utf8'));
  for(const key of ['fullUpsVerified','fixedVerifier','assetConservation'])assert.equal(report[key],true,key);
  for(const key of ['broadcast','tradingEnabled','globalTradingFrontierVerified'])assert.equal(report[key],false,key);
  assert.equal(report.fills,0);assert.equal(report.members,5);assert.equal(report.sourceRecoveryMembers,1);assert.deepEqual(report.refundPages,[2,2,1]);
  const phases=['open',...Array.from({length:report.sourcePages},(_,i)=>`cover-${i}`),'refund-0','refund-2','refund-4','enrolled-recovery','abort-unaccepted'],rows={},pins={},selected=[];let fp=null;
  for(const phase of phases){const dir=`${market}-${phase}`,files={};for(const name of ['verification.json','request.json','plan.json','source.json','current.json','public-session.json','key-proof.bin']){const raw=await readFile(join(root,dir,name));pins[`${dir}/${name}`]=sha(raw);if(name.endsWith('.json'))files[name]=name==='verification.json'?JSON.parse(raw):parseLosslessJson(raw.toString());}
   const v=files['verification.json'],p=files['plan.json'],session=files['public-session.json'];if(fp===null)fp=v.keyFingerprint;assert.equal(v.keyFingerprint,fp);rows[phase]=auditUpsRow(v,files['request.json'],p,session);
   if(phase===`cover-${report.sourcePages-1}`){assert.equal(p.source.after.accounts,9n);assert.equal(p.source.after.order_count,5n);assert.equal(p.source.after.recovery_count,1n);assert.deepEqual(p.source.after.users,p.source.facts[0]);}
   if(phase==='enrolled-recovery'){
    assert.equal(p.fields[0],4n);assert.equal(p.fields[22],205n);assert.equal(p.members.length,0);
    for(const call of session.actualCalls)if(call.method_name==='transfer')assert.equal(call.contract_id===41n?call.inputs[1]:call.inputs[0],205n,'enrolled refund goes only to sender');
   }
   if(phase.startsWith('refund-')){
    const start=BigInt(phase.slice(7)),count=start===4n?1n:2n;assert.equal(p.settled,start);assert.equal(p.fields[4],start);assert.equal(p.fields[2],count);assert.equal(p.members.length,Number(count));assert.ok(session.checkpoint>p.source.scope[7]);
    const owners=p.members.map((_,i)=>p.fields[22+13*i]);selected.push(...owners.map(String));
    for(const call of session.actualCalls){if(call.method_name==='transfer'){const peer=call.contract_id===41n?call.inputs[1]:call.inputs[0];assert.ok(owners.includes(peer),'refund recipient outside current original members');}}
   }
  }
  const normal=phases.slice(0,-1);for(let i=1;i<normal.length;i++)assert.equal(rows[normal[i-1]].endLeaf,rows[normal[i]].startLeaf,`exact account/nonce chain ${normal[i-1]} -> ${normal[i]}`);assert.equal(rows.open.endLeaf,rows['abort-unaccepted'].startLeaf);
  assert.deepEqual(selected,['200','201','202','203','204']);
  for(let owner=200;owner<205;owner++){
   for(const asset of market==='nftmarket'?[0,42]:[0,42,43]){const row=report.claims.find(v=>v.owner===owner&&v.asset===asset);assert.ok(row,'missing claim');const expected=asset===0?1000100000n:market==='nftmarket'?([201,203,204].includes(owner)?n:0n):((owner%2===0&&asset===42)||(owner%2===1&&asset===43)?n:0n);assert.equal(BigInt(row.amount),expected,`exact claim ${owner}/${asset}`);assert.equal(row.ordinaryWalletSignature,false);}
  }
  if(market==='nftmarket'){const refunds=report.claims.filter(v=>v.nftClaimBytecode);assert.deepEqual(refunds.map(v=>v.owner),[200,202]);for(const row of refunds)assert.equal(row.collection,41);assert.notDeepEqual(refunds[0].payload,refunds[1].payload);}
  const recovery=report.enrolledRecovery;assert.equal(recovery.owner,205);assert.equal(recovery.fullUpsVerified,true);assert.equal(recovery.ordinaryClaimSignature,false);
  if(market==='orderbook'){assert.equal(recovery.asset,42);assert.equal(BigInt(recovery.amount),n);assert.equal(recovery.nativeReturned,17);}else{assert.equal(recovery.collection,41);assert.equal(recovery.nftOnlyNoIncomingFee,true);assert.equal(recovery.payload.length,8);}
  markets[market]={keyFingerprint:fp,members:selected,normalPhases:normal,normalPhaseSeconds:normal.reduce((n,p)=>n+rows[p].seconds,0),normalSyntheticFee:normal.reduce((n,p)=>n+BigInt(rows[p].syntheticNativeFee),0n).toString(),coldResources:report.measurements.filter(v=>v.phase==='cold-stream-resource-build'),rows,claimAmountsChecked:true,enrolledRecovery:recovery,fileSha256:pins};
 }
 return{schema:1,scope:'structural consistency and exact fixture refund amounts of saved native-verified synthetic UPS evidence; not independent ZK verification, live trade or wallet signature acceptance',cryptographicVerificationPerformed:false,canBroadcast:false,markets};
}
if(process.argv.length===3&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(await auditPairEvidence(process.argv[2]),null,2)+'\n');
