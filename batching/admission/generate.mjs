// Bounded opt-in admission candidate. Accepted queue, not the market universe.
// Distinct layout/code roots; never apply to the deployed V2 vault.
import {generateBatch,methodSpans} from '../v2/generate.mjs';
import {method,members,remote,read,memberIndex} from '../v2/controller.mjs';
const chain=(d,h,vs)=>{for(let i=0;i<vs.length;i+=4)d.emit(`${h} = psystd::poseidon_two_to_one(${h}, [${[...vs.slice(i,i+4),...Array(4).fill('0')].slice(0,4).join(',')}]);`);};
function terms(d,u,market){const h=d.name('terms');d.emit(`let ${h}: Hash = [ctx.contract_id,ctx.user_id,${u},31];`);const values=[];
 for(const[n,w]of Object.entries(members(market))){if(n==='cancelled')continue;const v=remote(d,u,n);values.push(...(w===2?[`${v}[0]`,`${v}[1]`]:[v]));}chain(d,h,values);return h;}
function replaceBody(source,name,fn){const s=methodSpans(source).find(x=>x.name===name);if(!s)throw Error('missing admission target '+name);return source.slice(0,s.open+1)+fn(s.body)+source.slice(s.end-1);}
const fields=`
pub admission_epoch: Felt, pub admission_cutoff: Felt, pub admission_nonce: Felt,
pub queue_epoch: Felt, pub queue_phase: Felt, pub queue_cutoff: Felt, pub queue_count: Felt,
pub queue_root: Hash, pub queue_history: Hash,
pub queue_owner: ContractStateArray<4,Felt>, pub queue_nonce: ContractStateArray<4,Felt>,
pub queue_hash: ContractStateArray<4,Hash>, pub queue_outcome: ContractStateArray<4,Felt>,
`;
export function generateAdmission(market,c){if(c.ordering!==undefined&&c.ordering!=='deterministic')throw Error('authenticated future randomness is unavailable; deterministic only');for(const key of ['seed','randomSeed','randomSource'])if(Object.hasOwn(c,key))throw Error('randomness dependency not attested');let source=generateBatch(market,c);const marker='}\n#[contract_implementation]';if(source.split(marker).length!==2)throw Error('admission struct envelope');source=source.replace(marker,fields+marker);
 const methods=[];
 methods.push(method('request_admission','epoch: Felt, cutoff: Felt',d=>{d.range('epoch',62);d.range('cutoff',32);d.emit('require(self.kind != 0 && self.pool != 0 && epoch > 0 && cutoff >= ctx.checkpoint_id, "admission consent bounds"); self.admission_epoch = epoch; self.admission_cutoff = cutoff; self.admission_nonce = self.nonce;');}));
 methods.push(method('start_epoch','epoch: Felt, cutoff: Felt',d=>{d.range('epoch',62);d.range('cutoff',32);d.emit('require(self.batch_ready == 1 && (self.batch_phase == 0 || self.batch_phase == 3 || self.batch_phase == 4), "admission vault unavailable"); require((self.queue_phase == 0 || self.queue_phase == 3) && epoch == self.queue_epoch + 1 && cutoff > ctx.checkpoint_id && cutoff <= ctx.checkpoint_id + 128, "epoch start bounds");');for(let i=0;i<4;i++)d.emit(`self.queue_owner[${i}] = 0; self.queue_nonce[${i}] = 0; self.queue_hash[${i}] = [0,0,0,0]; self.queue_outcome[${i}] = 0;`);d.emit('self.queue_epoch = epoch; self.queue_cutoff = cutoff; self.queue_count = 0; self.queue_phase = 1; self.queue_root = [0,0,0,0];');}));
 methods.push(method('admit_entry','owner: Felt, nonce: Felt',d=>{d.range('owner',24);d.range('nonce',62);d.emit('require(owner != 0 && owner != ctx.user_id && self.queue_phase == 1 && ctx.checkpoint_id <= self.queue_cutoff && self.queue_count < 4, "admission bounds");');
 const epoch=remote(d,'owner','admission_epoch'),cutoff=remote(d,'owner','admission_cutoff'),n=remote(d,'owner','admission_nonce'),kind=remote(d,'owner','kind'),pool=remote(d,'owner','pool'),order=remote(d,'owner','nonce');
 d.emit(`require(${epoch} == self.queue_epoch && ${cutoff} == self.queue_cutoff && ${n} == nonce && ${order} == nonce && ${kind} != 0 && ${pool} == ctx.user_id && nonce > self.consumed[owner], "authenticated admission consent");`);
 let pos='0';for(let i=0;i<4;i++){const o=read(d,`self.queue_owner[${i}]`);d.emit(`require(${o} != owner, "duplicate queue owner");`);const less=d.lessLimb(o,'owner',24);pos+=` + (${o} != 0 && ${less}).to_felt()`;}
 const index=d.name('insert');d.emit(`let ${index} = ${pos};`);d.range(index,2);const h=terms(d,'owner',market);
 // Read and stage every shifted value before writing any self state.
 const staged=[];for(let i=0;i<4;i++){const a=d.name('owner'),n=d.name('nonce'),q=d.name('hash');d.emit(`let ${a} = self.queue_owner[${i}]; let ${n} = self.queue_nonce[${i}]; let ${q}: Hash = self.queue_hash[${i}];`);staged.push({a,n,q});}
 for(let i=3;i>=0;i--){const prev=staged[Math.max(i-1,0)],cur=staged[i];d.emit(`if (${index} == ${i}) { self.queue_owner[${i}] = owner; self.queue_nonce[${i}] = nonce; self.queue_hash[${i}] = ${h}; } else { if (${index} < ${i}) { self.queue_owner[${i}] = ${prev.a}; self.queue_nonce[${i}] = ${prev.n}; self.queue_hash[${i}] = ${prev.q}; } else { self.queue_owner[${i}] = ${cur.a}; self.queue_nonce[${i}] = ${cur.n}; self.queue_hash[${i}] = ${cur.q}; } }`);}
 d.emit('self.queue_count = self.queue_count + 1;');}));
 methods.push(method('seal_epoch','epoch: Felt',d=>{d.emit('require(self.queue_phase == 1 && self.queue_epoch == epoch && self.queue_count > 0 && ctx.checkpoint_id > self.queue_cutoff, "queue seal bounds");');const h=d.name('queue');d.emit(`let ${h}: Hash = [${c.networkMagic},ctx.contract_id,ctx.user_id,3];`);chain(d,h,['self.queue_epoch','self.queue_cutoff','self.queue_count','0']);for(let i=0;i<4;i++){const q=read(d,`self.queue_hash[${i}]`);chain(d,h,[`self.queue_owner[${i}]`,`self.queue_nonce[${i}]`,...Array.from({length:4},(_,j)=>`${q}[${j}]`)]);}d.emit(`self.queue_root = ${h}; self.queue_phase = 2;`);}));
 methods.push(method('abort_empty_epoch','epoch: Felt',d=>d.emit('require(self.queue_phase == 1 && self.queue_epoch == epoch && self.queue_count == 0 && ctx.checkpoint_id > self.queue_cutoff, "only expired empty queue may abort"); self.queue_phase = 3;')));
 source=replaceBody(source,'commit_batch',body=>{let guards='require(self.queue_phase == 2 && count == self.queue_count, "sealed admission scope required");\nlet admission_scope_root: Hash = self.queue_root; let admission_scope_epoch = self.queue_epoch; let admission_scope_cutoff = self.queue_cutoff;\n';
 for(let i=0;i<4;i++)guards+=`require(users[${i}] == self.queue_owner[${i}] && nonces[${i}] == self.queue_nonce[${i}], "admission omission or substitution");\n`;
 // Nonces identify immutable order terms; cancellation is deliberately excluded
 // so a signed cancellation after admission remains eligible for a refund.
 const check=method('unused','',b=>{for(let i=0;i<4;i++){const u=b.name('member');b.emit(`let ${u} = (count > ${i}).to_felt() * users[${i}] + (count <= ${i}).to_felt() * users[0];`);const h=terms(b,u,market),q=read(b,`self.queue_hash[${i}]`);for(let j=0;j<4;j++)b.emit(`require(count <= ${i} || ${h}[${j}] == ${q}[${j}], "admitted order terms changed");`);}});guards+=methodSpans(check)[0].body;
 const assignment=/self\.batch_root = (\w+);/.exec(body);if(!assignment)throw Error('batch root binding target');const h=assignment[1];
 body=body.replace(assignment[0],`${h} = psystd::poseidon_two_to_one(${h}, admission_scope_root); ${h} = psystd::poseidon_two_to_one(${h}, [admission_scope_epoch,admission_scope_cutoff,count,3]); ${assignment[0]}`);
 return guards+'\n'+body;});
 const settlementNames=new Set(['swap_0','swap_1','add_liquidity','remove_liquidity','match_orders','settle_buy','settle_sell','settle_limit_buy','settle_limit_sell','settle_sale']);
 for(const span of [...methodSpans(source)].reverse()){
  const name=span.name;if(!settlementNames.has(name)&&!name.startsWith('batch_refund_')&&!name.startsWith('batch_cancel_')&&!name.startsWith('refund_'))continue;
  const users=name==='match_orders'?['seller_a','seller_b']:name==='settle_sale'?['seller','buyer']:market==='nftmarket'?[name.startsWith('refund_buy')?'buyer':'seller']:['payer'];
  const outcome=settlementNames.has(name)?1:2;let suffix='\n';for(const u of users)suffix+=`self.queue_outcome[${memberIndex(u)}] = ${outcome};\n`;
  // refund_funding is also a valid terminal disposition for a frozen entry.
  if(name==='refund_funding')suffix='\nself.queue_outcome['+memberIndex('payer')+'] = 2;\n';
  source=source.slice(0,span.end-1)+suffix+source.slice(span.end-1);
 }
 source=replaceBody(source,'finish_batch',body=>{let end='\nrequire(self.queue_phase == 2 && self.batch_count == self.queue_count, "admission terminal scope");\n';for(let i=0;i<4;i++)end+=`require(self.frozen_owner[${i}] == self.queue_owner[${i}], "queue terminal owner"); if (self.queue_owner[${i}] != 0) { if (self.batch_done[${i}] == 0) { self.queue_outcome[${i}] = 3; } else { require(self.queue_outcome[${i}] == 1 || self.queue_outcome[${i}] == 2, "missing admitted disposition"); } }\n`;
 const fold=method('unused','',d=>{const h=d.name('history');d.emit(`let ${h}: Hash = self.queue_history;`);const root=read(d,'self.queue_root');chain(d,h,Array.from({length:4},(_,i)=>`${root}[${i}]`));chain(d,h,Array.from({length:4},(_,i)=>`self.queue_outcome[${i}]`));d.emit(`self.queue_history = ${h}; self.queue_phase = 3;`);});return body+end+methodSpans(fold)[0].body;});
 return source.trimEnd().slice(0,-1)+methods.join('\n')+'\n}\n';
}
