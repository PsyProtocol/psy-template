// Reuse the existing owned QA holders; no new asset issuance or wallet policy.
import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {join} from 'node:path';
import {cohort,formal} from './candidateHarness.mjs';import {closedParent} from './parentRecoveryGate.mjs';
import {read,save} from '../../batching/admission/liveSupport.mjs';import {publicState} from '../publicState.mjs';
import {call,encodeAmount,FEE_ESCROW as F,parseLosslessJson} from '../../amm/u124/client.mjs';
import {activationFunding} from '../../batching/v2/client.mjs';
const [base,original]=process.argv.slice(2),h=cohort(base,original),prepare=read(join(base,'public/PREPARED-BULK-v1.json'));
assert.deepEqual(closedParent(prepare),read(join(base,'public/parent-recovery-gate-v1.json')));
assert.ok(existsSync(join(base,'public/deployments-complete-v1.json')));assert.ok(h.markets.every(m=>m.registration.admissionMode==='all-four-v1'));
const completed=join(base,'public/setup-complete-v1.json');if(existsSync(completed)){const done=read(completed);assert.equal(done.admissionMode,'all-four-v1');assert.equal(done.allVaultsActivated,true);assert.equal(done.existingPusdtUsed,false);assert.equal(done.newCurveTarget,h.by.amm.vault);console.log('bulk setup already complete; no transaction attempted');process.exit(0);}
const independent=async jobs=>{const results=await Promise.allSettled(jobs.map(job=>job()));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;};
const s=await publicState(h.config),nft=2467;for(const [name,slot]of [['trader',1],['charlie',0]])assert.ok(await s.slot(h.actors[name].id,nft,34+9*slot)>0n,'original QA NFT slot must be restored before the new family');
const fundingFile=join(base,'public/bootstrap-native-plan-v1.json');
if(!existsSync(fundingFile)){
 const users=[];for(const name of ['trader','charlie','dave']){const id=h.actors[name].id,balance=await s.slot(id,0,0),sent=await s.slot(h.actors.sponsor.id,0,3+2*id),claimed=await s.slot(id,0,4+2*h.actors.sponsor.id);assert.ok(sent>=claimed);const pending=sent-claimed,target=50_000_000_000n,amount=balance+pending<target?target-balance-pending:0n;users.push({name,id,balance,pending,amount});}
 save(fundingFile,{checkpoint:s.checkpoint,users,nativeAsset:'faucet test PSY; target 50 before ordinary claim fees; existing Sponsor balance, no faucet/mint or pUSDT'});
}
const funding=read(fundingFile),send=funding.users.filter(r=>BigInt(r.amount)>0n);if(send.length)await h.user('sponsor','bulk-bootstrap-native-topups',send.map(r=>({contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(r.id),BigInt(r.amount)]})));
await independent(funding.users.filter(r=>BigInt(r.pending)+BigInt(r.amount)>0n).map(r=>()=>h.user(r.name,'bulk-bootstrap-'+r.name+'-native-claim',[{contract_id:0n,method_name:'simple_claim',inputs:[BigInt(h.actors.sponsor.id)]}])));
await independent([
 ()=>h.user('bob','bulk-bootstrap-ft-market-seeds',h.markets.filter(m=>m.kind!=='nftmarket').flatMap(m=>activationFunding({market:m.kind,config:m.driverConfig,tokenAbi:h.token,vaultId:BigInt(m.vault)}))),
 ()=>h.user('trader','bulk-bootstrap-nft-holder-seeds',activationFunding({market:'nftmarket',config:h.by.nftmarket.driverConfig,tokenAbi:h.token,vaultId:BigInt(h.by.nftmarket.vault)}))
]);
await independent(h.markets.map(m=>async()=>{const f=await formal(h,m,'bootstrap-bulk-v1',{version:1,epoch:1,cutoff:1,members:[]});try{await f.step('bulk-bootstrap-'+m.kind+'-activate',t=>t.kind==='batch_maintenance'&&parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name===(m.kind==='nftmarket'?'activate':'activate_batch_vault')));}finally{await f.close();}}));
const c=h.by.bondingcurve;await h.user('bob','candidate-curve-inventory',[{contract_id:0n,method_name:'simple_transfer',inputs:[BigInt(c.vault),F]},call(2464n,h.token,'transfer',[BigInt(c.vault),encodeAmount(110n*10n**18n)])]);
const f=await formal(h,c,'inventory',{version:1,epoch:1,cutoff:1,members:[]});try{await f.step('candidate-curve-initialize',t=>t.kind==='batch_maintenance'&&parseLosslessJson(t.submission).contract_calls.some(c=>c.method_name==='initialize'));}finally{await f.close();}
const marker=join(base,'public/setup-complete-v1.json');if(!existsSync(marker))save(marker,{completedAt:new Date().toISOString(),qaFt:[2464,2466],qaNft:2467,nativeAsset:'test PSY',existingPusdtUsed:false,newActorRegistrations:false,newCurveTarget:h.by.amm.vault,allVaultsActivated:true,admissionMode:'all-four-v1',productionReady:false});
