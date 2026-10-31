// New deterministic candidates only. No modification of the existing profiles.
import assert from 'node:assert/strict';
import {generateStream} from './generate.mjs';
import {methodSpans} from '../v2/generate.mjs';
import {method,remote,slot} from '../v2/controller.mjs';

export function generateFundedStream(market,c) {
  assert.ok(['amm','bondingcurve'].includes(market),'review AMM/Curve bootstrap first');
  assert.ok(Number.isSafeInteger(c.feeOwner)&&c.feeOwner>0&&c.feeOwner<2**24,'ordinary fee owner');
  assert.ok(![c.issuer,c.target].includes(c.feeOwner),'separate fees-only principal');
  let source=generateStream(market,c);
  const fields='pub fee_cap: Felt, pub fee_used: Felt, pub fee_grant_seen: Felt, pub fee_grant_nonce: ContractStateArray<16777216,Felt>, pub fee_grant_limit: ContractStateArray<16777216,Felt>, pub fee_authorization_key: ContractStateArray<4,Felt>, '+Array.from({length:4},(_,i)=>`pub fee_grant_key_${i}: ContractStateArray<16777216,Felt>,`).join(' ');
  assert.equal(source.split('pub stream_phase: Felt,').length,2);
  source=source.replace('pub stream_phase: Felt,',fields+' pub stream_phase: Felt,');
  const authorize=method('authorize_fee_budget','vault: Felt, nonce: Felt, cap: Felt, key: Hash',d=>{
    for(const [name,bits]of [['vault',24],['nonce',62],['cap',62],['self.fee_grant_nonce[vault]',62],['self.fee_grant_limit[vault]',62]])d.range(name,bits);
    d.emit(`require(ctx.user_id==${c.feeOwner} && vault!=0 && vault!=ctx.user_id,"only configured ordinary funding owner"); require(nonce==self.fee_grant_nonce[vault]+1 && cap>0 && cap>=self.fee_grant_limit[vault],"irrevocable nondecreasing lifetime grant"); self.fee_grant_nonce[vault]=nonce; self.fee_grant_limit[vault]=cap; require(key[0]!=0 || key[1]!=0 || key[2]!=0 || key[3]!=0,"registered key required");`);
    for(let i=0;i<4;i++)d.emit(`self.fee_grant_key_${i}[vault]=key[${i}];`);
  });
  const apply=method('apply_fee_grant','nonce: Felt, cap: Felt, key: Hash, funding_owner: Felt, funding: Felt',d=>{
    d.range('funding_owner',24);d.range('funding',1);d.emit(`require(funding_owner==${c.feeOwner},"exact compiled funding owner");`);
    for(const name of ['nonce','cap','self.fee_grant_seen','self.fee_cap','self.fee_used'])d.range(name,62);
    const nonce=remote(d,String(c.feeOwner),'fee_grant_nonce[ctx.user_id]'),cap=remote(d,String(c.feeOwner),'fee_grant_limit[ctx.user_id]');d.range(nonce,62);d.range(cap,62);
    d.emit(`require(ctx.user_id!=${c.feeOwner} && nonce>self.fee_grant_seen && nonce==${nonce} && cap==${cap} && cap>=self.fee_cap && cap>=self.fee_used,"one authentic monotone grant"); self.fee_grant_seen=nonce; self.fee_cap=cap;`);
    for(let i=0;i<4;i++){const value=remote(d,String(c.feeOwner),`fee_grant_key_${i}[ctx.user_id]`);d.emit(`require(key[${i}]==${value},"grant binds registered key"); self.fee_authorization_key[${i}]=key[${i}];`);}
    d.emit('if (funding==1) {');
    const sent=slot(d,String(c.feeOwner),'0','3+2*ctx.user_id'),claimed=slot(d,'ctx.user_id','0',String(4+2*c.feeOwner));d.range(sent,62);d.range(claimed,62);
    d.emit(`require(${sent}>${claimed} && self.settled_fee[${c.feeOwner}]==${claimed},"one fresh owner funding outbox"); self.settled_fee[${c.feeOwner}]=${sent}; }`);
  });
  const account=method('account_executor_fee','amount: Felt, key: Hash',d=>{
    for(const name of ['amount','self.fee_cap','self.fee_used'])d.range(name,62);
    d.emit('require(amount>0 && amount<=1000100000 && self.fee_used<=self.fee_cap,"bounded exact fee"); let used=self.fee_used+amount;');d.range('used',62);d.emit('require(used<=self.fee_cap,"lifetime fee cap exhausted"); self.fee_used=used;');
    for(let i=0;i<4;i++)d.emit(`require(key[${i}]==self.fee_authorization_key[${i}],"registered fee key");`);
  });
  source=source.trimEnd().slice(0,-1)+[authorize,apply,account].join('\n')+'\n}\n';
  for(const m of methodSpans(source).reverse())if(m.name!=='authorize_fee_budget')source=source.slice(0,m.open+1)+`require(ctx.user_id!=${c.feeOwner},"reserved fees-only principal"); `+source.slice(m.open+1);
  assert.ok(!source.includes('stream_seed_intrinsic')&&!source.includes('pub stream_seed:'));
  return source;
}
