// New candidate only: finite minimum progress and owner-authorized lifetime fees.
import assert from 'node:assert/strict';
import {generateRandomStream} from './random-generate.mjs';
import {context} from './generate.mjs';
import {methodSpans} from '../v2/generate.mjs';
import {method,remote,slot} from '../v2/controller.mjs';
const P=18446744069414584321n;
const H=v=>`psystd::poseidon_hash(${v.join(',')})`;
const replaceBody=(s,n,body)=>{const m=methodSpans(s).find(m=>m.name===n);assert.ok(m,n);return s.slice(0,m.open+1)+body+s.slice(m.end-1);};
const same=(a,b)=>Array.from({length:4},(_,i)=>`${a}[${i}]==${b}[${i}]`).join(' && ');
const seedContext=(base,seed,refund)=>H(['91647816651058',...Array.from({length:4},(_,i)=>`${base}[${i}]`),'self.stream_source+1',...seed,refund]);
const minimumContext=base=>H([String(0x4d494e43545831n),...Array.from({length:4},(_,i)=>`${base}[${i}]`),...Array.from({length:4},(_,i)=>`self.minimum_root[${i}]`)]);
export function generateMinimumStream(market,c,{empty24,empty56,window=8192}={}){
 assert.ok(Number.isSafeInteger(c.feeOwner)&&c.feeOwner>0&&c.feeOwner<2**24,'reviewed ordinary fee owner');
 for(const v of [empty24,empty56]){assert.ok(Array.isArray(v)&&v.length===4);for(const x of v){assert.equal(typeof x,'string');assert.match(x,/^(0|[1-9]\d*)$/);assert.ok(BigInt(x)<P);}}
 let s=generateRandomStream(market,c,{window});
 s=s.replace('pub stream_phase: Felt,','pub minimum_root: ContractStateArray<4,Felt>, pub fee_cap: Felt, pub fee_used: Felt, pub fee_grant_seen: Felt, pub fee_grant_nonce: ContractStateArray<16777216,Felt>, pub fee_grant_limit: ContractStateArray<16777216,Felt>, pub fee_authorization_key: ContractStateArray<4,Felt>, pub fee_grant_key_0: ContractStateArray<16777216,Felt>, pub fee_grant_key_1: ContractStateArray<16777216,Felt>, pub fee_grant_key_2: ContractStateArray<16777216,Felt>, pub fee_grant_key_3: ContractStateArray<16777216,Felt>, pub stream_phase: Felt,');
 const seeds=Array.from({length:4},(_,i)=>`self.stream_seed[${i}]`);
 for(const phase of [2,3]){const old=seedContext(context('self.stream_',phase),seeds,'self.stream_refund_only');assert.ok(s.includes(old),'seed context must be preserved');s=s.replaceAll(old,minimumContext(old));}
 // Fee counters/caps are deliberately not reset by OPEN or market initialize.
 let m=methodSpans(s).find(m=>m.name==='open_source_stream');s=replaceBody(s,m.name,m.body+Array.from({length:4},(_,i)=>`self.minimum_root[${i}]=0;`).join(' '));
 const initial=H([String(0x4d494e5354415431n),'0',...Array.from({length:4},(_,i)=>`self.stream_manifest[${i}]`),...empty24,'0','0','0',...empty56,'0']);
 m=methodSpans(s).find(m=>m.name==='finish_source_page');s=replaceBody(s,m.name,m.body+` if (self.stream_phase==2) { ${Array.from({length:4},(_,i)=>`self.minimum_root[${i}]=${initial}[${i}];`).join(' ')} }`);
 for(const name of ['set_order_page','finish_order_page','restart_expired_random_order'])s=replaceBody(s,name,'self.stream_busy=self.stream_busy; require(false,"minimum frontier has no legacy prefix or reset entry");');
 const advance=method('advance_minimum_stream','before: Hash, after: Hash, built: Felt, extracted: Felt, queue: Hash, terminal: Felt',d=>{
  d.range('built',24);d.range('extracted',24);d.range('terminal',1);d.emit(`require(self.stream_phase==2 && self.stream_busy==1 && ${same('before','self.minimum_root')},"exact minimum progress root"); require(built<=self.stream_total && extracted<=self.stream_total,"minimum count bounds");`);
  for(let i=0;i<4;i++)d.emit(`self.minimum_root[${i}]=after[${i}];`);
  d.emit('if (terminal==1) { require(built==self.stream_total && extracted==self.stream_total,"complete source and extraction only"); self.stream_queue_total=self.stream_total;');
  for(let i=0;i<4;i++)d.emit(`self.stream_empty[${i}]=${empty56[i]}; self.stream_remaining[${i}]=queue[${i}];`);
  for(let i=0;i<7;i++)d.emit(`self.stream_last[${i}]=0;`);
  d.emit('self.stream_phase=3; } else { require(built<self.stream_total || extracted<self.stream_total,"terminal marker required"); } self.stream_busy=0;');
 });
 const authorize=method('authorize_fee_budget','vault: Felt, nonce: Felt, cap: Felt, key: Hash',d=>{
  d.range('vault',24);d.range('nonce',62);d.range('cap',62);d.range('self.fee_grant_nonce[vault]',62);d.range('self.fee_grant_limit[vault]',62);
  d.emit(`require(ctx.user_id==${c.feeOwner} && vault!=0 && vault!=ctx.user_id,"only configured ordinary funding owner"); require(nonce==self.fee_grant_nonce[vault]+1 && cap>0 && cap>=self.fee_grant_limit[vault],"irrevocable nondecreasing lifetime grant"); self.fee_grant_nonce[vault]=nonce; self.fee_grant_limit[vault]=cap;`); d.emit(`require(key[0]!=0 || key[1]!=0 || key[2]!=0 || key[3]!=0,"registered key identity required");`); for(let i=0;i<4;i++)d.emit(`self.fee_grant_key_${i}[vault]=key[${i}];`);
 });
 const apply=method('apply_fee_grant','nonce: Felt, cap: Felt, key: Hash, funding_owner: Felt, funding: Felt',d=>{
  d.range('funding_owner',24);d.emit(`require(funding_owner==${c.feeOwner},"exact compiled funding owner");`);
  d.range('funding',1);
  for(const x of ['nonce','cap','self.fee_grant_seen','self.fee_cap','self.fee_used'])d.range(x,62);
  const n=remote(d,String(c.feeOwner),'fee_grant_nonce[ctx.user_id]'),limit=remote(d,String(c.feeOwner),'fee_grant_limit[ctx.user_id]');d.range(n,62);d.range(limit,62);
  d.emit(`require(ctx.user_id!=${c.feeOwner} && nonce>${'self.fee_grant_seen'} && nonce==${n} && cap==${limit} && cap>=self.fee_cap && cap>=self.fee_used,"one authentic funding-owner grant"); self.fee_grant_seen=nonce; self.fee_cap=cap;`); for(let i=0;i<4;i++){const value=remote(d,String(c.feeOwner),`fee_grant_key_${i}[ctx.user_id]`);d.emit(`require(key[${i}]==${value},"grant must bind registered vault key"); self.fee_authorization_key[${i}]=key[${i}];`);}
  // The following Native.claim is part of the same bound UPS. Advance the
  // market's funding cursor to exactly that cumulative Native outbox endpoint.
  d.emit('if (funding==1) {');const sent=slot(d,String(c.feeOwner),'0','3+2*ctx.user_id'),claimed=slot(d,'ctx.user_id','0',String(4+2*c.feeOwner));d.range(sent,62);d.range(claimed,62);d.emit(`require(${sent}>${claimed} && self.settled_fee[${c.feeOwner}]==${claimed},"one fresh owner funding outbox"); self.settled_fee[${c.feeOwner}]=${sent}; }`);
 });
 const fee=method('account_executor_fee','amount: Felt, key: Hash',d=>{
  for(const x of ['amount','self.fee_cap','self.fee_used'])d.range(x,62);
  d.emit('require(amount>0 && amount<=1000100000 && self.fee_used<=self.fee_cap,"bounded exact native fee"); let used=self.fee_used+amount;');d.range('used',62);d.emit('require(used<=self.fee_cap,"funding-owner lifetime fee cap exhausted"); self.fee_used=used;');d.emit(`require(${same('key','self.fee_authorization_key')},"registered key fee authorization");`);
 });
 s=s.trimEnd().slice(0,-1)+[advance,authorize,apply,fee].join('\n')+'\n}\n';
 // This identity is an ordinary fees-only principal, never a market trader.
 // Otherwise an all-pending Native claim could consume an order's fee deposit.
 for(const m of methodSpans(s).reverse())if(m.name!=='authorize_fee_budget')s=s.slice(0,m.open+1)+`require(ctx.user_id!=${c.feeOwner},"reserved ordinary funding owner"); `+s.slice(m.open+1);
 return s;
}
