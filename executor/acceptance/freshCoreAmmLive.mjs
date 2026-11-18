// Bounded, explicitly owned QA journey through the FORMAL core Executor.
// One external supervisor owns both account locks. Unknown results only reconcile.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,readdirSync,realpathSync,lstatSync} from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process'; import {promisify} from 'node:util';
import {read,save,ordinary,confirmUps,binding} from '../../batching/admission/liveSupport.mjs';
import {decodeAmount,parseLosslessJson,losslessJson,swapQuote,FEE_ESCROW} from '../../amm/u124/client.mjs';
import {publicState} from '../publicState.mjs'; import {ordinaryResident} from '../ordinaryResident.mjs';
import {createPublicWalletAdapter} from '../publicWalletAdapter.mjs'; import {validateOptions} from '../config.mjs';
import {ExecutionJournal} from '../journal.mjs'; import {sha256} from '../requestBinding.mjs';
import {latestBroadcastOutcome} from './attemptOutcome.mjs'; import {freezeAppModules} from './sourceClosure.mjs';
import {planCoreAmmStage} from './coreAmmJourney.mjs';
import {requireCoreDependencyPolicy,assertCoreDependencyEvidence} from '../coreDependencyPolicy.mjs';
import {validateActivationContinuation,ACTIVATION_ORIGINAL} from './activationContinuation.mjs';
import {validateSponsorContinuation,SPONSOR_ORIGINAL} from './sponsorContinuation.mjs';

const SDK='01b8f2b0a077367a7b9879baba1a72aea8ab5510',CLIENT='7058070057c3242b5d8b29e1a31d498aaa4202c0',UNIT=10n**18n;
export const FRESH_CORE_AMM_STAGES=Object.freeze([
 ['fresh-native-send-v1','ordinary'],['fresh-native-claim-v1','ordinary'],
 ['core-issuer-setup-v1','ordinary'],['core-trader-assets-v1','ordinary'],['core-activation-fund-v1','ordinary'],
 ['core-activate-v1','formal-core'],['core-lp-open-v1','ordinary'],['core-lp-sponsor-v1','ordinary'],
 ['core-lp-commit-v1','formal-core'],['core-lp-settle-v1','formal-core'],['core-swap-open-v1','ordinary'],
 ['core-swap-sponsor-v1','ordinary'],['core-swap-commit-v1','formal-core'],['core-swap-settle-v1','formal-core'],
 ['core-swap-claim-v1','ordinary'],['core-cancel-open-v1','ordinary'],['core-cancel-sponsor-v1','ordinary'],
 ['core-cancel-commit-v1','formal-core'],['core-cancel-settle-v1','formal-core'],['core-refund-claim-v1','ordinary'],
].map(row=>Object.freeze(row)));
// Saved cohort observations and the exact preceding formal vault receipt each
// one must still sit on. The initial snapshot has no predecessor.
export const FRESH_CORE_AMM_SNAPSHOTS=Object.freeze([
 ['fresh-initial-v1',null],
 ['core-after-lp-v1','core-lp-settle-v1'],
 ['core-after-swap-v1','core-swap-settle-v1'],
 ['fresh-final-v1','core-cancel-settle-v1'],
].map(row=>Object.freeze(row)));
export function caseFile(base,name){
 assert.equal(typeof name,'string');assert.ok(name.length>0&&!isAbsolute(name)&&!name.split(/[\\/]/).some(v=>v==='..'||v==='.'||v===''),'case-local relative path required');
 const path=resolve(base,name);assert.ok(path.startsWith(resolve(base)+'/'),'case path escapes');return path;
}
// Recorded output paths come from a public report, so they are evidence about
// this case only. Lexical containment alone is not filesystem confinement:
// every component below the owned case root must be a real, non-symlink entry
// and the resolved artifact must stay inside the real case root. These are
// point-in-time filesystem checks, not an atomic open: a concurrent writer can
// still swap a component before the caller reads it (TOCTOU). Only the separate
// pinned SHA-256 comparison binds the bytes that were actually read.
export function freshCaseArtifact(base,name){
 assert.equal(typeof name,'string');assert.ok(name.length>0&&isAbsolute(name),'recorded journey artifact path must be absolute');
 const lexicalRoot=resolve(base),path=resolve(name);
 assert.ok(path.startsWith(lexicalRoot+'/'),'recorded journey artifact escapes the owned case');
 const root=realpathSync(lexicalRoot);
 let current=lexicalRoot;
 for(const part of path.slice(lexicalRoot.length+1).split('/')){
  current=join(current,part);
  assert.ok(!lstatSync(current).isSymbolicLink(),'recorded journey artifact must not traverse a symlink');
 }
 const real=realpathSync(path);
 assert.ok(real.startsWith(root+'/'),'recorded journey artifact real path escapes the owned case');
 assert.ok(!real.slice(root.length+1).split('/').includes('.secrets'),'secret bytes never enter public journey outputs');
 assert.ok(lstatSync(real).isFile(),'recorded journey artifact must be an existing regular file');
 return real;
}
export function validateFreshCoreManifest({manifest:m,plan,reg,selected,member,actorsFile,policy,config}){
 assert.equal(m.schema,1);assert.equal(m.sdkCommit,SDK);assert.equal(m.clientCommit,CLIENT);assert.equal(m.network,'testnet');
 assert.equal(plan.maximumFeePsy,'60');assert.equal(plan.maximumNewFullUps,20);
 assert.ok(Number.isSafeInteger(plan.maximumWallSeconds)&&plan.maximumWallSeconds>0&&plan.maximumWallSeconds<=43200);
 assert.ok(Number.isFinite(Date.parse(plan.createdAt)));
 const id=n=>assert.ok(Number.isSafeInteger(n)&&n>0&&n<2**24,'valid current-chain identity');
 const hash=n=>assert.match(n??'',/^[a-f0-9]{64}$/);
 const {issuerId,traderId}=m;for(const n of [issuerId,traderId,reg.vaultId,reg.marketId,config.assetA,config.assetB])id(n);
 assert.equal(new Set([issuerId,traderId,reg.vaultId]).size,3);assert.equal(new Set([reg.marketId,config.assetA,config.assetB]).size,3);
 assert.ok([reg.marketId,config.assetA,config.assetB].every(n=>n>=5));
 // This fresh stag journey must not consume any predecessor-case identity.
 assert.ok(![issuerId,traderId,reg.vaultId].some(n=>[971904,668800,1182848].includes(n)),'historical account is not fresh');
 assert.ok(![reg.marketId,config.assetA,config.assetB].some(n=>[49,50,51].includes(n)),'historical contract is not fresh');
 assert.deepEqual(plan.ordinaryQaUsers,[issuerId,traderId]);
 assert.equal(selected.marketId,reg.marketId);assert.equal(member.userId,reg.vaultId);assert.equal(member.registrationMembershipVerified,true);
 assert.equal(reg.chainRootAt1,selected.chainRootAt1);hash(reg.chainRootAt1);assert.notEqual(reg.chainRootAt1,'0'.repeat(64));
 hash(reg.publicKeyHash);hash(reg.fingerprint);assert.equal(policy.market_id,reg.marketId);assert.equal(policy.chain_root_at1,reg.chainRootAt1);
 assert.equal(policy.market,'amm');assert.equal(policy.version,2);assert.equal(policy.execution_scope,'explicit-selected-orders-v1');
 assert.equal(policy.qualified_randomness,false);assert.equal(policy.whole_market_completeness,false);
 assert.equal(policy.sdk_commit,SDK);assert.equal(policy.client_commit,CLIENT);assert.deepEqual(policy.config,config);
 requireCoreDependencyPolicy(policy);
 for(const row of policy.dependency_bindings.filter(row=>[config.assetA,config.assetB,reg.marketId].includes(row.contractId)))assert.equal(row.deployer,issuerId,'fresh issuer must own all QA/market dependencies');
 assert.equal(config.networkMagic,'1384803358401154921');
 assert.ok(Array.isArray(actorsFile.rows)&&actorsFile.rows.length===2);
 assert.deepEqual(actorsFile.rows.map(v=>v.userId).sort((a,b)=>a-b),[issuerId,traderId].sort((a,b)=>a-b));
 actorsFile.rows.forEach(v=>hash(v.publicKeyHash));
 assert.ok(/^[1-9][0-9]*$/.test(m.initialNativeCohortBaseUnits));hash(m.sdkManifestSha256);
 assert.ok(Array.isArray(m.initialActors)&&m.initialActors.length===3);
 assert.deepEqual(m.initialActors.map(v=>v.userId).sort((a,b)=>a-b),[issuerId,traderId,reg.vaultId].sort((a,b)=>a-b));
 for(const row of m.initialActors){hash(row.endUserLeafHash);assert.ok(/^(0|[1-9][0-9]*)$/.test(String(row.nonce)));if(row.unmaterialized!==undefined)assert.equal(typeof row.unmaterialized,'boolean');if(row.endUserLeafHash==='0'.repeat(64)||row.unmaterialized===true){assert.equal(row.endUserLeafHash,'0'.repeat(64));assert.equal(BigInt(row.nonce),0n);assert.equal(row.unmaterialized,true,'zero leaf must be an explicit first-use candidate');}if(row.emptyStateTreeRoot!==undefined)hash(row.emptyStateTreeRoot);}
 for(const symbol of [m.symbolA,m.symbolB])assert.ok(/^[1-9][0-9]*$/.test(String(symbol))&&BigInt(symbol)<2n**32n);
 assert.notEqual(String(m.symbolA),String(m.symbolB));
 const required=[m.journeyPlan??'public/PLAN-v1.json','public/AMM-VAULT-v1.json','public/AMM-SELECTED-v1.json','public/AMM-VAULT-REGISTERED-v1.json','public/ACTORS-v1.json',
  'bound-core-v1/dependencies.json','bound-core-v1/abi.json','bound-core-v1/config.json','bound-core-v1/policy.json','bound-core-v1/asset-a-abi.json','bound-core-v1/asset-b-abi.json',
  m.rpcConfig,m.compactBinary,m.ordinaryBinary,m.runtimeResources,m.sdkManifest];
 assert.ok(m.files&&typeof m.files==='object');for(const name of required){caseFile('/reviewed-case',name);hash(m.files[name]);}
 for(const[name,digest]of Object.entries(m.files)){caseFile('/reviewed-case',name);assert.notEqual(name.split(/[\\/]/)[0],'.secrets','secret bytes never enter the public pin manifest');hash(digest);}
 return {issuerId,traderId};
}
export function planFreshCoreAmmStage(context,stage,terms={}){
 if(!['native_fund_trader','native_claim_trader'].includes(stage))return planCoreAmmStage(context,stage,terms);
 // Reuse the ordinary planner's identity, SDK, network and policy guards even
 // for the two additional Native-only setup operations.
 planCoreAmmStage(context,'sponsor_batch',{nonce:1n});
 const fund=stage==='native_fund_trader';
 return {stage,actorId:fund?context.issuerId:context.traderId,unsigned:true,proofVerified:false,liveAccepted:false,
  contract_calls:[{contract_id:0n,method_name:fund?'transfer':'claim',inputs:fund?[context.traderId,50000000000n]:[context.issuerId]}]};
}
export function assertFreshEnvironment({networkName,networkMagic,marketMagic,resources,pinnedResources}){
 assert.equal(networkName,'testnet');
 assert.equal(BigInt(networkMagic),BigInt(marketMagic),'current network domain changed');
 // Both values are the plain RPC result in lossless representation. An RPC
 // envelope is deliberately not accepted as a second historical format.
 assert.deepEqual(resources,pinnedResources,'runtime verifier resources changed');
}
export function assertFreshActorAnchor({userId,publicKeyHash,expected,leaf,leafHash,registeredIds}){
 assert.ok(Number.isSafeInteger(userId)&&userId>0&&userId<2**24);assert.ok(expected,'reviewed actor anchor required');
 assert.equal(leafHash,expected.hash,'actor changed before proof/sign/send');
 assert.equal(leaf.user_id,BigInt(userId),'actor identity changed before proof/sign/send');
 assert.equal(typeof leaf.nonce,'bigint','lossless actor nonce required');
 assert.equal(leaf.nonce,expected.nonce,'actor nonce changed before proof/sign/send');
 if(leafHash==='0'.repeat(64)){
  // This observation alone is not identity authority. The required Native
  // approvedActor gate authenticates registration/Guta and the actual SDK
  // is_new_user start header before proving/signing and full proof verification
  // before send. Never accept a request-supplied new-user fallback there.
  assert.equal(expected.unmaterialized,true,'explicit first-use observation required');assert.equal(expected.nonce,0n);
  assert.deepEqual(registeredIds,[userId],'unique exact current public registration lookup required');
  assert.equal(leaf.public_key,'0'.repeat(64),'only the frozen SDK synthetic empty leaf is observed');
  for(const name of ['balance','last_checkpoint_id','event_index'])assert.equal(leaf[name],0n,'nonempty first-use field '+name);
  assert.match(leaf.user_state_tree_root??'',/^[a-f0-9]{64}$/);
  if(expected.emptyStateTreeRoot!==undefined)assert.equal(leaf.user_state_tree_root,expected.emptyStateTreeRoot);
 }else assert.equal(leaf.public_key,publicKeyHash,'actor key changed before proof/sign/send');
}
export function assertFreshInitialAnchor(observed,expected){
 assert.ok(observed&&typeof observed==='object'&&!Array.isArray(observed),'initial actor anchor object required');
 assert.deepEqual(Object.keys(observed).sort(),['hash','nonce'],'exact initial anchor fields required');
 assert.match(observed.hash??'',/^[a-f0-9]{64}$/);assert.match(expected?.hash??'',/^[a-f0-9]{64}$/);
 assert.equal(typeof observed.nonce,'bigint','lossless initial actor nonce required');assert.equal(typeof expected.nonce,'bigint');
 assert.ok(observed.nonce>=0n);assert.equal(observed.hash,expected.hash,'initial actor leaf mismatch');assert.equal(observed.nonce,expected.nonce,'initial actor nonce mismatch');
}
export function assertFreshRefundAssets(observed,previous){
 for(const balance of [observed,previous]){assert.ok(balance&&typeof balance==='object'&&!Array.isArray(balance));assert.deepEqual(Object.keys(balance).sort(),['a','b','native'],'exact cohort balance fields required');for(const field of ['native','a','b']){assert.equal(typeof balance[field],'bigint','lossless cohort balance required');assert.ok(balance[field]>=0n);}}
 // Native fees can change between the snapshots. QA assets must be restored
 // exactly, while the final cohort-wide Native conservation check binds fees.
 assert.equal(observed.a,previous.a,'refund changed asset A');assert.equal(observed.b,previous.b,'refund changed asset B');
}
// Inclusion evidence must settle the exact verified core it was produced for.
// Transport ACK, inclusion and an ordinary claim stay distinct; this never
// authorizes a send, re-sign, replacement or a later stage.
export function assertFreshIncludedReceipt(included,core){
 assert.ok(included&&typeof included==='object'&&!Array.isArray(included),'included receipt object required');
 assert.ok(core&&typeof core==='object'&&!Array.isArray(core),'verified core object required');
 assert.equal(included.status,'included');assert.equal(included.receipt?.success,true);
 const d=included.receipt.data;assert.ok(d&&typeof d==='object'&&!Array.isArray(d),'receipt data object required');
 assert.equal(d.status,'included');assert.equal(d.tx_type,'UserEndcap');
 const result=d.result,stats=core.stats;
 assert.ok(result&&typeof result==='object'&&!Array.isArray(result),'receipt result object required');
 assert.ok(stats&&typeof stats==='object'&&!Array.isArray(stats),'verified core stats required');
 // Every compared quantity is a lossless observation; coerced strings/numbers
 // would let a relabelled receipt settle a different core.
 const count=(value,message)=>{assert.equal(typeof value,'bigint',message);assert.ok(value>=0n,message);return value;};
 const owner=count(core.new_user_leaf?.user_id,'lossless core owner required');
 assert.equal(core.state_transition?.user_id,owner);
 assert.equal(count(included.userId,'lossless receipt owner required'),owner);
 assert.equal(count(d.owner_user_id,'lossless receipt data owner required'),owner);
 assert.equal(count(result.user_id,'lossless receipt result owner required'),owner);
 assert.match(core.state_transition.end_user_leaf_hash??'',/^[a-f0-9]{64}$/);
 assert.notEqual(core.state_transition.end_user_leaf_hash,'0'.repeat(64),'an included UPS materializes its actor');
 assert.equal(included.endUserLeafHash,core.state_transition.end_user_leaf_hash);
 assert.match(included.contentHash??'',/^[a-f0-9]{64}$/);assert.equal(included.contentHash,d.content_hash);
 const source=count(core.checkpoint_id,'lossless source checkpoint required'),
  checkpoint=count(included.checkpoint,'lossless inclusion checkpoint required'),
  common=count(included.commonCheckpoint,'lossless common checkpoint required');
 assert.equal(count(d.included_checkpoint_id,'lossless receipt checkpoint required'),checkpoint);
 assert.ok(checkpoint>=source,'receipt predates the verified source checkpoint');
 assert.ok(common>=checkpoint,'common state must observe inclusion');
 for(const name of ['slots_modified','total_transactions','user_ops_processed'])
  assert.equal(count(result[name],'lossless receipt stat '+name),count(stats[name],'lossless core stat '+name),'receipt stats '+name);
 const fee=count(stats.guta_fees_collected,'lossless Guta fee required')+count(stats.da_fees_collected,'lossless DA fee required');
 assert.equal(fee,count(result.fees_collected,'lossless receipt fee required'),'receipt fee differs from the verified core');
 assert.ok(fee<=3000000000n,'one reserved fee ceiling');
 return fee;
}
// A saved confirmation is evidence, not authority to skip work: it must still
// describe the complete declared journey with lossless, bounded fees.
export function assertFreshJourneyOutputs(outputs,{maximumFeePsy}){
 assert.ok(Array.isArray(outputs),'confirmed journey output rows required');
 assert.deepEqual(outputs.map(v=>[v?.stage,v?.type]),FRESH_CORE_AMM_STAGES.map(([stage,kind])=>[stage,kind]),'confirmed journey must cover exactly the declared stage sequence');
 let total=0n;const seen=new Set();
 for(const row of outputs){
  assert.ok(row&&typeof row==='object'&&!Array.isArray(row),'journey output row object required');
  assert.deepEqual(Object.keys(row).sort(),['fee','included','includedSha256','preflight','preflightSha256','request','requestSha256','stage','type'],'exact journey output row fields required');
  assert.equal(typeof row.fee,'bigint','lossless per-stage fee required');
  assert.ok(row.fee>=0n&&row.fee<=3000000000n,'per-stage reserved fee ceiling');
  for(const role of ['request','preflight','included']){assert.ok(typeof row[role]==='string'&&row[role].length>0,'recorded artifact path required');assert.match(row[role+'Sha256']??'',/^[a-f0-9]{64}$/);
   // Uniqueness is lexical, so require one canonical absolute spelling: a
   // '..'/'.'/duplicate-slash alias of an already counted file is not a second
   // stage recording. This is a locally trusted public report, not filesystem
   // or finality authentication: hardlinks and symlink/TOCTOU swaps are not
   // detected here. Only the owned-case realpath checks plus the separate
   // pinned SHA-256 comparison bind the bytes actually read, and those remain
   // point-in-time observations.
   assert.ok(isAbsolute(row[role]),'recorded artifact path must be absolute');
   assert.equal(resolve(row[role]),row[role],'recorded artifact path must be canonical; lexical aliases are not distinct stage evidence');
   // Each declared stage needs its own recording per role; one reused artifact
   // with a matching digest is not evidence of every stage in the journey.
   const key=role+':'+row[role];assert.ok(!seen.has(key),'reused '+role+' artifact across journey stages');seen.add(key);}
  total+=row.fee;
 }
 assert.ok(total<=BigInt(maximumFeePsy)*1000000000n,'declared fee ceiling');
 return total;
}
// A truncated or relabelled confirmation is not evidence of a finished journey.
// This only reads saved public evidence; it never authorizes further work.
export function assertFreshJourneyReport(report,{marketId,vaultId,maximumFeePsy}){
 assert.ok(report&&typeof report==='object'&&!Array.isArray(report),'confirmed journey report object required');
 for(const [field,expected] of [['marketId',marketId],['vaultId',vaultId]]){
  assert.equal(typeof report[field],'bigint','lossless confirmed identity required');
  assert.equal(report[field],BigInt(expected),'confirmed journey identity changed');
 }
 const fees=assertFreshJourneyOutputs(report.outputs,{maximumFeePsy});
 assert.equal(typeof report.totalFees,'bigint','lossless confirmed fee total required');
 assert.equal(report.totalFees,fees,'confirmed report fee total differs from its own rows');
 // The saved report is read back through the lossless codec, so its counters
 // are BigInt. Require that exact representation rather than coercing strings
 // or Numbers into a finished-journey claim.
 for(const field of ['actualSwaps','cancelledOrdersRefunded']){
  assert.equal(typeof report[field],'bigint','lossless confirmed journey counter required');
  assert.equal(report[field],1n,'confirmed journey counter changed');
 }
 assert.equal(report.allKnownOutboxesClaimed,true);assert.equal(report.ordinarySdkClaimsVerified,true);
 assert.equal(report.browserUiAccepted,false);assert.equal(report.qualifiedRandomness,false);assert.equal(report.globalOrderCompleteness,false);
 return fees;
}
// A reused snapshot must still sit on the exact preceding formal vault state,
// not merely at some later checkpoint.
export function assertFreshSnapshotVault(snapshot,vaultId,report){
 assert.ok(snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot),'pinned cohort snapshot required');
 const result=report?.result;assert.ok(result&&typeof result==='object'&&!Array.isArray(result),'exact preceding formal vault result required');
 assert.match(result.endUserLeafHash??'',/^[a-f0-9]{64}$/);
 assert.notEqual(result.endUserLeafHash,'0'.repeat(64),'the preceding formal UPS materializes the vault');
 assert.equal(typeof result.checkpoint,'bigint','lossless formal inclusion checkpoint required');
 assert.equal(typeof snapshot.checkpoint,'bigint','lossless snapshot checkpoint required');
 const leaf=snapshot.userLeaves?.[vaultId];assert.ok(leaf&&typeof leaf==='object','snapshot must record the vault actor leaf');
 assert.equal(leaf.hash,result.endUserLeafHash,'saved snapshot vault leaf differs from the exact preceding formal receipt');
 assert.equal(typeof leaf.nonce,'bigint','lossless snapshot vault nonce required');assert.ok(leaf.nonce>0n,'materialized vault nonce required');
 assert.ok(snapshot.checkpoint>=result.checkpoint,'saved snapshot predates the preceding formal inclusion');
}
export function freshCohortNativeTotal(snapshot){
 return Object.values(snapshot.balances).reduce((n,b)=>n+b.native,0n)+Object.values(snapshot.pending).reduce((n,b)=>n+b.native,0n);
}
// Pure shape/identity checks over recorded cohort observations. The live run and
// the cached completion branch share them so a restart cannot accept a weaker
// audit. Saved observations are not slot Merkle proofs or finality evidence.
export function assertFreshCohortShape(snapshot,ids,config){
 assert.ok(snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot),'saved cohort snapshot object required');
 const keys=value=>Object.keys(value??{}).map(Number).sort((a,b)=>a-b);
 assert.deepEqual(keys(snapshot.balances),ids,'saved cohort balance identities changed');
 assert.deepEqual(keys(snapshot.userLeaves),ids,'saved cohort leaf identities changed');
 const pairs=ids.flatMap(u=>ids.filter(v=>v!==u).map(v=>u+':'+v)).sort();
 assert.deepEqual(Object.keys(snapshot.pending??{}).sort(),pairs,'saved cohort pending identities changed');
 const amount=(value,message)=>{assert.equal(typeof value,'bigint',message);assert.ok(value>=0n,message);return value;};
 amount(snapshot.checkpoint,'lossless cohort snapshot checkpoint required');assert.ok(snapshot.checkpoint>0n,'positive cohort snapshot checkpoint required');
 for(const row of Object.values(snapshot.balances)){assert.deepEqual(Object.keys(row).sort(),['a','b','native'],'exact cohort balance fields required');for(const field of ['native','a','b'])amount(row[field],'lossless cohort balance required');}
 // The frozen driver config decides which outbox assets must have been read.
 // Snapshot keys are untrusted evidence, so a missing or extra FT column is a
 // refusal, never an implicit claim that every outbox was inspected.
 // The in-memory config carries plain Numbers while a lossless round trip
 // returns BigInts. Accept only those two exact integer representations in the
 // non-genesis contract range and canonicalize both to the same BigInt identity
 // before distinctness and key comparison. This is saved-data compatibility, not
 // new configuration trust: strings, floats, unsafe Numbers and objects refuse.
 const assetId=value=>{
  if(typeof value==='bigint')return value;
  assert.ok(typeof value==='number'&&Number.isSafeInteger(value),'frozen cohort asset identity required');
  return BigInt(value);
 };
 const assets=[config?.assetA,config?.assetB].map(assetId);
 for(const id of assets)assert.ok(id>=5n&&id<2n**24n,'frozen cohort asset identity required');
 assert.notEqual(assets[0],assets[1],'distinct frozen cohort assets required');
 const pendingFields=['native',...assets.map(String)].sort();
 for(const row of Object.values(snapshot.pending)){
  assert.ok(row&&typeof row==='object'&&!Array.isArray(row),'saved cohort pending row object required');
  assert.deepEqual(Object.keys(row).sort(),pendingFields,'exact cohort pending asset fields required');
  for(const value of Object.values(row))amount(value,'lossless cohort pending amount required');
 }
 for(const row of Object.values(snapshot.userLeaves)){
  assert.ok(row&&typeof row==='object'&&!Array.isArray(row),'saved cohort actor leaf record required');
  assert.deepEqual(Object.keys(row).sort(),['hash','nonce'],'exact cohort actor leaf fields required');
  assert.match(row.hash??'',/^[a-f0-9]{64}$/,'recorded cohort actor leaf hash required');
  amount(row.nonce,'lossless cohort actor nonce required');
 }
 assert.ok(snapshot.fields&&typeof snapshot.fields==='object'&&!Array.isArray(snapshot.fields),'recorded cohort batch fields required');
 assert.deepEqual(Object.keys(snapshot.fields).sort(),['batch_id','batch_phase','batch_ready'],'exact cohort batch fields required');
 for(const name of ['batch_ready','batch_phase','batch_id'])amount(snapshot.fields[name],'lossless cohort batch field '+name);
 for(const field of ['reserveA','reserveB','totalShares'])amount(snapshot[field],'lossless cohort reserve required');
}
export function assertFreshInitialCohort(initial,manifest){
 assert.equal(freshCohortNativeTotal(initial),BigInt(manifest.initialNativeCohortBaseUnits),'saved initial Native cohort total changed');
 assert.ok(Object.values(initial.pending).every(p=>Object.values(p).every(n=>n===0n)),'fresh cohort has unexpected pending funds');
 assert.equal(initial.reserveA,0n);assert.equal(initial.reserveB,0n);
 for(const row of Object.values(initial.balances)){assert.equal(row.a,0n);assert.equal(row.b,0n);}
 for(const row of manifest.initialActors)assertFreshInitialAnchor(initial.userLeaves[row.userId],{hash:row.endUserLeafHash,nonce:BigInt(row.nonce)});
}
export function assertFreshLpCohort(lp){
 assert.equal(lp.reserveA,20n*UNIT);assert.equal(lp.reserveB,lp.reserveA);assert.equal(lp.totalShares,lp.reserveA);
}
export function assertFreshSwapCohort(swapped,lp,traderId){
 const quote=swapQuote(UNIT,lp.reserveA,lp.reserveB);
 assert.equal(swapped.reserveA,lp.reserveA+UNIT);assert.equal(swapped.reserveB,lp.reserveB-quote);
 assert.equal(swapped.totalShares,lp.totalShares,'swap changed the LP share supply');
 assert.equal(swapped.balances[traderId].b,80n*UNIT+quote);
 return quote;
}
export function assertFreshFinalCohort({after,swapped,fees,manifest,traderId,vaultId}){
 assert.equal(after.reserveA,swapped.reserveA);assert.equal(after.reserveB,swapped.reserveB);
 assert.equal(after.totalShares,swapped.totalShares,'cancellation refund changed the LP share supply');
 assertFreshRefundAssets(after.balances[traderId],swapped.balances[traderId]);
 assert.ok(Object.values(after.pending).every(p=>Object.values(p).every(n=>n===0n)),'owned cohort pending asset remains');
 for(const a of ['a','b'])assert.equal(Object.values(after.balances).reduce((n,b)=>n+b[a],0n),200n*UNIT,'QA supply conservation');
 assert.equal(typeof fees,'bigint','lossless journey fee total required');
 assert.equal(freshCohortNativeTotal(after)+fees,BigInt(manifest.initialNativeCohortBaseUnits),'Native fee conservation');
 assert.equal(after.balances[vaultId].a,after.reserveA);assert.equal(after.balances[vaultId].b,after.reserveB);
}
// snapshot() already records these batch fields, so no extra RPC is needed.
// The generated controller activates once (batch_ready = 1) and never clears
// that marker; finish_batch leaves batch_phase = 3, which commit_batch accepts
// again. Only the pre-activation observation is ready 0 / phase 0 / id 0; each
// later observation follows a finished batch at ready 1 / phase 3 with that
// stage's batch id. There is no idle phase 0 after a finish. This is a recorded
// local observation, not a recheck of unsaved terminal order slots, independent
// finality or slot Merkle authentication.
export function assertFreshCohortPhase(snapshot,{ready,phase,batchId}){
 assert.equal(snapshot.fields.batch_ready,BigInt(ready),'recorded batch activation marker contradicts the declared journey');
 assert.equal(snapshot.fields.batch_phase,BigInt(phase),'recorded batch phase contradicts the declared journey');
 assert.equal(snapshot.fields.batch_id,BigInt(batchId),'recorded batch id contradicts the declared journey');
}
export function assertFreshSavedCohortAudit({manifest,config,issuerId,traderId,vaultId,initial,lp,swapped,after,fees}){
 const ids=[issuerId,traderId,vaultId].map(Number).sort((a,b)=>a-b);
 assert.equal(new Set(ids).size,3,'distinct frozen cohort identities required');
 const ordered=[initial,lp,swapped,after];
 for(const snapshot of ordered)assertFreshCohortShape(snapshot,ids,config);
 for(let i=1;i<ordered.length;i++)assert.ok(ordered[i].checkpoint>ordered[i-1].checkpoint,'saved cohort snapshots must follow the declared chronological order');
 assertFreshInitialCohort(initial,manifest);assertFreshLpCohort(lp);assertFreshSwapCohort(swapped,lp,traderId);
 assertFreshFinalCohort({after,swapped,fees,manifest,traderId,vaultId});
 for(const [snapshot,markers] of [[initial,{ready:0,phase:0,batchId:0}],[lp,{ready:1,phase:3,batchId:1}],
  [swapped,{ready:1,phase:3,batchId:2}],[after,{ready:1,phase:3,batchId:3}]])assertFreshCohortPhase(snapshot,markers);
}
export function freshApprovedActor(userId,publicKeyHash,anchor){
 assert.ok(Number.isSafeInteger(userId)&&userId>0&&userId<2**24);assert.match(publicKeyHash,/^[a-f0-9]{64}$/);assert.notEqual(publicKeyHash,'0'.repeat(64));
 assert.match(anchor?.hash??'',/^[a-f0-9]{64}$/);assert.ok(typeof anchor.nonce==='bigint'&&anchor.nonce>=0n&&anchor.nonce<2n**62n-1n);
 if(anchor.hash==='0'.repeat(64)){assert.equal(anchor.nonce,0n);assert.equal(anchor.unmaterialized,true,'zero approved anchor needs an explicit first-use candidate');}
 return {userId,publicKeyHash,startUserLeafHash:anchor.hash,nextNonce:String(anchor.nonce+1n)};
}
export function assertFreshStagePlan(context,stage,terms,pins,stored){
 const expected={...planFreshCoreAmmStage(context,stage,terms),policySha256:pins.policySha256,dependenciesSha256:pins.dependenciesSha256};
 for(const digest of [pins.policySha256,pins.dependenciesSha256])assert.match(digest??'',/^[a-f0-9]{64}$/);
 assert.deepEqual(parseLosslessJson(losslessJson(stored)),parseLosslessJson(losslessJson(expected)),'persisted ordinary plan differs from exact canonical stage; manual review required');
 return expected;
}
export function assertFreshFormalTask(task,{kind,batchId,plannedTask,currentTask}){
 assert.equal(task.kind,kind);if(batchId!==undefined)assert.equal(task.batchId,String(batchId));
 // A journaled plan is the original approved task, including its original
 // window/checkpoint; a fresh scan cannot replace it during reconciliation.
 const expected=plannedTask??currentTask;assert.ok(expected,'canonical new scan or original journal plan required');
 assert.deepEqual(task,expected,'saved formal task differs from original planned task');
}
export function assertFreshNativeApproval(pre,approvedActor,{validUntilCheckpoint,receiptCheckpoint}){
 // Evidence produced by the pinned Native signer is required in addition to
 // the independent full-proof gate. These public fields do not themselves
 // constitute a proof verifier or independent consensus-finality certificate.
 assert.equal(pre.fullUpsVerified,true);assert.equal(pre.approvalBound,true,'native signer approval gate required');
 const session=pre.approvedActorSession,fresh=pre.approvedActorFreshState;assert.ok(session,'native approved session evidence required');assert.ok(fresh,'native approved freshness evidence required');
 for(const field of ['publicKeyHash','startUserLeafHash'])assert.equal(session[field],approvedActor[field]);
 assert.equal(BigInt(session.userId),BigInt(approvedActor.userId));assert.equal(BigInt(session.nextNonce),BigInt(approvedActor.nextNonce));
 assert.equal(session.isNewUser,approvedActor.startUserLeafHash==='0'.repeat(64));
 assert.match(session.startContextLeafHash??'',/^[a-f0-9]{64}$/);
 if(!session.isNewUser)assert.equal(session.startContextLeafHash,approvedActor.startUserLeafHash);
 assert.equal(fresh.rawMembershipVerified,true,'successful Native raw membership verification required');
 assert.equal(BigInt(fresh.userId),BigInt(approvedActor.userId));assert.equal(fresh.rawUserLeafHash,approvedActor.startUserLeafHash);
 assert.equal(typeof fresh.observedNonce,'string');assert.match(fresh.observedNonce,/^(0|[1-9][0-9]*)$/);
 assert.equal(BigInt(fresh.observedNonce)+1n,BigInt(approvedActor.nextNonce),'successful fresh nonce read differs from approval');
 for(const field of ['userTreeRoot','checkpointGlobalChainRoot'])assert.match(fresh[field]??'',/^[a-f0-9]{64}$/);
 assert.equal(typeof fresh.checkpointId,'bigint','lossless Native freshness checkpoint required');
 assert.ok(fresh.checkpointId>=pre.core.checkpoint_id&&fresh.checkpointId<=BigInt(validUntilCheckpoint),'Native freshness outside original proof/window');
 assert.ok(BigInt(receiptCheckpoint)>=fresh.checkpointId,'receipt predates Native freshness guard');
 assert.equal(fresh.assurance,'freshness relative to observed checkpoint roots; not independent finality authentication');
 assert.equal(pre.core.new_user_leaf.user_id,BigInt(approvedActor.userId));assert.equal(pre.core.new_user_leaf.nonce,BigInt(approvedActor.nextNonce));
 assert.equal(pre.core.new_user_leaf.public_key,approvedActor.publicKeyHash);assert.equal(pre.core.state_transition.start_user_leaf_hash,approvedActor.startUserLeafHash);
}

export async function runFreshCoreAmmJourney(base,{continuationRelease,sponsorContinuationRelease}={}) {
  base=resolve(base);assert.equal(process.env.PSY_QA_OWNED_CASE,base,'external exclusive supervisor required');
  assert.equal(Number(process.env.PSY_QA_OWNER_PID),process.ppid,'one owned supervisor');
  // Adoption is checked before creating the adapter, warming a circuit or
  // starting a signer. The retry itself is deliberately outside this runner.
  const continuation=continuationRelease===undefined?null:validateActivationContinuation(base,continuationRelease);
  const secondary=sponsorContinuationRelease===undefined?null:validateSponsorContinuation(base,sponsorContinuationRelease);
  if(secondary){assert.ok(continuation,'original activation alias must remain validated');assert.equal(secondary.activation.releaseSha256,continuation.releaseSha256,'same original activation release required');}
  const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),root=join(base,'bound-core-v1');
  const manifestFile=join(base,'public/FRESH-JOURNEY-v1.json'),manifestHash=sha256(readFileSync(manifestFile)),manifest=read(manifestFile),
    config=caseFile(base,manifest.rpcConfig),plan=read(caseFile(base,manifest.journeyPlan??'public/PLAN-v1.json')),
    reg=read(join(base,'public/AMM-VAULT-v1.json')),selected=read(join(base,'public/AMM-SELECTED-v1.json')),
    member=read(join(base,'public/AMM-VAULT-REGISTERED-v1.json')),actorsFile=read(join(base,'public/ACTORS-v1.json')),
    policy=read(join(root,'policy.json')),c=read(join(root,'config.json'));
  const identity=validateFreshCoreManifest({manifest,plan,reg,selected,member,actorsFile,policy,config:c});
  const {issuerId,traderId}=identity,binary=caseFile(base,manifest.compactBinary),ordinaryBinary=caseFile(base,manifest.ordinaryBinary),
    pins={compact_market_wallet:manifest.files[manifest.compactBinary],isolated_wallet:manifest.files[manifest.ordinaryBinary]};
  const checkInputs=()=>{assert.equal(sha256(readFileSync(manifestFile)),manifestHash,'frozen journey manifest changed');for(const[p,h]of Object.entries(manifest.files))assert.equal(sha256(readFileSync(caseFile(base,p))),h,'reviewed journey input changed '+p);};checkInputs();
  const contracts=read(join(root,'dependencies.json')),bindings=new Map(contracts.map(b=>[b.contract.contractId,b]));
  const abi=read(join(root,'abi.json')),tokenAbi=read(join(root,'asset-a-abi.json'));
  assert.deepEqual(tokenAbi.contract.methods,read(join(root,'asset-b-abi.json')).contract.methods);
  const context={policy,config:c,marketId:BigInt(reg.marketId),vaultId:BigInt(reg.vaultId),issuerId:BigInt(issuerId),traderId:BigInt(traderId),marketAbi:abi,tokenAbi};
  const sourceLabel=secondary?.sourceLabel??continuation?.sourceLabel??'fresh-core-journey-v1',entry=secondary?fileURLToPath(new URL('./freshCoreAmmSponsorContinuation.mjs',import.meta.url)):continuation?fileURLToPath(new URL('./freshCoreAmmActivationContinuation.mjs',import.meta.url)):fileURLToPath(import.meta.url);
  const sourceCurrent=()=>{checkInputs();if(continuation){assert.equal(sha256(readFileSync(caseFile(base,continuation.releasePath))),continuation.releaseSha256,'continuation release changed');assert.equal(sha256(readFileSync(caseFile(base,continuation.aliasPath))),continuation.aliasSha256,'accepted alias changed');for(const[p,h]of Object.entries({...continuation.release.pins,...continuation.alias.files}))assert.equal(sha256(readFileSync(caseFile(base,p))),h,'continuation artifact changed '+p);}if(secondary){assert.equal(sha256(readFileSync(caseFile(base,secondary.releasePath))),secondary.releaseSha256,'secondary release changed');assert.equal(sha256(readFileSync(caseFile(base,secondary.aliasPath))),secondary.aliasSha256,'secondary alias changed');for(const[p,h]of Object.entries({...secondary.release.pins,...secondary.alias.files}))assert.equal(sha256(readFileSync(caseFile(base,p))),h,'secondary artifact changed '+p);}return freezeAppModules(entry,base,sourceLabel);};sourceCurrent();
  const completed=join(base,'public/FRESH-CORE-JOURNEY-CONFIRMED-v1.json');
  // A saved confirmation is public evidence, not authority to skip the audit.
  // This branch only reads already recorded case files: no RPC, signer, proof,
  // broadcast, fee reserve or new financial attempt, and nothing is recreated
  // or overwritten. Missing or changed audit material stops for explicit review.
  // Terminal contract slots were never saved, so they are not re-checked here;
  // only stored cohort observations and their pinned digests are compared, and
  // those stay local observations, not Merkle/finality authentication.
  const confirmSavedCompletion=()=>{
    const report=exact(completed);
    const fees=assertFreshJourneyReport(report,{marketId:reg.marketId,vaultId:reg.vaultId,maximumFeePsy:plan.maximumFeePsy});
    for(const row of report.outputs)for(const role of ['request','preflight','included'])assert.equal(sha256(readFileSync(freshCaseArtifact(base,row[role]))),row[role+'Sha256'],'confirmed journey artifact changed '+row.stage);
    const savedSnapshot=(label,preceding)=>{
      const file=join(base,'public',label+'-state.json'),bytes=readFileSync(file),snapshot=parseLosslessJson(bytes.toString()),link=exact(file+'.binding.json');
      assert.deepEqual(Object.keys(link).sort(),['precedingFormalSha256','scope','snapshotSha256'],'exact saved snapshot binding fields required');
      assert.equal(link.snapshotSha256,sha256(bytes),'saved cohort snapshot changed '+label);
      const resultBytes=preceding?readFileSync(join(base,'public',preceding+'-result.json')):null;
      assert.equal(link.precedingFormalSha256,preceding?sha256(resultBytes):null,'saved snapshot predecessor binding changed '+label);
      if(preceding)assertFreshSnapshotVault(snapshot,reg.vaultId,parseLosslessJson(resultBytes.toString()));
      return snapshot;
    };
    const [initial,lp,swapped,after]=FRESH_CORE_AMM_SNAPSHOTS.map(([label,preceding])=>savedSnapshot(label,preceding));
    assert.deepEqual(report.initial,initial,'confirmed report initial snapshot differs from the saved cohort snapshot');
    assert.deepEqual(report.after,after,'confirmed report final snapshot differs from the saved cohort snapshot');
    assertFreshSavedCohortAudit({manifest,config:c,issuerId,traderId,vaultId:reg.vaultId,initial,lp,swapped,after,fees});
    console.log('FRESH_CORE_JOURNEY_ALREADY_CONFIRMED');
  };
  if(existsSync(completed)){confirmSavedCompletion();return;}
  const budget=join(base,'budget-v1');mkdirSync(budget,{recursive:true});
  const reserve=(name,kind)=>{
    assert.ok(FRESH_CORE_AMM_STAGES.some(([n,k])=>n===name&&k===kind),'only declared journey stages may execute');
    assert.ok(Date.now()-Date.parse(plan.createdAt)<plan.maximumWallSeconds*1000,'case wall budget exhausted');sourceCurrent();
    const file=join(budget,name+'.json');if(!existsSync(file)){
      const names=readdirSync(budget).filter(n=>n.endsWith('.json'));assert.ok(names.length<20,'declared 20-stage ceiling');
      assert.ok(BigInt(names.length+1)*3000000000n<=BigInt(plan.maximumFeePsy)*1000000000n,'fee reserve ceiling');
      save(file,{stage:name,kind,maximumFeeReserveBaseUnits:'3000000000',automaticRetry:false});
    }
  };
  const env={PSY_NETWORK:'testnet',PSY_MARKET_TESTNET_PROFILE:'sdk-audit-20261102-v1',PSY_EXPECTED_CHAIN_ROOT:reg.chainRootAt1,PSY_REQUIRE_ORDINARY_APPROVAL:'1',RAYON_NUM_THREADS:'2'};
  const fresh=async()=>{sourceCurrent();const s=await publicState(config);assertFreshEnvironment({networkName:s.networkName,networkMagic:s.network.magic,marketMagic:c.networkMagic,resources:await s.rpc(s.network.prove_proxy_url[0],'psy_get_circuits_data',{}, {exactIntegers:true}),pinnedResources:exact(caseFile(base,manifest.runtimeResources))});assert.equal((await s.rpc(s.coordinator,'psy_get_checkpoint_leaf_data',{checkpoint_id:1})).global_chain_root,reg.chainRootAt1);for(const b of contracts)assert.deepEqual(await binding(s,b.contract.contractId),b);return s;};
  const actors=new Map(actorsFile.rows.map(v=>[v.userId,v]));
  const sdkManifest=caseFile(base,manifest.sdkManifest),sdkSha256=sha256(readFileSync(sdkManifest)),workers=new Map();assert.equal(sdkSha256,manifest.sdkManifestSha256);
  const worker=async id=>{
    assert.ok(actors.has(id));if(!workers.has(id))workers.set(id,await ordinaryResident({binary:ordinaryBinary,binarySha256:pins.isolated_wallet,
      config,dependencies:join(root,'dependencies.json'),secret:join(base,'.secrets',id===issuerId?'issuer.json':'trader.json'),
      publicKeyHash:actors.get(id).publicKeyHash,sdkManifest,sdkSha256,env}));return workers.get(id);
  };
  const asset=id=>{const b=bindings.get(id).contract;return {contractId:id,codeRoot:b.codeRoot,layoutRoot:b.layoutRoot,abi:join(root,id===c.assetA?'asset-a-abi.json':'asset-b-abi.json')};};
  const marketBinding=bindings.get(reg.marketId).contract;
  const options=validateOptions({kind:'amm',profile:'amm-core-dependency-bound-v1',network:'testnet',testnetProfile:env.PSY_MARKET_TESTNET_PROFILE,
    chainRootAt1:reg.chainRootAt1,contractId:reg.marketId,vaultId:reg.vaultId,publicKeyHash:reg.publicKeyHash,fingerprint:reg.fingerprint,
    codeRoot:marketBinding.codeRoot,layoutRoot:marketBinding.layoutRoot,wallet:binary,walletSha256:pins.compact_market_wallet,rpcConfig:config,
    abi:join(root,'abi.json'),driverConfig:join(root,'config.json'),policy:join(root,'policy.json'),dependencyBindings:join(root,'dependencies.json'),
    runtimeDirectory:join(base,'runtime-core-v1'),batchSponsorId:issuerId,activationPayerId:traderId,automaticInitialize:true,batchMemberLimit:1,
    batchExpiryCheckpoints:1024,proverThreads:2,proverMode:'resident',users:[traderId],assetA:asset(c.assetA),assetB:asset(c.assetB)});
  const optionsFile=join(base,'public/core-executor-v1.json');if(existsSync(optionsFile))assert.deepEqual(read(optionsFile),options);else save(optionsFile,options);
  const adapter=await createPublicWalletAdapter(options,{runDriver:promisify(execFile)}),journal=new ExecutionJournal({directory:options.runtimeDirectory,network:options.network,vaultId:reg.vaultId,fingerprint:reg.fingerprint});
  const outputs=[],anchors=new Map();
  const checkActorAnchor=async(s,id)=>{
    const realm=s.network.realm_configs.find(r=>r.id===Math.floor(id/s.network.users_per_realm))?.rpc_url[0];assert.ok(realm,'actor realm is configured');
    const publicKeyHash=id===reg.vaultId?reg.publicKeyHash:actors.get(id).publicKeyHash;
    const [leaf,leafHash]=await Promise.all([s.rpc(realm,'psy_get_user_leaf_data',{checkpoint_id:s.checkpoint,user_id:id},{exactIntegers:true}),s.rpc(realm,'psy_get_user_tree_leaf_hash',{checkpoint_id:s.checkpoint,user_id:id})]);
    const registeredIds=leafHash==='0'.repeat(64)?await s.userIds(publicKeyHash):undefined;
    assertFreshActorAnchor({userId:id,publicKeyHash,expected:anchors.get(id),leaf,leafHash,registeredIds});
  };
  const unresolved=async()=>{await journal.reconcile(adapter.reconcile);assert.equal((await journal.unresolved()).length,0,'unknown vault result; stop before any other financial operation');};
  const auditReceipt=(included,pre)=>{
    const core=pre.core,owner=Number(core.new_user_leaf.user_id),anchor=anchors.get(owner);assert.ok(anchor,'known actor state chain required');
    assert.equal(core.state_transition.start_user_leaf_hash,anchor.hash);assert.equal(core.new_user_leaf.nonce,anchor.nonce+1n);
    assert.equal(core.new_user_leaf.public_key,owner===reg.vaultId?reg.publicKeyHash:actors.get(owner).publicKeyHash);
    const fee=assertFreshIncludedReceipt(included,core);
    anchors.set(owner,{hash:core.state_transition.end_user_leaf_hash,nonce:core.new_user_leaf.nonce});return fee;
  };
  const ordinaryStep=async(name,stage,terms={})=>{
    sourceCurrent();
    const stagePins={policySha256:sha256(readFileSync(options.policy)),dependenciesSha256:sha256(readFileSync(options.dependencyBindings))},expected={...planFreshCoreAmmStage(context,stage,terms),...stagePins};
    const planFile=join(base,'public',name+'-plan.json');
    // Cheap digest rechecks against the original stage pins, repeated across
    // async work. A changed resource is rejected, never silently adopted.
    const recheckPins=()=>{assert.equal(sha256(readFileSync(options.policy)),stagePins.policySha256,'pinned policy changed during the stage; review rather than adopt new pins');
      assert.equal(sha256(readFileSync(options.dependencyBindings)),stagePins.dependenciesSha256,'pinned dependencies changed during the stage; review rather than adopt new pins');};
    // Check complete saved semantics before reconciliation RPC, signer startup,
    // proof or transmission. Changed restart terms require explicit review.
    if(existsSync(planFile))assertFreshStagePlan(context,stage,terms,stagePins,exact(planFile));
    await unresolved();recheckPins();reserve(name,'ordinary');const actualName=secondary&&name===SPONSOR_ORIGINAL?secondary.replacementLabel:continuation&&name===ACTIVATION_ORIGINAL?continuation.replacementLabel:name;
    const out=join(base,'attempts',actualName);
    // A missing original plan is never reconstructed. Any surviving attempt or
    // public input, under the original or the continuation alias label, is
    // prior work that requires manual review before a new save or request.
    if(!existsSync(planFile)){
      assert.ok(!existsSync(out)&&!existsSync(join(base,'public',name+'.json'))&&!existsSync(join(base,'public',actualName+'.json')),
        'missing original saved plan; review rather than reconstruct');
      save(planFile,expected);
    }
    const unsigned=exact(planFile),id=Number(unsigned.actorId);assert.equal(unsigned.stage,stage);assert.ok(actors.has(id));
    assertFreshStagePlan(context,stage,terms,stagePins,unsigned);
    const approvedActor=freshApprovedActor(id,actors.get(id).publicKeyHash,anchors.get(id));
    if(existsSync(out)){if(!existsSync(join(out,'included.json')))await confirmUps(config,out,{polls:24,intervalMs:5000});}
    else {assert.ok(!existsSync(join(base,'public',name+'.json')),'partial ordinary input; review rather than re-sign');await checkActorAnchor(await fresh(),id);recheckPins();await ordinary({base,config,binary:ordinaryBinary,secret:join(base,'.secrets',id===issuerId?'issuer.json':'trader.json'),name,calls:unsigned.contract_calls,bindings,env,expectedActor:approvedActor,worker:await worker(id)});}
    recheckPins();
    const included=exact(join(out,'included.json')),pre=exact(join(out,'preflight.json')),inputPath=join(base,'public',actualName+'.json'),inputBytes=readFileSync(inputPath),input=parseLosslessJson(inputBytes.toString()),request=exact(join(out,'request.json')),intent=exact(join(out,'intent.json'));
    assert.equal(pre.fullUpsVerified,true);assert.equal(Number(included.userId),id);assert.equal(pre.inputSha256,sha256(inputBytes));
    assert.deepEqual(input.approvedActor,parseLosslessJson(JSON.stringify(approvedActor)),'native approved actor input changed');
    assertFreshNativeApproval(pre,approvedActor,{validUntilCheckpoint:input.validUntilCheckpoint,receiptCheckpoint:included.checkpoint});
    assert.deepEqual(input.calls.contract_calls,unsigned.contract_calls);assert.deepEqual(request.user_ec_input.core,pre.core);
    assert.equal(intent.endUserLeafHash,pre.core.state_transition.end_user_leaf_hash);assert.equal(intent.userId,BigInt(id));assert.equal(intent.nonce,pre.core.new_user_leaf.nonce);
    const row={stage:name,type:'ordinary',request:join(out,'request.json'),preflight:join(out,'preflight.json'),included:join(out,'included.json'),fee:auditReceipt(included,pre)};
    for(const role of ['request','preflight','included'])row[role+'Sha256']=sha256(readFileSync(row[role]));outputs.push(row);
    console.log('CORE_INCLUDED',name,String(included.checkpoint));
  };
  const formalStep=async(name,kind,batchId)=>{
    reserve(name,'formal-core');await journal.reconcile(adapter.reconcile);
    const taskFile=join(base,'public',name+'-task.json'),reportFile=join(base,'public',name+'-result.json');
    if(!existsSync(reportFile)){
      if((await journal.unresolved()).length){for(let i=0;i<24&&(await journal.unresolved()).length;i++){await new Promise(r=>setTimeout(r,5000));await journal.reconcile(adapter.reconcile);}await unresolved();}
      const hasTask=existsSync(taskFile),task=hasTask?read(taskFile):(await adapter.scan()).action;assert.ok(task,'no expected core task');
      const recordsBefore=await journal.records(),plannedTask=recordsBefore.find(r=>r.status==='planned'&&JSON.stringify(r.task)===JSON.stringify(task))?.task;
      const currentTask=plannedTask?undefined:hasTask?(await adapter.scan()).action:task;
      assertFreshFormalTask(task,{kind,batchId,plannedTask,currentTask});
      if(!existsSync(taskFile))save(taskFile,task);
      const result=await journal.execute({task,...adapter,
        isCurrent:async t=>{await checkActorAnchor(await fresh(),reg.vaultId);return adapter.isCurrent(t);},
        prepareSubmission:async(t,proof)=>{const pre=exact(join(proof.preparedDirectory,'preflight.json')),anchor=anchors.get(reg.vaultId);assert.equal(pre.core.state_transition.start_user_leaf_hash,anchor.hash,'prepared proof starts outside reviewed vault state chain');assert.equal(pre.core.new_user_leaf.nonce,anchor.nonce+1n);return adapter.prepareSubmission(t,proof);},
      });
      for(let i=0;i<24;i++){
        await journal.reconcile(adapter.reconcile);const records=await journal.records(),last=latestBroadcastOutcome(records,result.taskId);
        if(last?.status==='not-submitted')throw Error('formal pre-send rejection; inspect exact prepared request, never automatically re-prove');
        if(last?.status==='included'){
          const proof=records.findLast(r=>r.taskId===result.taskId&&r.status==='broadcast-intent').proof;
          save(reportFile,{taskId:result.taskId,task,proof,result:last.result});break;
        }
        await new Promise(r=>setTimeout(r,5000));
      }
      assert.ok(existsSync(reportFile),'exact formal broadcast remains unknown; no replacement');
    }
    const report=exact(reportFile),saved=read(reportFile),out=report.proof.preparedDirectory,pre=exact(join(out,'preflight.json')),records=await journal.records();
    assert.equal(saved.task.kind,kind);if(batchId!==undefined)assert.equal(saved.task.batchId,String(batchId));assert.deepEqual(read(taskFile),saved.task);
    const historic=records.findLast(r=>r.taskId===saved.taskId&&r.status==='included');assert.ok(historic,'confirmed task journal entry required');assert.deepEqual(historic.result,saved.result);
    const planned=records.find(r=>r.taskId===saved.taskId&&r.status==='planned'),broadcast=records.findLast(r=>r.taskId===saved.taskId&&r.status==='broadcast-intent');
    assertFreshFormalTask(saved.task,{kind,batchId,plannedTask:planned?.task});assert.ok(broadcast,'original formal broadcast evidence required');assert.deepEqual(saved.proof,broadcast.proof,'report proof differs from exact original broadcast');
    const manifest=read(join(out,'prepared.json'));assert.equal(sha256(readFileSync(join(out,'prepared.json'))),saved.proof.manifestSha256);
    assert.equal(sha256(readFileSync(join(out,'request.json'))),manifest.requestSha256);assert.equal(sha256(readFileSync(join(out,'preflight.json'))),manifest.preflightSha256);
    assert.deepEqual(exact(join(out,'request.json')).user_ec_input.core,pre.core);
    assert.equal(pre.fullUpsVerified,true);assert.equal(pre.exactStackAndSessionVerified,true);
    assertCoreDependencyEvidence(pre,{openingBytes:readFileSync(join(out,'dependency-opening.json'))});
    const row={stage:name,type:'formal-core',request:join(out,'request.json'),preflight:join(out,'preflight.json'),included:reportFile,fee:auditReceipt(report.result,pre)};
    for(const role of ['request','preflight','included'])row[role+'Sha256']=sha256(readFileSync(row[role]));outputs.push(row);
    console.log('CORE_INCLUDED',name,String(report.result.checkpoint));
  };
  const snapshot=async(label,precedingFormal)=>{
    const p=join(base,'public',label+'-state.json'),link=p+'.binding.json',reportPath=precedingFormal?join(base,'public',precedingFormal+'-result.json'):null,report=reportPath?exact(reportPath):null,reportSha256=reportPath?sha256(readFileSync(reportPath)):null;
    if(existsSync(p)){const v=exact(p),b=read(link);assert.equal(b.snapshotSha256,sha256(readFileSync(p)));assert.equal(b.precedingFormalSha256,reportSha256);if(report)assertFreshSnapshotVault(v,reg.vaultId,report);return v;}
    const s=await fresh(),ids=[issuerId,traderId,reg.vaultId],assets=[c.assetA,c.assetB],balances={},pending={},userLeaves={};
    const realm=s.network.realm_configs.find(r=>r.id===Math.floor(reg.vaultId/s.network.users_per_realm)).rpc_url[0];
    if(report)assert.equal(await s.rpc(realm,'psy_get_user_tree_leaf_hash',{checkpoint_id:s.checkpoint,user_id:reg.vaultId}),report.result.endUserLeafHash,'cannot recreate a historical snapshot after a later vault mutation');
    const amount=async(u,a,o)=>decodeAmount(await Promise.all([s.slot(u,a,o),s.slot(u,a,o+1)]));
    for(const u of ids){const r=s.network.realm_configs.find(r=>r.id===Math.floor(u/s.network.users_per_realm)).rpc_url[0],leaf=await s.rpc(r,'psy_get_user_leaf_data',{checkpoint_id:s.checkpoint,user_id:u},{exactIntegers:true}),leafHash=await s.rpc(r,'psy_get_user_tree_leaf_hash',{checkpoint_id:s.checkpoint,user_id:u});
      userLeaves[u]={hash:leafHash,nonce:leaf.nonce};const publicKeyHash=u===reg.vaultId?reg.publicKeyHash:actors.get(u).publicKeyHash,initial=manifest.initialActors.find(a=>a.userId===u);
      assertFreshActorAnchor({userId:u,publicKeyHash,expected:{...userLeaves[u],unmaterialized:initial.unmaterialized,emptyStateTreeRoot:initial.emptyStateTreeRoot},leaf,leafHash,registeredIds:leafHash==='0'.repeat(64)?await s.userIds(publicKeyHash):undefined});
      balances[u]={native:await s.slot(u,0,0),a:await amount(u,c.assetA,0),b:await amount(u,c.assetB,0)};
      for(const v of ids)if(u!==v){pending[u+':'+v]={native:await s.slot(u,0,3+2*v)-await s.slot(v,0,4+2*u)};
        for(const a of assets)pending[u+':'+v][a]=await amount(u,a,33554453+4*v)-await amount(v,a,33554455+4*u);
        assert.ok(Object.values(pending[u+':'+v]).every(n=>n>=0n));}}
    const pair=async name=>{const off=abi.contract.state.find(f=>f.name===name).offset;return amount(reg.vaultId,reg.marketId,off);};
    const fields=await s.fields(reg.vaultId,reg.marketId,abi,['batch_ready','batch_phase','batch_id']);
    const result={checkpoint:s.checkpoint,balances,pending,fields,userLeaves,reserveA:await pair('reserve_a'),reserveB:await pair('reserve_b'),totalShares:await pair('total_shares')};
    if(report)assertFreshSnapshotVault(result,reg.vaultId,report);
    save(p,result);save(link,{snapshotSha256:sha256(readFileSync(p)),precedingFormalSha256:reportSha256,scope:'Pinned RPC observation after exact preceding included UPS, while its vault end leaf is unchanged (initial snapshot has no predecessor); not independently verified slot Merkle proofs'});return result;
  };
  try {
    await fresh();await unresolved();const before=await snapshot('fresh-initial-v1');assertFreshInitialCohort(before,manifest);
    for(const row of manifest.initialActors)anchors.set(row.userId,{...before.userLeaves[row.userId],unmaterialized:row.unmaterialized,emptyStateTreeRoot:row.emptyStateTreeRoot});
    await adapter.warm();
    await ordinaryStep('fresh-native-send-v1','native_fund_trader');await ordinaryStep('fresh-native-claim-v1','native_claim_trader');
    await ordinaryStep('core-issuer-setup-v1','issuer_setup',{symbolA:BigInt(manifest.symbolA),symbolB:BigInt(manifest.symbolB)});
    await ordinaryStep('core-trader-assets-v1','trader_claim_assets');
    await ordinaryStep('core-activation-fund-v1','activation_funding');
    await formalStep('core-activate-v1','batch_maintenance');
    let s=await fresh();await ordinaryStep('core-lp-open-v1','lp_open',{deadline:secondary?.lpDeadline??BigInt(s.checkpoint+4096)});
    await ordinaryStep('core-lp-sponsor-v1','sponsor_batch',{nonce:1n});
    await formalStep('core-lp-commit-v1','batch_commit',1);await formalStep('core-lp-settle-v1','batch_settle',1);
    const lp=await snapshot('core-after-lp-v1','core-lp-settle-v1');assertFreshLpCohort(lp);
    s=await fresh();let quote=swapQuote(10n**18n,lp.reserveA,lp.reserveB);
    await ordinaryStep('core-swap-open-v1','swap_open',{deadline:BigInt(s.checkpoint+4096),minOut:quote*99n/100n,reserveA:lp.reserveA,reserveB:lp.reserveB,quote});
    await ordinaryStep('core-swap-sponsor-v1','sponsor_batch',{nonce:2n});
    await formalStep('core-swap-commit-v1','batch_commit',2);await formalStep('core-swap-settle-v1','batch_settle',2);
    await ordinaryStep('core-swap-claim-v1','swap_claim_close');const swapped=await snapshot('core-after-swap-v1','core-swap-settle-v1');
    assertFreshSwapCohort(swapped,lp,traderId);
    s=await fresh();quote=swapQuote(10n**18n,swapped.reserveA,swapped.reserveB);
    await ordinaryStep('core-cancel-open-v1','cancelled_swap_open',{deadline:BigInt(s.checkpoint+4096),minOut:quote*99n/100n,reserveA:swapped.reserveA,reserveB:swapped.reserveB,quote});
    await ordinaryStep('core-cancel-sponsor-v1','sponsor_batch',{nonce:3n});
    await formalStep('core-cancel-commit-v1','batch_commit',3);await formalStep('core-cancel-settle-v1','batch_settle',3);
    s=await fresh();const nativePending=await s.slot(reg.vaultId,0,3+2*traderId)-await s.slot(traderId,0,4+2*reg.vaultId);
    await ordinaryStep('core-refund-claim-v1','refund_claim_close',{observedNativePending:nativePending});
    const after=await snapshot('fresh-final-v1','core-cancel-settle-v1');
    const fees=assertFreshJourneyOutputs(outputs,{maximumFeePsy:plan.maximumFeePsy});
    assertFreshSavedCohortAudit({manifest,config:c,issuerId,traderId,vaultId:reg.vaultId,initial:before,lp,swapped,after,fees});
    // Terminal contract slots are live RPC observations that are never saved,
    // so the cached completion branch cannot and does not re-check them.
    const terminalState=await fresh(),offset=n=>abi.contract.state.find(f=>f.name===n).offset;
    assert.equal(await terminalState.slot(reg.vaultId,reg.marketId,offset('consumed')+traderId),3n);assert.equal(await terminalState.slot(traderId,reg.marketId,offset('kind')),0n);
    assert.equal(outputs.filter(v=>v.type==='ordinary').length,13);assert.equal(outputs.filter(v=>v.type==='formal-core').length,7);
    save(completed,{at:new Date().toISOString(),marketId:reg.marketId,vaultId:reg.vaultId,outputs,totalFees:fees,initial:before,actualSwaps:1,cancelledOrdersRefunded:1,allKnownOutboxesClaimed:true,
      ordinarySdkClaimsVerified:true,browserUiAccepted:false,qualifiedRandomness:false,globalOrderCompleteness:false,after,
      boundary:'Current-chain selected-order deterministic AMM and ordinary SDK wallets only; no browser/UI, global inclusion, randomized ordering, performance comparison or production claim.'});
    console.log('FRESH_CORE_JOURNEY_CONFIRMED',outputs.length,String(fees));
  } finally {await adapter.close();for(const w of workers.values())await w.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){assert.equal(process.argv.length,3,'OWNED_QA_CASE');await runFreshCoreAmmJourney(process.argv[2]);}
