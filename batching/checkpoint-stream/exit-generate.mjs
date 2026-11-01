// New identities only. Native credit tags never authorize a pool/asset sweep.
import assert from 'node:assert/strict';
import {generateFundedStream} from './funded-generate.mjs';
import {generateFundedPair} from './funded-pair.mjs';
import {methodSpans} from '../v2/generate.mjs';
import {method,remote,slot} from '../v2/controller.mjs';
const MAX='1000100000';
export function generateExitStream(market,c){
 let source=['amm','bondingcurve'].includes(market)?generateFundedStream(market,c):generateFundedPair(market,c);
 assert.equal(source.split('pub stream_phase: Felt,').length,2,'exact candidate insertion point');
 const fields='pub treasury_exit_grant: ContractStateArray<16777216,Felt>, pub treasury_credit: Felt, pub treasury_return_fee: Felt, pub treasury_returned: Felt, pub exit_spent: Felt, pub exit_returned: Felt, pub exit_credit: ContractStateArray<16777216,Felt>, pub exit_seen: ContractStateArray<16777216,Felt>, pub exit_after: ContractStateArray<16777216,Felt>, pub exit_nonce: ContractStateArray<16777216,Felt>, pub exit_amount: ContractStateArray<16777216,Felt>, pub exit_deadline: ContractStateArray<16777216,Felt>, '+Array.from({length:4},(_,i)=>`pub exit_key_${i}: ContractStateArray<16777216,Felt>,`).join(' ');
 source=source.replace('pub stream_phase: Felt,',fields+' pub stream_phase: Felt,');
 const grant=methodSpans(source).find(x=>x.name==='apply_fee_grant');
 const pattern=new RegExp(`self\\.settled_fee\\[${c.feeOwner}\\]\\s*=\\s*([A-Za-z_0-9]+);`),match=grant.body.match(pattern);assert.ok(match);
 // Native claim cursor is fixed by the existing authentic grant check. Credit
 // exactly that still-unclaimed contribution, never the whole vault balance.
 const sent=match[1],claimed=grant.body.match(new RegExp(`${sent}>([A-Za-z_0-9]+)`))?.[1];assert.ok(claimed);
 const replacement=`${grant.body.replace(pattern,`let credited = self.treasury_credit + ${sent} - ${claimed}; self.treasury_credit = credited; self.settled_fee[${c.feeOwner}] = ${sent};`)}`;
 // Use the same DSL range primitive rather than an unchecked Felt sum.
 const range=method('_range','value: Felt',d=>d.range('value',62));
 const rangeBody=methodSpans(`impl X {${range}}`)[0].body;
 source=source.slice(0,grant.open+1)+replacement.replace('self.treasury_credit = credited;',rangeBody.replaceAll('value','credited')+' self.treasury_credit = credited;')+source.slice(grant.end-1);
 const charge=methodSpans(source).find(x=>x.name==='account_executor_fee');
 const body=`require(self.treasury_credit >= amount,"tagged owner fees only"); self.treasury_credit = self.treasury_credit - amount; `+charge.body;
 source=source.slice(0,charge.open+1)+body+source.slice(charge.end-1);
 const keyCheck=d=>{for(let i=0;i<4;i++)d.emit(`require(key[${i}]==self.fee_authorization_key[${i}],"registered fee key");`);};
 const extra=[];
 extra.push(method('authorize_treasury_exit','vault: Felt, nonce: Felt, key: Hash',d=>{
  d.range('vault',24);d.range('nonce',62);d.emit(`require(ctx.user_id==${c.feeOwner} && vault!=0 && vault!=ctx.user_id && nonce>0 && nonce==self.fee_grant_nonce[vault],"original owner explicitly closes its current grant epoch");`);
  for(let i=0;i<4;i++)d.emit(`require(key[${i}]==self.fee_grant_key_${i}[vault],"exact approved vault key");`);
  d.emit('self.treasury_exit_grant[vault]=nonce;');
 }));
 extra.push(method('authorize_exit_fees','vault: Felt, nonce: Felt, amount: Felt, after: Felt, key: Hash',d=>{
  d.batchMarket=market;for(const[n,b]of [['vault',24],['nonce',62],['amount',62],['after',32],['self.exit_nonce[vault]',62]])d.range(n,b);
  d.emit(`require(ctx.user_id!=${c.feeOwner} && vault!=0 && vault!=ctx.user_id,"separate exit sponsor"); require(self.kind==0 || self.pool!=vault,"exit sponsor must close its own order first"); require(nonce==self.exit_nonce[vault]+1 && amount>=${MAX} && after>ctx.checkpoint_id && after<=ctx.checkpoint_id+4096,"bounded explicit exit grant"); self.exit_nonce[vault]=nonce; self.exit_amount[vault]=amount; self.exit_deadline[vault]=after;`);
  for(let i=0;i<4;i++)d.emit(`self.exit_key_${i}[vault]=key[${i}];`);
 }));
 extra.push(method('apply_exit_grant','payer: Felt, nonce: Felt, amount: Felt, after: Felt, key: Hash',d=>{
  d.batchMarket=market;for(const[n,b]of [['payer',24],['nonce',62],['amount',62],['after',32],['self.exit_seen[payer]',62],['self.exit_credit[payer]',62]])d.range(n,b);
  d.emit(`require(payer!=0 && payer!=ctx.user_id && payer!=${c.feeOwner},"separate exit sponsor");`);
  for(const[n,v]of [['exit_nonce','nonce'],['exit_amount','amount'],['exit_deadline','after']]){const x=remote(d,'payer',`${n}[ctx.user_id]`);d.emit(`require(${x}==${v},"authenticated exit grant");`);}
  const kind=remote(d,'payer','kind'),pool=remote(d,'payer','pool');d.emit(`require(${kind}==0 || ${pool}!=ctx.user_id,"no active sponsor order"); require(nonce>self.exit_seen[payer] && after>ctx.checkpoint_id && after<=ctx.checkpoint_id+4096 && amount>=${MAX},"fresh exit grant");`);
  keyCheck(d);for(let i=0;i<4;i++){const x=remote(d,'payer',`exit_key_${i}[ctx.user_id]`);d.emit(`require(key[${i}]==${x},"exit grant binds vault key");`);}
  const sent=slot(d,'payer',0,'3+2*ctx.user_id'),claimed=slot(d,'ctx.user_id',0,'4+2*payer');for(const x of[sent,claimed,'self.settled_fee[payer]'])d.range(x,62);
  d.emit(`require(${claimed}==self.settled_fee[payer] && ${sent}==${claimed}+amount,"exact original sponsor contribution"); let credit=self.exit_credit[payer]+amount;`);d.range('credit',62);
  d.emit(`self.exit_credit[payer]=credit; self.exit_seen[payer]=nonce; self.exit_after[payer]=after; self.settled_fee[payer]=${sent};`);
 }));
 extra.push(method('account_exit_fee','payer: Felt, amount: Felt, returning: Felt, key: Hash',d=>{
  for(const[n,b]of [['payer',24],['amount',62],['returning',1],['self.exit_credit[payer]',62],['self.exit_spent',62]])d.range(n,b);keyCheck(d);
  d.emit(`require(payer!=0 && amount>0 && amount<=${MAX} && self.exit_credit[payer]>=amount && (ctx.checkpoint_id<=self.exit_after[payer] || returning==1),"bounded exit-only fees"); let spent=self.exit_spent+amount;`);d.range('spent',62);d.emit('self.exit_spent=spent; self.exit_credit[payer]=self.exit_credit[payer]-amount;');
 }));
 extra.push(method('return_treasury','amount: Felt, fee: Felt, payer: Felt, key: Hash',d=>{
  for(const[n,b]of [['amount',62],['fee',62],['payer',24],['self.treasury_credit',62],['self.treasury_returned',62]])d.range(n,b);keyCheck(d);
  d.batchMarket=market;for(const n of ['self.fee_cap','self.fee_used','self.fee_grant_seen'])d.range(n,62);
  d.emit('require(self.fee_used<=self.fee_cap,"valid service cap"); if (self.fee_cap-self.fee_used>=1000000000) {');
  const permit=remote(d,String(c.feeOwner),'treasury_exit_grant[ctx.user_id]'),grant=remote(d,String(c.feeOwner),'fee_grant_nonce[ctx.user_id]');
  d.emit(`require(${permit}>0 && ${permit}==self.fee_grant_seen && ${permit}==${grant},"live treasury needs explicit original owner exit authorization"); }`);
  d.emit(`require(fee>0 && fee<=${MAX} && amount>0,"nonempty full owner return"); let reserve=(payer==0).to_felt()*fee; require(self.treasury_credit==amount+reserve,"all and only tagged owner credit"); let returned=self.treasury_returned+amount;`);d.range('returned',62);d.emit('self.treasury_returned=returned; self.treasury_credit=reserve;');
 }));
 extra.push(method('account_return_fee','amount: Felt, key: Hash',d=>{
  for(const[n,b]of [['amount',62],['self.treasury_return_fee',62],['self.treasury_credit',62]])d.range(n,b);keyCheck(d);
  d.emit(`require(amount>0 && amount<=${MAX} && self.treasury_credit==amount,"one full tagged return fee"); let spent=self.treasury_return_fee+amount;`);d.range('spent',62);d.emit('self.treasury_return_fee=spent; self.treasury_credit=0;');
 }));
 extra.push(method('return_exit_credit','owner: Felt, amount: Felt, fee: Felt, payer: Felt, key: Hash',d=>{
  for(const[n,b]of [['owner',24],['amount',62],['fee',62],['payer',24],['self.exit_credit[owner]',62],['self.exit_returned',62],['self.exit_after[owner]',32]])d.range(n,b);keyCheck(d);
  d.emit(`require(owner!=0 && payer!=0 && owner!=ctx.user_id && amount>0 && fee>0 && fee<=${MAX} && ctx.checkpoint_id>self.exit_after[owner],"original sponsor return after approved deadline"); let reserve=(owner==payer).to_felt()*fee; require(self.exit_credit[owner]==amount+reserve,"full original exit credit only"); let returned=self.exit_returned+amount;`);d.range('returned',62);d.emit('self.exit_returned=returned; self.exit_credit[owner]=reserve;');
 }));
 return source.trimEnd().slice(0,-1)+extra.join('\n')+'\n}\n';
}
