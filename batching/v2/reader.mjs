import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {publicState} from '../../executor/publicState.mjs';
import {readTogether,mapReads} from '../../executor/readConcurrency.mjs';
import {losslessJson,parseLosslessJson,decodeAmount,FEE_ESCROW} from '../../amm/u124/client.mjs';
import {members} from './controller.mjs';
import {timeCompare,bookCompare,settlementFields,validFunding,isLive,operation} from './planner.mjs';
import {witness,signingRequest,operationCalls} from './policy.mjs';
export async function loadBatchFiles(options){const [abi,config,policy]=await Promise.all([options.abi,options.driverConfig,options.policy].map(async p=>JSON.parse(await readFile(p,'utf8'))));assert.equal(policy.version,2);assert.equal(policy.market,options.kind);assert.equal(policy.market_id,options.contractId);assert.equal(typeof config.networkMagic,'string');return {abi,config,policy};}
export async function scanBatch(options,readState=publicState,files){
 const s=await readState(options.rpcConfig);files??=await loadBatchFiles(options);const {abi,config,policy}=files,market=options.kind,V=options.vaultId;
 const fields=new Map(abi.contract.state.map(f=>[f.name,f]));
 const scalar=async(u,name,index=0)=>{const f=fields.get(name);assert.ok(f,`missing batch ABI field ${name}`);assert.ok(Number.isSafeInteger(index)&&index>=0);return s.slot(u,options.contractId,f.offset+index);};
 const pair=async(u,name,index)=>{const f=fields.get(name);assert.ok(f,`missing pair ${name}`);const o=f.offset+(index===undefined?0:2*index);return decodeAmount(await readTogether([s.slot(u,options.contractId,o),s.slot(u,options.contractId,o+1)]));};
 const frozenPair=async(name,i)=>decodeAmount(await readTogether([scalar(V,`frozen_${name}_lo`,i),scalar(V,`frozen_${name}_hi`,i)]));
 const backpressure=async fields=>{
  if(market!=='nftmarket')return null;const normalized=[...fields];if(normalized[73]===0n)normalized[73]=1000000000n;
  for(const c of operationCalls(policy,normalized))if(c.contract_id===BigInt(config.nftId)&&c.method_name==='transfer'){
   const recipient=Number(c.inputs[1]),[sent,claimed]=await readTogether([s.slot(V,config.nftId,1182+35*recipient+32),s.slot(recipient,config.nftId,1182+35*V+33)]);assert.ok(sent>=claimed,'NFT receipt cursor');if(sent-claimed>=4n)return 'nft-delivery-backpressure';
  }return null;
 };
 const [phase,batch,expiry,cutoff]=await readTogether(['batch_phase','batch_id','batch_expiry','batch_cutoff'].map(n=>scalar(V,n)));
 const task=(kind,f,extra={})=>({kind,batchId:f[1].toString(),...extra,submission:losslessJson(signingRequest(policy,f))});
 if(phase===2n)throw Error('persisted executing phase violates atomic batch protocol');
 assert.ok([0n,1n,3n,4n].includes(phase),'unknown batch phase');
 if(phase===1n){
  if(BigInt(s.checkpoint)>expiry)return {checkpoint:s.checkpoint,phase,batch,action:task('batch_expire',witness({mode:3,batch,burn:0n}))};
  const rows=await mapReads([0,1,2,3],async i=>{const row={index:i,owner:await scalar(V,'frozen_owner',i),done:await scalar(V,'batch_done',i)};
   for(const[n,width]of Object.entries(members(market)))row[n]=width===2?await frozenPair(n,i):await scalar(V,`frozen_${n}`,i);
   for(const n of ['paid_a','paid_b'])row[n]=await frozenPair(n,i);row.fee_delta=await scalar(V,'frozen_fee_delta',i);row.fee_sent=await scalar(V,'frozen_fee_sent',i);
   if(market==='nftmarket')for(const n of ['nft_sent','nft_claimed','nft_matches'])row[n]=await scalar(V,`frozen_${n}`,i);
   if(market==='amm'&&row.owner>0n)row.ownedShares=await pair(V,'shares',Number(row.owner));return row;});
  const pool={};if(market==='amm')for(const n of ['reserve_a','reserve_b','total_shares'])pool[n]=await pair(V,n);
  if(market==='bondingcurve'){for(const n of ['phase','sold_lots'])pool[n]=await scalar(V,n);pool.quote_reserve=await pair(V,'quote_reserve');}
  const root=await readTogether([0,1,2,3].map(i=>scalar(V,'batch_root',i)));
  // Later deposits or token cancellations cannot alter a frozen candidate.
  // Wait for expiry and refreeze rather than repeatedly producing invalid UPSs.
  for(const o of rows.filter(o=>o.owner>0n&&o.done===0n)){
   const user=Number(o.owner),assets=market==='nftmarket'?[[config.tokenId,'settled_payment',o.paid_a]]:[[config.assetA,'settled_a',o.paid_a],[config.assetB,'settled_b',o.paid_b]];
   for(const[asset,name,paid]of assets){const [sent,claimed,base]=await readTogether([readTogether([s.slot(user,asset,33554453+4*V),s.slot(user,asset,33554454+4*V)]).then(decodeAmount),readTogether([s.slot(V,asset,33554455+4*user),s.slot(V,asset,33554456+4*user)]).then(decodeAmount),pair(V,name,user)]);if(claimed!==base||sent-base!==paid)return {checkpoint:s.checkpoint,phase,batch,action:null,reason:'frozen-funding-drift-awaiting-expiry'};}
   const [sent,claimed,base]=await readTogether([s.slot(user,0,3+2*V),s.slot(V,0,4+2*user),scalar(V,'settled_fee',user)]);if(sent!==o.fee_sent||claimed!==base||sent-base!==o.fee_delta)return {checkpoint:s.checkpoint,phase,batch,action:null,reason:'frozen-funding-drift-awaiting-expiry'};
   if(market==='nftmarket'){const [ns,nc]=await readTogether([s.slot(user,config.nftId,1182+35*V+32),s.slot(V,config.nftId,1182+35*user+33)]);if(ns!==o.nft_sent||nc!==o.nft_claimed)return {checkpoint:s.checkpoint,phase,batch,action:null,reason:'frozen-nft-drift-awaiting-expiry'};}
  }
  const f=settlementFields({market,policy,config,rows,pool,cutoff,batch,root});const blocked=await backpressure(f);if(blocked)return {checkpoint:s.checkpoint,phase,batch,action:null,reason:blocked};
  // Once frozen, usersFile is irrelevant: a restart always reconstructs the
  // exact on-chain set, including closed listing references and refund rows.
  return {checkpoint:s.checkpoint,phase,batch,root,rows,action:task('batch_settle',f)};
 }
 // Idle discovery is a hint set. Matching and terminal outcomes are verified
 // again from the canonical committed rows, never from these RPC objects.
 const funding=async owner=>{
  const assets=market==='nftmarket'?[[config.tokenId,'settled_payment']]:[[config.assetA,'settled_a'],[config.assetB,'settled_b']],paid=[];const cursor=[];
  for(const[asset,name]of assets){const [sent,claimed,base]=await readTogether([readTogether([s.slot(owner,asset,33554453+4*V),s.slot(owner,asset,33554454+4*V)]).then(decodeAmount),readTogether([s.slot(V,asset,33554455+4*owner),s.slot(V,asset,33554456+4*owner)]).then(decodeAmount),pair(V,name,owner)]);assert.equal(claimed,base,'asset recovery cursor drift');assert.ok(sent>=base,'asset cumulative cursor');paid.push(sent-base);cursor.push(sent.toString(),base.toString());}
  const [sent,claimed,base]=await readTogether([s.slot(owner,0,3+2*V),s.slot(V,0,4+2*owner),scalar(V,'settled_fee',owner)]);assert.equal(claimed,base,'native cursor drift');assert.ok(sent>=base,'native cumulative cursor');cursor.push(sent.toString(),base.toString());
  return {paid_a:paid[0],paid_b:paid[1]??0n,fee_delta:sent-base,fee_sent:sent,maintenanceCursor:cursor.join(':')};
 };
 const orderCache=new Map();const getOrder=owner=>{owner=Number(owner);if(!orderCache.has(owner))orderCache.set(owner,(async()=>{
  const data=Object.fromEntries(await readTogether(Object.entries(members(market)).map(async([name,width])=>[name,width===2?await pair(owner,name):await scalar(owner,name)])));
  return {owner:BigInt(owner),...data,consumed:await scalar(V,'consumed',owner),done:0n};
 })());return orderCache.get(owner);};
 const discovered=await mapReads(options.users,getOrder),available=discovered.filter(o=>o.kind!==0n&&o.pool===BigInt(V)&&o.nonce>o.consumed).sort(timeCompare);
 const ready=await scalar(V,'batch_ready');assert.ok(ready===0n||ready===1n,'batch readiness marker');
 const maintenance=(name,args,cursor)=>task('batch_maintenance',witness({mode:4,operations:[operation(policy,name,args)],burn:0n}),{maintenanceCursor:cursor});
 if(ready===0n){
  if(!options.automaticInitialize)return {checkpoint:s.checkpoint,phase,batch,action:null,reason:'activation-required'};
  const payer=options.activationPayerId??config.issuer??options.batchSponsorId;assert.ok(Number.isSafeInteger(payer)&&payer>0,'activation payer');const f=await funding(payer);
  const wantedB=market==='nftmarket'?0n:1n;
  if(f.fee_delta!==FEE_ESCROW||f.paid_a!==1n||f.paid_b!==wantedB)return {checkpoint:s.checkpoint,phase,batch,action:null,reason:'activation-seeds-required',payer};
  if(market==='nftmarket'){
   if(!s.contractStateRoot)return {checkpoint:s.checkpoint,phase,batch,action:null,reason:'activation-payer-nft-state-check-required',payer};
   if(await s.contractStateRoot(payer,config.nftId)==='0'.repeat(64))return {checkpoint:s.checkpoint,phase,batch,action:null,reason:'activation-payer-nft-initialization-required',payer,initializationRequest:{userId:payer,contractId:config.nftId,positiveNftBalanceRequired:true,chooseExistingHolder:true,ordinaryOwnerSignatureRequired:true}};
   if(await s.slot(payer,config.nftId,0)===0n)return {checkpoint:s.checkpoint,phase,batch,action:null,reason:'activation-payer-nft-holder-required',payer,initializationRequest:{userId:payer,contractId:config.nftId,positiveNftBalanceRequired:true,chooseExistingHolder:true}};
  }
  return {checkpoint:s.checkpoint,phase,batch,action:maintenance(market==='nftmarket'?'activate':'activate_batch_vault',{payer:BigInt(payer)},f.maintenanceCursor)};
 }
 if(market==='bondingcurve'&&await scalar(V,'phase')===0n){
  if(options.automaticInitialize){const f=await funding(config.issuer);if(f.fee_delta===FEE_ESCROW&&f.paid_a===BigInt(config.unit)*BigInt(config.cap+config.liquidity)&&f.paid_b===0n)return {checkpoint:s.checkpoint,phase,batch,action:maintenance('initialize',{},f.maintenanceCursor)};}
  return {checkpoint:s.checkpoint,phase,batch,action:null,reason:'curve-inventory-required'};
 }
 const paired=['orderbook','nftmarket'].includes(market),limit=options.batchMemberLimit??(paired?4:2),selected=new Map();
 assert.ok(Number.isSafeInteger(limit)&&limit>=(paired?2:1)&&limit<=4,'invalid batch member limit');
 if(market==='orderbook'){
  // Avoid selecting four asks while compatible bids are waiting. Prioritize
  // refunds, then earliest whole-order compatible pairs within discovered data.
  const enriched=await mapReads(available,async o=>({...o,...await funding(Number(o.owner))}));
  for(const o of enriched)if(!isLive(o,BigInt(s.checkpoint))||!validFunding(market,o,config)){selected.set(o.owner,o);if(selected.size===limit)break;}
  const valid=enriched.filter(o=>!selected.has(o.owner)&&isLive(o,BigInt(s.checkpoint))&&validFunding(market,o,config)).sort(bookCompare);
  for(const ask of valid.filter(o=>o.side===0n))for(const bid of valid.filter(o=>o.side===1n))if(!selected.has(ask.owner)&&!selected.has(bid.owner)&&ask.y<=bid.x&&bid.y<=ask.x&&selected.size+2<=limit){selected.set(ask.owner,ask);selected.set(bid.owner,bid);break;}
 }else if(market==='nftmarket'){
  for(const buyer of available.filter(o=>o.kind===2n)){
   const seller=await getOrder(buyer.seller);const actualListing=seller.kind===1n&&seller.pool===BigInt(V)&&seller.nonce===buyer.listing_nonce&&seller.nonce>seller.consumed;
   const needs=[buyer,...(selected.has(seller.owner)?[]:[{...seller,referenceOnly:!actualListing}])];const extra=needs.filter(o=>!selected.has(o.owner));if(selected.size+extra.length>limit)continue;
   for(const o of extra)selected.set(o.owner,o);if(selected.size===limit)break;
  }
  for(const listing of available.filter(o=>o.kind===1n))if(!selected.has(listing.owner)&&selected.size<limit){const f=await funding(Number(listing.owner));const [ns,nc]=await readTogether([s.slot(Number(listing.owner),config.nftId,1182+35*V+32),s.slot(V,config.nftId,1182+35*Number(listing.owner)+33)]);
   const queue=Number(nc%4n),identity=await readTogether(Array.from({length:8},(_,j)=>s.slot(Number(listing.owner),config.nftId,1182+35*V+8*queue+j)));const matches=identity.every((v,j)=>v===listing[j<4?'token_id_'+j:'metadata_hash_'+(j-4)]);if(!isLive(listing,BigInt(s.checkpoint))||f.fee_delta!==FEE_ESCROW||f.paid_a!==0n||ns!==nc+1n||!matches)selected.set(listing.owner,listing);
  }
 }else for(const row of available.slice(0,limit))selected.set(row.owner,row);
 if(!selected.size){
  if(market==='bondingcurve'&&options.automaticGraduation){const sold=await scalar(V,'sold_lots'),phase=await scalar(V,'phase'),quote=await pair(V,'quote_reserve'),f=await funding(config.issuer);
   if(phase===1n&&sold>=BigInt(config.threshold)&&f.fee_delta===FEE_ESCROW)return {checkpoint:s.checkpoint,phase,batch,action:maintenance('graduate',{x:quote,y:BigInt(config.unit)*(BigInt(config.cap+config.liquidity)-sold)},f.maintenanceCursor)};
  }
  // Orphan returns require an explicit sender enrollment. This materializes
  // their market tree and prevents a missing-tree proof from looking valid.
  let recovery=null;
  for(const o of discovered){if(o.owner===BigInt(options.batchSponsorId)||available.some(a=>a.owner===o.owner)||await scalar(Number(o.owner),'recovery_pool')!==BigInt(V))continue;
   const f=await funding(Number(o.owner));const mask=(f.paid_a?1:0)+(f.paid_b?2:0)+(f.fee_delta?4:0);
   if(mask){recovery=maintenance(`recover_funding_${mask}`,{payer:o.owner,x:f.paid_a,y:f.paid_b,lots:f.fee_delta},f.maintenanceCursor);break;}
   if(market==='nftmarket'){const [sent,claimed]=await readTogether([s.slot(Number(o.owner),config.nftId,1182+35*V+32),s.slot(V,config.nftId,1182+35*Number(o.owner)+33)]);if(sent>claimed){recovery=maintenance('recover_nft',{payer:o.owner,nonce:claimed},`${sent}:${claimed}`);break;}}
  }
  if(recovery){const units=options.recoveryGasUnits??2;assert.ok(Number.isSafeInteger(units)&&units>=2&&units<=8,'bounded explicit recovery gas budget');const recoveryGas=BigInt(units)*FEE_ESCROW;const blocked=await backpressure(parseLosslessJson(recovery.submission).software_defined_call.inputs);if(blocked)return {checkpoint:s.checkpoint,phase,batch,action:null,reason:blocked};if(await s.slot(V,0,0)>=FEE_ESCROW)return {checkpoint:s.checkpoint,phase,batch,action:recovery};
   const sponsor=options.batchSponsorId,f=await funding(sponsor),[sp,sa,sn,su,purpose]=await readTogether([scalar(sponsor,'sponsor_pool'),scalar(sponsor,'sponsor_amount'),scalar(sponsor,'sponsor_nonce'),scalar(V,'used_sponsorship',sponsor),scalar(sponsor,'sponsor_purpose')]);
   if(sp===BigInt(V)&&purpose===2n&&sn>su&&f.fee_delta===sa&&sa===recoveryGas)return {checkpoint:s.checkpoint,phase,batch,action:maintenance('fund_gas',{payer:BigInt(sponsor),lots:sa},`${sn}:${f.maintenanceCursor}`)};
   return {checkpoint:s.checkpoint,phase,batch,action:null,reason:'recovery-gas-sponsorship-required',sponsorPending:f.fee_delta.toString(),requiredTotal:recoveryGas.toString()};
  }
  return {checkpoint:s.checkpoint,phase,batch,action:null};
 }
 // A zero contract-tree leaf is an uninitialized asset account, not an
 // authenticated nonzero-height zero-state Merkle root. RPC zeros alone do
 // not suffice for those foreign reads in the current frozen SDK.
 if(s.contractStateRoot){const missing=[];for(const o of selected.values())for(const asset of market==='nftmarket'?[config.tokenId,config.nftId]:[config.assetA,config.assetB])if(await s.contractStateRoot(Number(o.owner),asset)==='0'.repeat(64))missing.push({userId:Number(o.owner),contractId:asset});if(missing.length)return {checkpoint:s.checkpoint,phase,batch,action:null,reason:'asset-account-initialization-required',missing};}
 const sponsor=options.batchSponsorId;assert.ok(Number.isSafeInteger(sponsor)&&sponsor>0&&sponsor!==V,'batch sponsor required');assert.ok(!selected.has(BigInt(sponsor)),'sponsor cannot be a member');
 const [sent,claimed,base,sp,sa,sn,su,purpose]=await readTogether([s.slot(sponsor,0,3+2*V),s.slot(V,0,4+2*sponsor),scalar(V,'settled_fee',sponsor),scalar(sponsor,'sponsor_pool'),scalar(sponsor,'sponsor_amount'),scalar(sponsor,'sponsor_nonce'),scalar(V,'used_sponsorship',sponsor),scalar(sponsor,'sponsor_purpose')]);
 if(claimed!==base||sent-base!==2n*FEE_ESCROW||sp!==BigInt(V)||sa!==2n*FEE_ESCROW||sn<=su||purpose!==1n)return {checkpoint:s.checkpoint,phase,batch,action:null,reason:'sponsor-funding-required',sponsor,pending:(sent-base).toString(),required:(2n*FEE_ESCROW).toString()};
 const rows=[...selected.values()].sort((a,b)=>a.owner<b.owner?-1:1),f=witness({mode:1,batch:batch+1n,users:rows.map(o=>o.owner),nonces:rows.map(o=>o.referenceOnly?0n:o.nonce),expiry:BigInt(s.checkpoint)+BigInt(options.batchExpiryCheckpoints??256),sponsor:BigInt(sponsor),burn:0n});
 return {checkpoint:s.checkpoint,phase,batch,rows,action:task('batch_commit',f)};
}
