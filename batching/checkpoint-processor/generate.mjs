import assert from 'node:assert/strict';
import {generateProcessorBase, methodSpans} from '../v2/generate.mjs';
import {IntegerDsl} from '../../amm/u124/math.mjs';
import {method, own, memberIndex} from '../v2/controller.mjs';
import {fundingUnchanged, fundingValid} from '../v2/funding.mjs';
const F = 1000100000n;
const lower = text => text.replace(/self\.frozen\[(.*?)\]\.([A-Za-z_]\w*)/g, (_, i, n) => `self.frozen_${n}[${i}]`);
function canonicalParts(d, key) {
 const out = [];
 for (let i = 0; i < 4; i++) {
  const bits = d.range(`${key}[${i}]`, 64), lo = d.name('hash_low'), hi = d.name('hash_high');
  const sum = start => Array.from({length:32}, (_, j) => `${bits}[${start+j}].to_felt() * ${1n<<BigInt(j)}`).join(' + ');
  d.emit(`let ${lo} = ${sum(0)}; let ${hi} = ${sum(32)}; require(${hi} != 4294967295 || ${lo} == 0, "canonical hash decomposition");`);
  out.push(hi, lo);
 }
 return out;
}
function choose(d, rank, parts, column) {
 const v = d.name('selected_hash'); d.emit(`let ${v} = ${parts.map((row,j) => `(${rank} == ${j}).to_felt()*${row[column]}`).join(' + ')};`); return v;
}
function begin(c) {
 return method('begin_checkpoint_batch', 'batch: Felt, root: Hash, draw_checkpoint: Felt, seed: Hash, rank: [Felt;4], count: Felt', d => {
  d.range('draw_checkpoint',32);d.range('count',3);
  d.emit('require(self.batch_phase == 1 && batch == self.batch_id && count == self.batch_count && draw_checkpoint == self.processor_draw && draw_checkpoint <= ctx.checkpoint_id && ctx.checkpoint_id <= self.batch_expiry, "fixed checkpoint batch required");');
  const stored=own(d,'batch_root');for(let i=0;i<4;i++)d.emit(`require(root[${i}] == ${stored}[${i}], "batch commitment mismatch");`);
  for(let i=0;i<4;i++) { d.range(`rank[${i}]`,2);d.emit(`require((count > ${i} && rank[${i}] < count) || (count <= ${i} && rank[${i}] == ${i}), "active permutation bounds");`);for(let j=0;j<i;j++)d.emit(`require(rank[${i}] != rank[${j}], "complete permutation required");`); }
  d.emit(`let processor_domain: Hash = [${0x50535950524f4331n},${c.networkMagic},ctx.contract_id,batch]; let processor_root = psystd::poseidon_two_to_one(processor_domain,root); let processor_seed = psystd::poseidon_two_to_one(processor_root,seed);`);
  const parts=[];
  for(let i=0;i<4;i++) { const key=d.name('order_key');d.emit(`let ${key} = psystd::poseidon_two_to_one(processor_seed,[self.frozen_owner[${i}],self.frozen_nonce[${i}],draw_checkpoint,0]);`);parts.push(canonicalParts(d,key)); }
  for(let i=1;i<4;i++) { let lt='false',eq='true';for(let j=0;j<8;j++){const a=choose(d,`rank[${i-1}]`,parts,j),b=choose(d,`rank[${i}]`,parts,j),bit=d.lessLimb(a,b,32),n=d.name('less'),e=d.name('equal');d.emit(`let ${n} = ${lt} || (${eq} && ${bit}); let ${e} = ${eq} && ${a} == ${b};`);lt=n;eq=e;}d.emit(`require(count <= ${i} || ${lt} || (${eq} && rank[${i-1}] < rank[${i}]), "checkpoint seed ordering");`); }
  for(let i=0;i<4;i++)d.emit(`self.batch_rank[${i}] = rank[${i}]; self.processor_position[rank[${i}]] = ${i};`);
  d.emit('self.processor_seed = seed; self.batch_phase = 2; require(false, "checkpoint_seed_intrinsic");');
 });
}
function gather(market,c) {
 return method('claim_batch_member','payer: Felt, nonce: Felt',d=>{
  const i=memberIndex('payer');d.range('payer',24);d.range('nonce',62);
  d.emit(`require(self.batch_phase == 2 && self.frozen_owner[${i}] == payer && self.frozen_nonce[${i}] == nonce && self.processor_claimed[${i}] == 0, "unclaimed frozen member required");`);
  for(let j=0;j<4;j++)d.emit(`require(${i} <= ${j} || self.frozen_owner[${j}] == 0 || self.processor_claimed[${j}] == 1, "claim by user id");`);
  fundingUnchanged(d,'payer',market,c);d.emit(`require(${fundingValid(d,i,market,c)}, "complete cutoff funding required"); self.processor_claimed[${i}] = 1;`);
 });
}
function finish() {
 return method('finish_checkpoint_batch','batch: Felt, burn: Felt, reward: Felt',d=>{
  d.range('burn',62);d.range('reward',62);
  d.emit(`require(self.batch_phase == 2 && batch == self.batch_id && burn >= 1000000000 && burn <= ${F} && reward + burn == self.batch_count * ${F}, "batch fee conservation");`);
  for(let i=0;i<4;i++) {
   d.emit(`require(self.frozen_owner[${i}] == 0 || (self.batch_done[${i}] == 1 && self.processor_claimed[${i}] == 1), "all accepted members processed");`);
   const user=own(d,`frozen[${i}].owner`),actual=own(d,`settled_fee[${user}]`),claimed=d.name('fee_claimed');
   d.emit(`let ${claimed} = ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).native_view[4+2*${user}]; require(${user} == 0 || ${claimed} == ${actual}, "fees must be claimed last");`);
  }
  d.emit('self.batch_phase = 3;');
 });
}
export function generateCheckpointProcessor(market,config) {
 assert.ok(['amm','bondingcurve'].includes(market));
 const c={...config};assert.equal(typeof c.networkMagic,'string');
 let source=generateProcessorBase(market,c);
 source=source.replace('pub batch_sponsor: Felt,','pub batch_sponsor: Felt, pub processor_draw: Felt, pub processor_seed: Hash, pub processor_claimed: ContractStateArray<4,Felt>, pub processor_position: ContractStateArray<4,Felt>,');
 assert.ok(source.includes('pub processor_draw: Felt,'),'processor fields installed');
 const commit=methodSpans(source).find(m=>m.name==='commit_batch');assert.ok(commit);
 const d=new IntegerDsl();d.emit('require(self.batch_count >= 2 && ctx.checkpoint_id + 1 < self.batch_expiry, "processor needs two members and future draw before expiry"); self.processor_draw = ctx.checkpoint_id + 1;');
 for(let i=0;i<4;i++){d.emit(`self.processor_claimed[${i}] = 0; self.processor_position[${i}] = ${i}; require(self.frozen_owner[${i}] == 0 || (self.frozen_cancelled[${i}] == 0 && self.batch_cutoff <= self.frozen_deadline[${i}] && ${fundingValid(d,String(i),market,c)}), "processor admission requires live funded orders");`);}
 source=source.slice(0,commit.end-1)+lower(d.text().replace(/\bw_/g,'processor_commit_'))+'\n'+source.slice(commit.end-1);
 // Abort is terminal for every accepted user nonce. Otherwise an executor
 // could expire a disliked draw and re-seal the same authorizations for a reroll.
 const expiry=methodSpans(source).find(m=>m.name==='expire_batch');assert.ok(expiry);
 const retire=new IntegerDsl();
 for(let i=0;i<4;i++){
  const owner=own(retire,`frozen_owner[${i}]`),nonce=own(retire,`frozen_nonce[${i}]`),used=own(retire,`consumed[${owner}]`);
  retire.range(nonce,62);retire.range(used,62);
  retire.emit(`require(${owner} == 0 || ${retire.lessLimb(used,nonce)}, "expired authorization already retired"); if (${owner} != 0) { self.consumed[${owner}] = ${nonce}; }`);
 }
 source=source.slice(0,expiry.end-1)+retire.text().replace(/\bw_/g,'processor_retire_')+'\n'+source.slice(expiry.end-1);
 return source.trimEnd().slice(0,-1)+[begin(c),gather(market,c),finish()].map(lower).join('\n')+'\n}\n';
}
export function generatePreviousCheckpointProcessor(market,config){
 const source=generateCheckpointProcessor(market,config);
 const old='draw_checkpoint <= ctx.checkpoint_id';assert.equal(source.split(old).length,2);
 return source.replace(old,'draw_checkpoint == ctx.checkpoint_id');
}
