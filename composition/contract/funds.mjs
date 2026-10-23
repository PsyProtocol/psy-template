// One-shot, owner-funded two-AMM controller. This generator is deliberately
// independent of the base markets: it never writes a foreign vault's state.
import assert from 'node:assert/strict';
import {IntegerDsl} from '../../amm/u124/math.mjs';
const F=1000100000n;
export function generateFunds({networkMagic,registryHash,assetA,assetB}){
 assert.ok(typeof networkMagic==='bigint'&&networkMagic>0n&&networkMagic<18446744069414584321n);
 assert.match(registryHash,/^[0-9a-f]{64}$/);
 for(const id of [assetA,assetB])assert.ok(Number.isSafeInteger(id)&&id>=5&&id<16777216);
 assert.notEqual(assetA,assetB);
 const roots=Array.from({length:8},(_,i)=>BigInt('0x'+registryHash.slice(i*8,i*8+8))),methods=[];
 const method=(name,params,body)=>{const d=new IntegerDsl();body(d);methods.push(`#[contract_method]\npub fn ${name}(&mut self, ctx: &mut ChainContext${params?', '+params:''}) {\n${d.text()}\n}`);};
 const read=(d,expr)=>{const n=d.name('read');d.emit(`let ${n} = ${expr};`);return n;};
 const remote=(u,n)=>`ctx.users[${u}].contract_state::<Self::ABI>(ctx.contract_id).${n}`;
 const balance=(d,asset)=>{const n=d.name('balance');d.emit(`let ${n}: [Felt;2] = [ctx.users[ctx.user_id].contract_state::<Self::ABI>(${asset}).native_view[0],ctx.users[ctx.user_id].contract_state::<Self::ABI>(${asset}).native_view[1]];`);return d.pair(n);};
 const native=d=>{const n=read(d,'ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).native_view[0]');d.range(n,62);return n;};
 const pairValue=(d,a)=>a.startsWith('self.')?read(d,a):a;
 const same=(d,a,b,msg)=>d.emit(`require(${d.eq(pairValue(d,a),pairValue(d,b))}, "${msg}");`);
 const zero=(d,a,msg)=>d.emit(`require(${a}[0] == 0 && ${a}[1] == 0, "${msg}");`);
 const owner=d=>{d.range('owner',24);d.range('nonce',62);d.emit('require(owner != 0 && self.owner == owner && self.intent_nonce == nonce && nonce != 0, "active signed intent");');};
 const keyCheck=(d,expected)=>{const actual=d.name('key');d.emit(`let ${actual}: Hash = ctx.user_public_key;`);for(let i=0;i<4;i++)d.emit(`require(${actual}[${i}] == ${expected}[${i}], "execution key");`);};
 const checkNative=d=>d.emit(`require(${native(d)} == self.native_expected, "native accounting");`);
 const stop=d=>{const cancelled=read(d,remote('self.owner','request_cancelled'));d.emit(`require(${cancelled} == 1 || ctx.checkpoint_id > self.expiry, "owner cancel or expiry");`);};
 const live=d=>{const cancelled=read(d,remote('self.owner','request_cancelled'));d.emit(`require(${cancelled} == 0 && ctx.checkpoint_id <= self.expiry, "route stopped");`);};
 const inflight=(d,{unchangedNative=true}={})=>{owner(d);d.emit('require((hop == 1 && self.phase == 3) || (hop == 2 && self.phase == 5), "inflight hop");');if(unchangedNative)checkNative(d);};
 method('noop','',()=>{});
 method('forbidden','',d=>d.emit('require(false, "unsupported composition phase");'));
 for(const renew of [false,true])method(renew?'renew_route':'request_route','vault: Felt, nonce: Felt, input: [Felt;2], minimum_mid: [Felt;2], minimum_final: [Felt;2], expiry: Felt, budget: Felt, execution_key: Hash',d=>{
  d.range('vault',24);d.range('nonce',62);d.range('expiry',32);d.range('budget',62);for(const n of ['input','minimum_mid','minimum_final'])d.nonzero(n);
  d.emit(`require(vault != 0 && vault != ctx.user_id && nonce == self.request_nonce + 1 && expiry > ctx.checkpoint_id && budget >= ${20n*F} && budget <= ${64n*F}, "request terms");`);
  if(renew){const oldPhase=read(d,remote('self.request_vault','phase'));d.emit(`require(self.request_nonce != 0 && ${oldPhase} == 99, "prior funded intent remains locked");`);}else d.emit('require(self.request_nonce == 0 && nonce == 1, "first request only");');
  d.emit('self.request_vault = vault; self.request_nonce = nonce; self.request_input = input; self.request_mid = minimum_mid; self.request_final = minimum_final; self.request_expiry = expiry; self.request_budget = budget; self.request_key = execution_key; self.request_cancelled = 0; self.request_funded = 0;');
  d.emit(`let commitment: Hash = [${networkMagic},ctx.contract_id,ctx.user_id,nonce]; commitment = psystd::poseidon_two_to_one(commitment,[vault,expiry,budget,1]); commitment = psystd::poseidon_two_to_one(commitment,[input[0],input[1],minimum_mid[0],minimum_mid[1]]); commitment = psystd::poseidon_two_to_one(commitment,[minimum_final[0],minimum_final[1],ctx.user_id,1]); commitment = psystd::poseidon_two_to_one(commitment,execution_key); commitment = psystd::poseidon_two_to_one(commitment,[${roots.slice(0,4)}]); commitment = psystd::poseidon_two_to_one(commitment,[${roots.slice(4)}]); self.request_commitment = commitment;`);
 });
 method('bind_funding','nonce: Felt',d=>{
  d.emit('require(nonce == self.request_nonce && nonce != 0 && self.request_funded == 0 && self.request_cancelled == 0 && ctx.checkpoint_id <= self.request_expiry, "matching unfunded request");');
  const sent=read(d,`ctx.users[ctx.user_id].contract_state::<Self::ABI>(${assetA}).wide_outbox[self.request_vault].sent`);same(d,sent,'self.request_input','exact signed input outbox');
  const gas=read(d,'ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).native_view[3 + 2 * self.request_vault]');d.range(gas,62);d.emit(`require(${gas} == self.request_budget, "exact signed gas outbox"); self.request_funded = 1;`);
 });
 method('request_cancel','nonce: Felt',d=>d.emit('require(nonce == self.request_nonce && nonce != 0, "cancel nonce"); self.request_cancelled = 1;'));
 method('begin_funding','owner: Felt, nonce: Felt',d=>{
  d.range('owner',24);d.range('nonce',62);d.emit('require(owner != 0 && owner != ctx.user_id && nonce != 0 && self.phase == 0 && self.owner == 0, "one shot funding");');
  for(const [field,value]of [['request_vault','ctx.user_id'],['request_nonce','nonce'],['request_funded','1']])d.emit(`require(${read(d,remote('owner',field))} == ${value}, "signed funding identity");`);
  const k=d.name('expected');d.emit(`let ${k}: Hash = ${remote('owner','request_key')};`);keyCheck(d,k);
  for(const [dst,src]of [['input','request_input'],['minimum_mid','request_mid'],['minimum_final','request_final']]){const v=read(d,remote('owner',src));d.nonzero(v);d.emit(`self.${dst} = ${v};`);}
  const budget=read(d,remote('owner','request_budget'));d.range(budget,62);d.emit(`require(${budget} >= ${20n*F} && ${budget} <= ${64n*F}, "bounded gas reserve"); self.budget = ${budget}; self.native_expected = ${budget}; self.owner = owner; self.intent_nonce = nonce; self.expiry = ${read(d,remote('owner','request_expiry'))}; self.intent_commitment = ${read(d,remote('owner','request_commitment'))}; self.phase = 1;`);
  // The dedicated key proves a completely empty start leaf and nonce zero
  // for this first UPS. Thus initial balances AND claim cursors are zero.
  // Do not query an absent external contract root through the frozen CFC.
  const sent=read(d,`ctx.users[owner].contract_state::<Self::ABI>(${assetA}).wide_outbox[ctx.user_id].sent`);same(d,sent,'self.input','exact original owner funding');
  const ns=read(d,'ctx.users[owner].contract_state::<Self::ABI>(0).native_view[3 + 2 * ctx.user_id]');d.range(ns,62);d.emit(`require(${ns} == self.budget, "exact owner gas funding");`);
 });
 method('finish_funding','owner: Felt, nonce: Felt',d=>{owner(d);d.emit('require(self.phase == 1, "funding phase");');same(d,balance(d,assetA),'self.input','claimed input');checkNative(d);d.emit('self.phase = 2;');});
 for(const hop of [1,2])method('prepare_'+hop,'owner: Felt, nonce: Felt, amount: [Felt;2], minimum: [Felt;2], deadline: Felt, order_nonce: Felt',d=>{
  owner(d);checkNative(d);live(d);d.range('order_nonce',62);d.emit(`require(self.phase == ${hop===1?2:4} && order_nonce != 0 && deadline == self.expiry && self.return_only == 0, "hop preparation");`);same(d,'amount',hop===1?'self.input':'self.middle','hop input');same(d,'minimum',hop===1?'self.minimum_mid':'self.minimum_final','hop floor');same(d,balance(d,hop===1?assetA:assetB),'amount','spendable hop input');if(hop===2)zero(d,balance(d,assetA),'other asset residual');d.emit(`self.phase = ${hop===1?3:5}; self.order_nonce = order_nonce; self.consent_sent = 0; self.cancel_sent = 0; self.recovery_sent = 0;`);
 });
 for(const hop of [1,2])method('finish_send_'+hop,'owner: Felt, nonce: Felt',d=>{owner(d);d.emit(`require(self.phase == ${hop===1?3:5}, "send phase");`);zero(d,balance(d,assetA),'input not fully sent');if(hop===2)zero(d,balance(d,assetB),'middle not fully sent');d.emit(`require(self.native_expected >= ${F} && ${native(d)} + ${F} == self.native_expected, "exact market escrow"); self.native_expected = self.native_expected - ${F};`);});
 method('mark_consent','owner: Felt, nonce: Felt, hop: Felt, epoch: Felt, cutoff: Felt',d=>{inflight(d);live(d);d.range('epoch',32);d.range('cutoff',32);d.emit('require(self.consent_sent == 0 && epoch != 0 && cutoff > ctx.checkpoint_id && cutoff <= ctx.checkpoint_id + 128 && cutoff <= self.expiry, "single bounded admission consent"); self.consent_sent = 1;');});
 method('mark_cancel','owner: Felt, nonce: Felt, hop: Felt',d=>{inflight(d);stop(d);d.emit('require(self.cancel_sent == 0, "cancel already sent"); self.cancel_sent = 1;');});
 method('mark_recovery','owner: Felt, nonce: Felt, hop: Felt',d=>{inflight(d);stop(d);d.emit('require(self.recovery_sent == 0, "recovery already enrolled"); self.recovery_sent = 1;');});
 for(const hop of [1,2])for(const refund of [false,true])method(`record_${hop}_${refund?'refund':'success'}`,'owner: Felt, nonce: Felt, amount: [Felt;2]',d=>{
  owner(d);d.emit(`require(self.phase == ${hop===1?3:5}, "collection phase");`);d.nonzero('amount');
  const asset=hop===1?(refund?assetA:assetB):(refund?assetB:assetA),other=asset===assetA?assetB:assetA;
  same(d,balance(d,asset),'amount','actually claimed amount');if(!(hop===1&&refund))zero(d,balance(d,other),'other asset residual');
  if(refund){same(d,'amount',hop===1?'self.input':'self.middle','exact refunded principal');d.emit(`require(${native(d)} == self.native_expected + ${F}, "exact escrow refund"); self.native_expected = self.native_expected + ${F}; self.return_asset = ${asset}; self.return_amount = amount; self.return_only = 1; self.phase = 7;`);}
  else{checkNative(d);d.emit(`require(${d.le(read(d,hop===1?'self.minimum_mid':'self.minimum_final'),'amount')}, "actual hop slippage"); self.${hop===1?'middle':'final_amount'} = amount; self.phase = ${hop===1?4:6};`);}
 });
 method('charge','fee: Felt',d=>{d.range('fee',62);const n=native(d);d.emit(`require(self.phase >= 2 && self.phase <= 7 && self.owner != 0 && fee >= 1000000000 && fee <= ${F} && ${n} == self.native_expected && fee <= ${n} && self.steps < 14, "bounded exact UPS fee"); self.native_expected = ${n} - fee; self.fees = self.fees + fee; self.steps = self.steps + 1;`);});
 for(const mode of ['input','middle','final']){
  const asset=mode==='middle'?assetB:assetA;
  method('begin_return_'+mode,'owner: Felt, nonce: Felt, amount: [Felt;2], native_refund: Felt, fee: Felt',d=>{
   owner(d);checkNative(d);d.nonzero('amount');d.range('native_refund',62);d.range('fee',62);d.emit(`require(fee >= 1000000000 && fee <= ${F} && self.steps < 14 && self.native_expected == native_refund + fee, "final gas conservation");`);
   if(mode==='input'){
    d.emit(`require(self.phase == 2 || (self.phase == 7 && self.return_asset == ${assetA}), "initial asset return phase"); if self.phase == 2 {`);stop(d);d.emit('}');same(d,'amount','self.input','input recovery amount');
   }else if(mode==='middle'){
    d.emit(`require(self.phase == 4 || (self.phase == 7 && self.return_asset == ${assetB}), "middle return phase"); if self.phase == 4 {`);stop(d);d.emit('}');same(d,'amount','self.middle','middle recovery amount');
   }else{d.emit('require(self.phase == 6, "final return phase");');same(d,'amount','self.final_amount','final return amount');}
   same(d,balance(d,asset),'amount','actual return balance');if(mode!=='input')zero(d,balance(d,asset===assetA?assetB:assetA),'other return residual');d.emit('self.phase = 8; self.final_fee = fee;');
  });
  method('finish_return_'+mode,'owner: Felt, nonce: Felt',d=>{owner(d);d.emit(`require(self.phase == 8 && ${native(d)} == self.final_fee, "final native residual");`);zero(d,balance(d,assetA),'final input residual');if(mode!=='input')zero(d,balance(d,assetB),'final intermediate residual');d.emit('self.fees = self.fees + self.final_fee; self.native_expected = 0; self.steps = self.steps + 1; self.phase = 99;');});
 }

 return `// UNDEPLOYED funded candidate: requires dedicated full-stack/session key.\n// Align persisted Hash fields to complete four-Felt leaves.\n#[derive(FeltSized)]\npub struct WideOutbox { pub sent: [Felt;2], pub claimed: [Felt;2], }\n#[contract]\npub struct CompositionFunds {\npub native_view: ContractStateArray<33554453,Felt>,\npub wide_outbox: ContractStateArray<16777216,WideOutbox>,\npub reserved_view: ContractStateArray<1073741904,Felt>,\npub owner: Felt, pub intent_nonce: Felt, pub phase: Felt, pub expiry: Felt, pub budget: Felt, pub native_expected: Felt, pub fees: Felt, pub steps: Felt, pub active_hash_padding: [Felt;3], pub intent_commitment: Hash,\npub input: [Felt;2], pub minimum_mid: [Felt;2], pub minimum_final: [Felt;2], pub middle: [Felt;2], pub final_amount: [Felt;2], pub order_nonce: Felt, pub consent_sent: Felt, pub cancel_sent: Felt, pub recovery_sent: Felt, pub return_only: Felt, pub return_asset: Felt, pub return_amount: [Felt;2], pub final_fee: Felt,\npub request_vault: Felt, pub request_nonce: Felt, pub request_input: [Felt;2], pub request_mid: [Felt;2], pub request_final: [Felt;2], pub request_expiry: Felt, pub request_budget: Felt, pub key_hash_padding: [Felt;3], pub request_key: Hash, pub request_cancelled: Felt, pub request_funded: Felt, pub request_hash_padding: [Felt;2], pub request_commitment: Hash,\n}\n#[contract_implementation]\nimpl CompositionFunds {\n${methods.join('\n')}\n}\n`;
}
