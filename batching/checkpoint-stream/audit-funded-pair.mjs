// Public consistency only. Fixed-resource Endcap and approved-stack verification
// are separate requirements. VM actor mutations are not ordinary signed UPSs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {auditUpsRow} from './audit-evidence.mjs';
import {auditMinimumRow} from './audit-minimum-evidence.mjs';

export function auditNftAccountBootstrap(request,collectionId=41n){
 const rows=request.user_ec_input.contract_state_updates.filter(x=>x.user_contract_tree_update_proof.index===BigInt(collectionId));
 assert.equal(rows.length,1,'one collection initialization delta');
 const {user_contract_tree_update_proof:parent,updates}=rows[0];
 assert.equal(parent.old_value,'0'.repeat(64),'actual absent collection root');
 assert.equal(updates.length,1,'no NFT balance, ownership or FIFO padding');
 const word=updates[0].Positional.delta_proof;
 assert.equal(word.index,150995239n);assert.equal(word.old_value,'0'.repeat(64));
 assert.equal(BigInt('0x'+word.new_value),1n<<128n,'only account_version at limb 2');
 assert.equal(parent.new_value,word.new_root);assert.notEqual(parent.new_value,parent.old_value);
 return {collectionId:String(collectionId),markerSlot:'603980958',modifiedWords:1,assetOrFifoPadding:false};
}

export function auditFundedPairRow(v,request,plan,session){
 assert.equal(v.firstUse,plan.fields[0]===14n);
 // The stored first-use endpoint is empty; the signature authenticates the
 // initialized registered leaf. Neither endpoint may replace the other.
 if(v.firstUse){assert.equal(v.storedStartLeaf,'0'.repeat(64));assert.notEqual(v.signatureStartLeaf,v.storedStartLeaf);}
 assert.equal(v.signatureStartLeaf,v.startLeaf);
 const row=auditUpsRow({...v,startLeaf:v.storedStartLeaf},request,plan,session);
 auditMinimumRow(plan,session);
 assert.ok([4n,5n,6n,8n,10n,11n,13n,14n].includes(plan.fields[0]));
 for(const name of ['random','minimum','accepted_seal'])assert.ok(plan[name]===undefined||plan[name]===null);
 for(const call of session.stack)assert.equal(call.caller_contract_id,4294967296n);
 assert.equal(request.user_ec_input.core.new_user_leaf.user_id,100n);
 assert.equal(plan.registered_key.length,4);
 return {...row,startLeaf:v.storedStartLeaf,nonce:String(request.user_ec_input.core.new_user_leaf.nonce)};
}

export async function auditFundedPair(root,{onlyNftAccount=false}={}){
 const markets={};let count=0;
 for(const market of onlyNftAccount?['nftmarket']:['orderbook','nftmarket']){
  const report=JSON.parse(await readFile(join(root,market+'-REPORT.json'),'utf8'));
  if(onlyNftAccount)assert.equal(report.keyVersion,21,'distinct initialized NFT key');
  for(const[k,v]of Object.entries({vmOnly:false,fullUpsVerified:true,emptyVaultBootstrap:true,feeExhaustionRecovery:true,sourcePreserved:true,globalPriority:true,settled:2,timeoutRefunds:1,cancelAfterSeal:true,assetConservation:true,nativeConservation:true,financialOperations:0}))assert.equal(report[k],v,k);
  const main=['bootstrap','open','cover-0','fee-recovery','cover-1','scan-0','fill',...(market==='nftmarket'?['ack-delivered-buyer']:[]),'refund-open','refund-cover-0','refund-cover-1','timeout-refund',...(market==='nftmarket'?['ack-refunded-seller']:[])];
  const fork=['retention-scan-fork','retention-carry-fork'],rows={},plans={},sessions={},digests={};let key;
  for(const name of [...main,...fork]){
   const dir=join(root,market+'-'+name),files={};
   for(const f of ['request.json','plan.json','source.json','public-session.json','verification.json','key-proof.bin']){
    const raw=await readFile(join(dir,f));digests[name+'/'+f]=sha256(raw);
    if(f.endsWith('.json'))files[f]=f==='verification.json'?JSON.parse(raw):parseLosslessJson(raw.toString());
   }
   const v=files['verification.json'],p=files['plan.json'],s=files['public-session.json'];
   rows[name]=auditFundedPairRow(v,files['request.json'],p,s);plans[name]=p;sessions[name]=s;
   if(onlyNftAccount&&name==='bootstrap')auditNftAccountBootstrap(files['request.json']);
   key??=v.keyFingerprint;assert.equal(v.keyFingerprint,key,'one distinct funded key');
   assert.equal(files['source.json'].fields[3],1000n);assert.equal(files['source.json'].fields[4],100n);
   assert.equal(p.source.scope[7]-p.source.scope[6],32n);
   count++;
  }
  const edge=(a,b)=>{assert.equal(rows[a].endLeaf,rows[b].startLeaf,'exact vault edge '+a+' -> '+b);assert.equal(BigInt(rows[a].nonce)+1n,BigInt(rows[b].nonce));};
  for(let i=1;i<main.length;i++)edge(main[i-1],main[i]);
  edge('refund-cover-1',fork[0]);edge(fork[0],fork[1]);
  assert.notEqual(rows[fork[1]].endLeaf,rows['timeout-refund'].endLeaf,'alternative histories cannot be spliced');
  for(const list of [['open','cover-0','cover-1','scan-0','fill'],['refund-open','refund-cover-0','refund-cover-1',...fork,'timeout-refund']]){
   const scope=plans[list[0]].source.scope,facts=plans[list[0]].source.facts;
   for(const name of list){assert.deepEqual(plans[name].source.scope,scope,'original frozen source');assert.deepEqual(plans[name].source.facts,facts,'original dependency facts');}
  }
  for(const prefix of ['', 'refund-']){
   const a=plans[prefix+'cover-0'].source,b=plans[prefix+'cover-1'].source;
   assert.equal(a.before.accounts,0n);assert.deepEqual(a.after,b.before);assert.equal(b.after.accounts,7n,'all declared synthetic accounts');
   assert.equal(b.after.order_count,prefix?1n:2n);
  }
  assert.equal(plans['scan-0'].fields[0],10n);assert.equal(plans.fill.fields[0],8n);
  assert.equal(plans['retention-carry-fork'].fields[0],11n);
  assert.ok(sessions['retention-carry-fork'].actualCalls.some(c=>c.method_name==='finish_pair_carry'));
  assert.equal(plans['timeout-refund'].fields[0],8n);assert.equal(plans['timeout-refund'].fields[2],1n);
  const fee=main.reduce((n,k)=>n+BigInt(rows[k].syntheticNativeFee),0n),forkFee=fork.reduce((n,k)=>n+BigInt(rows[k].syntheticNativeFee),0n);
  markets[market]={keyFingerprint:key,mainUps:main.length,alternativeUps:fork.length,mainSyntheticFee:String(fee),alternativeSyntheticFee:String(forkFee),mainPhases:main,alternativePhases:fork,rows,fileSha256:digests,ordinarySignedClaims:false};
 }
 assert.equal(count,onlyNftAccount?15:28);
 return{schema:1,scope:'Conditional synthetic vault UPS consistency; actor funding/orders/claims are VM prerequisites. No independent ZK, ordinary signature, finality, receipt or UI acceptance.',completeUps:count,cryptographicVerificationPerformed:false,financialOperations:0,canBroadcast:false,markets};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 assert.ok(process.argv.length===3||(process.argv.length===4&&process.argv[3]==='--nft-account-v21'),'ROOT [--nft-account-v21]');
 console.log(JSON.stringify(await auditFundedPair(process.argv[2],{onlyNftAccount:process.argv[3]==='--nft-account-v21'}),null,2));
}
