// Application-owned deterministic batch controller. Legacy profiles are not
// edited: this builds distinct contracts, layouts, and spending fingerprints.
import {IntegerDsl} from '../../amm/u124/math.mjs';
const F=1000100000n;
export const read=(d,e)=>{const v=d.name('read');d.emit(`let ${v} = ${e};`);return v;};
export const memberIndex=u=>`((self.frozen_owner[1] == ${u}).to_felt() + 2*(self.frozen_owner[2] == ${u}).to_felt() + 3*(self.frozen_owner[3] == ${u}).to_felt())`;
export const own=(d,f)=>{
 const lookup=/^batch_index\[(.+)\]$/.exec(f);if(lookup)return read(d,memberIndex(lookup[1]));
 if(/^frozen\[.+\]\.(x|y|z|price|paid_a|paid_b)$/.test(f))return read(d,`[self.${f}_lo,self.${f}_hi]`);
 return read(d,`self.${f}`);
};
export const remote=(d,u,f)=>read(d,`ctx.users[${u}].contract_state::<Self::ABI>(ctx.contract_id).${f}`);
export const slot=(d,u,c,o)=>read(d,`ctx.users[${u}].contract_state::<Self::ABI>(${c}).${d.batchMarket==='nftmarket'?'external_view':'native_view'}[${o}]`);
export function pairSlot(d,u,c,o){
 if(d.batchMarket!=='nftmarket'){
  const m=/^3355445([35])\+4\*(.+)$/.exec(o);if(!m)throw Error('typed U124 outbox offset required');
  return d.pair(read(d,`ctx.users[${u}].contract_state::<Self::ABI>(${c}).wide_outbox[${m[2]}].${m[1]==='3'?'sent':'claimed'}`));
 }
 const a=slot(d,u,c,o),b=slot(d,u,c,`(${o})+1`),v=d.name('pair');d.emit(`let ${v}: [Felt;2] = [${a},${b}];`);return d.pair(v);}
export function method(name,params,body){const d=new IntegerDsl();d.range('ctx.checkpoint_id',32);body(d);return `#[contract_method]\npub fn ${name}(&mut self, ctx: &mut ChainContext${params?', '+params:''}) {\n${d.text()}\n}`;}
export function id(d,u){d.range(u,24);d.emit(`require(${u} != 0 && ${u} != ctx.user_id, "invalid participant");`);}
export function members(market){return market==='nftmarket'?
 {kind:1,pool:1,nonce:1,deadline:1,cancelled:1,order_checkpoint:1,price:2,seller:1,listing_nonce:1,nft_sequence:1,...Object.fromEntries(['token_id','metadata_hash'].flatMap(n=>Array.from({length:4},(_,i)=>[`${n}_${i}`,1])))}:
 {kind:1,pool:1,side:1,deadline:1,nonce:1,x:2,y:2,z:2,order_checkpoint:1,cancelled:1,...(market==='bondingcurve'?{lots:1,expected_sold:1,limit_mode:1}:{})};}
export function controllerFields(market){return `
pub recovery_pool: Felt, pub batch_ready: Felt, pub batch_id: Felt, pub batch_phase: Felt, pub batch_cutoff: Felt, pub batch_expiry: Felt,
pub batch_count: Felt, pub batch_root: [Felt;4], pub batch_sponsor: Felt,
pub sponsor_pool: Felt, pub sponsor_amount: Felt, pub sponsor_nonce: Felt, pub sponsor_purpose: Felt, pub used_sponsorship: ContractStateArray<16777216,Felt>,
pub batch_users: ContractStateArray<4,Felt>, pub batch_done: ContractStateArray<4,Felt>, pub batch_rank: ContractStateArray<4,Felt>,

pub frozen: ContractStateArray<4,FrozenOrder>,
`;}
export function frozenStruct(market){return `#[derive(FeltSized)]\npub struct FrozenOrder {pub owner: Felt, ${Object.entries(members(market)).map(([n,w])=>w===2?`pub ${n}_lo: Felt, pub ${n}_hi: Felt,`:`pub ${n}: Felt,`).join(' ')} pub paid_a_lo: Felt, pub paid_a_hi: Felt, pub paid_b_lo: Felt, pub paid_b_hi: Felt, pub fee_sent: Felt,}\n`;}
export function frozenRead(d,u,f){const index=own(d,`batch_index[${u}]`);d.range(index,2);d.emit(`require(self.frozen[${index}].owner == ${u}, "participant outside frozen set");`);return own(d,`frozen[${index}].${f}`);}
function hash(d,h,values){for(let i=0;i<values.length;i+=4)d.emit(`${h} = psystd::poseidon_two_to_one(${h}, [${[...values.slice(i,i+4),...Array(4).fill('0')].slice(0,4).join(',')}]);`);}
export function timeBefore(d,a,b){const ca=own(d,`frozen[${a}].order_checkpoint`),cb=own(d,`frozen[${b}].order_checkpoint`),ua=own(d,`frozen[${a}].owner`),ub=own(d,`frozen[${b}].owner`);return `(${d.lessLimb(ca,cb,32)} || (${ca} == ${cb} && ${d.lessLimb(ua,ub,24)}))`;}
export function pending(d,i){const u=own(d,`frozen[${i}].owner`),done=own(d,`batch_done[${i}]`);return `(${u} != 0 && ${done} == 0)`;}
export function live(d,i){const cancelled=own(d,`frozen[${i}].cancelled`),deadline=own(d,`frozen[${i}].deadline`);return `(${cancelled} == 0 && self.batch_cutoff <= ${deadline})`;}
export function enter(d,u,{ordered=false}={}){id(d,u);const i=own(d,`batch_index[${u}]`);d.range(i,2);d.emit(`require(self.batch_phase == 2 && self.frozen[${i}].owner == ${u} && self.batch_done[${i}] == 0, "batch participant unavailable");`);
 if(ordered)for(let j=0;j<4;j++){
  if(d.checkpointGraph){d.emit(`require(self.frozen[${j}].owner == 0 || self.processor_claimed[${j}] == 1, "complete sorted claims first"); require(!(${pending(d,j)} && self.processor_position[${j}] < self.processor_position[${i}]), "checkpoint order priority");`);}
  else{const before=timeBefore(d,String(j),i);d.emit(`require(!(${pending(d,j)} && ${before}), "deterministic order priority");`);}
 }return i;}
export function mark(d,u){const i=own(d,`batch_index[${u}]`);d.range(i,2);d.emit(`self.batch_done[${i}] = 1;`);}
export function controller(market,c){const out=[];const fields=members(market),nativeCursor=market==='nftmarket'?'settled_fee':'settled_fee';
 out.push(method('commit_batch','users: [Felt;4], nonces: [Felt;4], count: Felt, batch: Felt, expiry: Felt, sponsor: Felt',d=>{
  d.batchMarket=market;
  id(d,'sponsor');d.range('batch',62);d.range('count',3);d.range('expiry',32);
  d.emit(`require(self.batch_ready == 1 && (self.batch_phase == 0 || self.batch_phase == 3 || self.batch_phase == 4), "batch unavailable or not activated"); require(batch == self.batch_id + 1 && count > 0 && count <= 4, "batch bounds"); require(expiry > ctx.checkpoint_id && expiry <= ctx.checkpoint_id + 1024, "batch expiry");`);
  const sponsorPurpose=remote(d,'sponsor','sponsor_purpose'),sponsorPool=remote(d,'sponsor','sponsor_pool'),sponsorAmount=remote(d,'sponsor','sponsor_amount'),sponsorNonce=remote(d,'sponsor','sponsor_nonce'),usedSponsor=own(d,'used_sponsorship[sponsor]');d.range(sponsorNonce,62);d.range(usedSponsor,62);d.emit(`require(${sponsorPurpose} == 1 && ${sponsorPool} == ctx.user_id && ${sponsorAmount} == ${2n*F} && ${d.lessLimb(usedSponsor,sponsorNonce)}, "explicit batch sponsorship required");`);
  const fee=slot(d,'sponsor',0,'3+2*ctx.user_id'),old=own(d,`${nativeCursor}[sponsor]`),claimed=slot(d,'ctx.user_id',0,'4+2*sponsor');
  for(const x of[fee,old,claimed])d.range(x,62);
  d.emit(`require(${claimed} == ${old} && ${fee} == ${old} + ${2n*F}, "two-phase sponsor funding");`);
  const h=d.name('commitment');d.emit(`let ${h}: Hash = [${c.networkMagic},ctx.contract_id,ctx.user_id,2];`);
  hash(d,h,[String(market==='nftmarket'?c.nftId:c.assetA),String(market==='nftmarket'?c.tokenId:c.assetB),'batch','count','ctx.checkpoint_id','expiry','sponsor',sponsorNonce,sponsorAmount,sponsorPurpose]);
  const snapshots=[];
  for(let i=0;i<4;i++){
   d.range(`users[${i}]`,24);d.range(`nonces[${i}]`,62);
   d.emit(`require((count > ${i} && users[${i}] != 0 && users[${i}] != sponsor && users[${i}] != ctx.user_id) || (count <= ${i} && users[${i}] == 0 && nonces[${i}] == 0), "canonical member padding");`);
   if(i)d.emit(`require(count <= ${i} || users[${i}] > users[${i-1}], "canonical unique member set");`);
   // Read an existing user for inactive positions. They are canonical zero
   // members, never a foreign-user-zero proof or an authorized participant.
   const u=d.name('source'),active=d.name('active');d.emit(`let ${active} = count > ${i}; let ${u} = ${active}.to_felt() * users[${i}] + (1 - ${active}.to_felt()) * users[0];`);
   const row={};for(const[n]of Object.entries(fields))row[n]=remote(d,u,n);
   const used=own(d,`consumed[${u}]`),n=row.nonce;d.range(used,62);d.range(n,62);
   d.emit(`require(count <= ${i} || (${market==='nftmarket'?`(nonces[${i}] == 0 || ${n} == nonces[${i}])`:`${n} == nonces[${i}]`} && (${market==='nftmarket'?`nonces[${i}] == 0 || (${row.pool} == ctx.user_id && ${row.kind} != 0 && ${d.lessLimb(used,n)})`:`${row.pool} == ctx.user_id && ${row.kind} != 0 && ${d.lessLimb(used,n)}`})), "invalid frozen order");`);
   const fa=market==='nftmarket'?c.tokenId:c.assetA,fb=market==='nftmarket'?null:c.assetB;
   const paid=[],cursors=[];
   for(const[asset,cursor]of[[fa,market==='nftmarket'?'settled_payment':'settled_a'],[fb,'settled_b']]){
    if(asset===null){paid.push(d.constant(0));continue;}
    const sent=pairSlot(d,u,asset,'33554453+4*ctx.user_id'),base=own(d,`${cursor}[${u}]`),actual=pairSlot(d,'ctx.user_id',asset,`33554455+4*${u}`);
    d.emit(`require(${d.eq(base,actual)}, "funding cursor drift");`);paid.push(d.sub(sent,base));cursors.push(`${sent}[0]`,`${sent}[1]`,`${base}[0]`,`${base}[1]`,`${actual}[0]`,`${actual}[1]`);
   }
   const sent=slot(d,u,0,'3+2*ctx.user_id'),feeBase=own(d,`settled_fee[${u}]`),feeClaimed=slot(d,'ctx.user_id',0,`4+2*${u}`);
   for(const v of [sent,feeBase,feeClaimed])d.range(v,62);
   d.emit(`require(count <= ${i} || (${feeClaimed} == ${feeBase} && (${sent} == ${feeBase} || ${d.lessLimb(feeBase,sent)})), "order fee funding");`);
   const feeDelta=d.name('fee_delta');d.emit(`let ${feeDelta} = ${sent} - ${feeBase};`);d.range(feeDelta,62);
   let nftSent=null,nftClaimed=null,nftMatches=null,reference='false';if(market==='nftmarket'){nftSent=slot(d,u,c.nftId,'1182+35*ctx.user_id+32');nftClaimed=slot(d,'ctx.user_id',c.nftId,`1182+35*${u}+33`);for(const v of[nftSent,nftClaimed])d.range(v,62);reference=`nonces[${i}] == 0`;const bits=d.range(nftClaimed,62),q=d.name('nft_queue');d.emit(`let ${q} = ${bits}[0].to_felt() + 2*${bits}[1].to_felt();`);const equal=[];for(let j=0;j<8;j++){const v=slot(d,u,c.nftId,`1182+35*ctx.user_id+8*${q}+${j}`);cursors.push(v);equal.push(`${v} == ${row[j<4?'token_id_'+j:'metadata_hash_'+(j-4)]}`);}nftMatches=d.name('nft_matches');d.emit(`let ${nftMatches} = (${equal.join(' && ')}).to_felt();`);cursors.push(nftSent,nftClaimed,nftMatches);}
   hash(d,h,[`users[${i}]`,...(market==='nftmarket'?[`nonces[${i}]`]:[]),...Object.entries(fields).flatMap(([n,w])=>w===2?[`${row[n]}[0]`,`${row[n]}[1]`]:[row[n]]),`${paid[0]}[0]`,`${paid[0]}[1]`,`${paid[1]}[0]`,`${paid[1]}[1]`,sent,feeBase,feeClaimed,feeDelta,...cursors]);
   snapshots.push({row,paid,sent,feeDelta,u,active,nftSent,nftClaimed,nftMatches,reference});
  }
  // No external read follows these writes: self-external witnesses use this
  // call's start root, whereas later settlement guards read frozen current state.
  if(market==='nftmarket')for(let i=0;i<4;i++){const r=snapshots[i].row;d.emit(`require(count <= ${i} || nonces[${i}] == 0 || ${r.kind} != 2 || (${Array.from({length:4},(_,j)=>`(count > ${j} && ${r.seller} == users[${j}])`).join(' || ')}), "purchase seller outside batch");`);}
  if(market==='nftmarket')for(let i=0;i<4;i++){const {reference}=snapshots[i];d.emit(`require(count <= ${i} || !(${reference}) || (${snapshots.map((s,j)=>`(count > ${j} && nonces[${j}] != 0 && ${s.row.kind} == 2 && ${s.row.seller} == users[${i}])`).join(' || ')}), "unused listing reference");`);}
  for(let i=0;i<4;i++){const {row,paid,sent,feeDelta,u,active,nftSent,nftClaimed,nftMatches,reference}=snapshots[i];d.emit(`self.frozen[${i}].owner = users[${i}]; self.batch_users[${i}] = users[${i}]; self.batch_done[${i}] = ${market==='nftmarket'?`(${reference}).to_felt()`:0}; self.batch_rank[${i}] = ${i};`);for(const[n,v]of Object.entries(row)){if(fields[n]===2)d.emit(`self.frozen[${i}].${n}_lo = ${v}[0]; self.frozen[${i}].${n}_hi = ${v}[1];`);else d.emit(`self.frozen[${i}].${n} = ${v};`);}d.emit(`self.frozen[${i}].paid_a_lo = ${paid[0]}[0]; self.frozen[${i}].paid_a_hi = ${paid[0]}[1]; self.frozen[${i}].paid_b_lo = ${paid[1]}[0]; self.frozen[${i}].paid_b_hi = ${paid[1]}[1]; self.frozen[${i}].fee_sent = ${sent}; self.frozen[${i}].fee_delta = ${feeDelta}; ${market==='nftmarket'?`self.frozen[${i}].nft_sent = ${nftSent}; self.frozen[${i}].nft_claimed = ${nftClaimed}; self.frozen[${i}].nft_matches = ${nftMatches};`:""}`);}
  d.emit(`self.batch_id = batch; self.batch_phase = 1; self.batch_cutoff = ctx.checkpoint_id; self.batch_expiry = expiry; self.batch_count = count; self.batch_sponsor = sponsor; self.batch_root = ${h}; self.settled_fee[sponsor] = ${fee}; self.used_sponsorship[sponsor] = ${sponsorNonce};`);
 }));
 out.push(method('begin_batch','batch: Felt, root: Hash',d=>{d.emit('require(self.batch_phase == 1 && self.batch_id == batch && ctx.checkpoint_id <= self.batch_expiry, "batch not executable");');const h=own(d,'batch_root');for(let i=0;i<4;i++)d.emit(`require(root[${i}] == ${h}[${i}], "batch commitment mismatch");`);d.emit('self.batch_phase = 2;');}));
 out.push(method('expire_batch','batch: Felt',d=>{d.emit('require(self.batch_phase == 1 && self.batch_id == batch && ctx.checkpoint_id > self.batch_expiry, "batch not expirable"); self.batch_phase = 4;');}));
 return out;
}
