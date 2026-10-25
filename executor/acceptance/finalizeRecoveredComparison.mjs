// Read-only final observations after actual stage/payout receipts. No signing,
// proof generation, funding, submit, parameter rewrite or transaction retry.
import assert from 'node:assert/strict';import {readFileSync,readdirSync,existsSync} from 'node:fs';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {threeMarketCase} from './threeMarketCase.mjs';import {freezeAppModules} from './sourceClosure.mjs';import {publicState} from '../publicState.mjs';import {cohortAssets} from '../../batching/admission/liveAssets.mjs';import {assertBookFillCohort} from './fillCohort.mjs';import {read,save} from '../../batching/admission/liveSupport.mjs';import {parseLosslessJson} from '../../amm/u124/client.mjs';import {sha256} from '../requestBinding.mjs';
const[base,original]=process.argv.slice(2);assert.ok(original);freezeAppModules(fileURLToPath(import.meta.url),base,'read-only-fill-finalization-v1');
const round=join(base,'baseline'),exact=p=>parseLosslessJson(readFileSync(p,'utf8')),h=await threeMarketCase(original,{toolManifest:'TOOLS-v2.json'}),m=h.by.orderbook,config=join(round,'public/rpc.json');
assert.equal(sha256(readFileSync(config)),sha256(readFileSync(join(original,'public/rpc.json'))));
assert.ok(existsSync(join(round,'public/ORIGINAL-ADMISSION-READ-RECOVERY-v1.json')));assert.ok(!existsSync(join(round,'public/RETRY-PLAN-v1.json')));
for(const label of ['start','admit-0','admit-1','seal','commit','settle']){const r=exact(join(round,'public',label+'-formal-result.json'));assert.equal(r.result.status,'included');assert.equal(r.result.userId,BigInt(m.vault));assert.ok(r.result.contentHash);}
for(const label of ['owner-payout','buyer-payout'])assert.equal(exact(join(round,'attempts',label,'included.json')).receipt.data.status,'included');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>['drivers','.secrets'].includes(e.name)?[]:e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]),latest=new Map();
for(const f of walk(round).filter(f=>f.endsWith('/included.json')||/\d+-included\.json$/.test(f))){const raw=exact(f),r=raw.result?.receipt?raw.result:raw;if(r.status!=='included'||!r.receipt?.data?.result?.fees_collected)continue;const key=String(r.userId),old=latest.get(key);if(!old||old.checkpoint<r.checkpoint)latest.set(key,r);}
assert.deepEqual([...latest.keys()].sort(),['1717440','406720','519360','662720'].sort());
const state=await publicState(config),endpoints=[];
for(const r of latest.values()){
 assert.ok(BigInt(state.checkpoint)>=r.checkpoint);const id=Number(r.userId),realm=state.network.realm_configs.find(x=>x.id===Math.floor(id/state.network.users_per_realm)),params={checkpoint_id:state.checkpoint,user_id:id};assert.ok(realm);
 const hash=await state.rpc(realm.rpc_url[0],'psy_get_user_tree_leaf_hash',params);assert.equal(hash,r.endUserLeafHash,'intervening account change');endpoints.push({userId:id,checkpoint:state.checkpoint,userLeafHash:hash});
}
const plan=read(join(round,'public/PLAN.json'));assert.equal(await h.at(state,m,m.vault,'queue_phase'),3n);assert.equal(await h.at(state,m,m.vault,'queue_count'),2n);
for(let i=0;i<2;i++)assert.equal(await h.at(state,m,m.vault,'queue_outcome',i),1n);
for(const member of plan.members)assert.equal(await h.at(state,m,m.vault,'consumed',member.owner),BigInt(member.nonce));
const before=exact(join(round,'public/assets-before.json')),spec={users:Object.keys(before.accounts).map(Number),assets:[2483,2484],nftId:2496},after=await cohortAssets(state,spec);
assertBookFillCohort(before,after,{owner:h.actors.bob.id,buyer:h.actors.buyer.id,assets:spec.assets,unit:10n**18n});
save(join(round,'public/assets-after.json'),after);save(join(base,'public/baseline-RECOVERY-COMPLETE-v1.json'),{at:new Date().toISOString(),selection:'baseline',roundTag:'baseline',fills:1,ordinaryClaimsIncluded:true,expectedActualUps:17,fullProofAccountingPending:true,cleanPerformancePairEligible:false,originalOrdersAndDepositsReused:true,emptyEpochAborted:false,finalizationReadOnly:true,endpoints,scope:'original 17 UPS workload and epoch retained after unsigned session failure; live/saved NFT metadata normalized exactly; independent full proof, fee and conservation audit still mandatory'});
console.log('read-only final observations closed; independent 17 UPS audit remains mandatory');
