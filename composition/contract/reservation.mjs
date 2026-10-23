// Reservation-only contract candidate. No token/native claim, transfer, spend,
// custody or route completion exists here. Never use it as a funding target.
import assert from'node:assert/strict';import{IntegerDsl}from'../../amm/u124/math.mjs';
const scalar=(n,max)=>{assert.ok(typeof n==='bigint'&&n>0n&&n<=max);return String(n);};
export function generateReservation({networkMagic,registryHash}){
 scalar(networkMagic,18446744069414584320n);assert.match(registryHash,/^[0-9a-f]{64}$/);const root=Array.from({length:8},(_,i)=>BigInt('0x'+registryHash.slice(i*8,i*8+8)).toString());const methods=[];
 const method=(name,params,body)=>{const d=new IntegerDsl();body(d);methods.push(`#[contract_method]\npub fn ${name}(&mut self, ctx: &mut ChainContext${params?', '+params:''}) {\n${d.text()}\n}`);};
 const remote=(u,n)=>`ctx.users[${u}].contract_state::<Self::ABI>(ctx.contract_id).${n}`;
 const read=(d,x)=>{const n=d.name('read');d.emit(`let ${n} = ${x};`);return n;};
 method('open_epoch','epoch: Felt, cutoff: Felt',d=>{d.range('epoch',32);d.range('cutoff',32);d.emit('require((self.epoch_phase == 0 || self.epoch_phase == 3) && epoch == self.epoch + 1 && cutoff > ctx.checkpoint_id && cutoff <= ctx.checkpoint_id + 128, "reservation epoch bounds"); self.epoch = epoch; self.epoch_cutoff = cutoff; self.epoch_phase = 1; self.active_owner = 0; self.active_nonce = 0;');});
 method('request_intent','vault: Felt, epoch: Felt, nonce: Felt, input: [Felt;2], minimum_mid: [Felt;2], minimum_final: [Felt;2], expiry: Felt, max_native: Felt, execution_key: Hash',d=>{
  d.range('vault',24);d.range('epoch',32);d.range('nonce',62);d.range('expiry',32);d.range('max_native',62);for(const n of['input','minimum_mid','minimum_final'])d.nonzero(n);
  d.emit('require(vault != 0 && vault != ctx.user_id && nonce == self.request_nonce + 1 && max_native > 0 && expiry > ctx.checkpoint_id, "intent terms");');
  const oldEpoch=read(d,remote('self.request_vault','epoch')),oldPhase=read(d,remote('self.request_vault','epoch_phase'));const newer=d.lessLimb('self.request_epoch',oldEpoch,32);
  d.emit(`require(self.request_epoch == 0 || ${newer} || (${oldEpoch} == self.request_epoch && ${oldPhase} == 3), "previous consent remains locked");`);
  const current=read(d,remote('vault','epoch')),phase=read(d,remote('vault','epoch_phase')),cutoff=read(d,remote('vault','epoch_cutoff'));
  d.emit(`require(${current} == epoch && ${phase} == 1 && ctx.checkpoint_id <= ${cutoff}, "matching open reservation required");`);
  d.emit('self.request_vault = vault; self.request_epoch = epoch; self.request_nonce = nonce; self.request_cancelled = 0; self.request_input = input; self.request_mid = minimum_mid; self.request_final = minimum_final; self.request_expiry = expiry; self.request_max_native = max_native; self.request_receiver = ctx.user_id; self.request_key = execution_key;');
  d.emit(`let commitment: Hash = [${networkMagic},ctx.contract_id,ctx.user_id,nonce]; commitment = psystd::poseidon_two_to_one(commitment,[vault,epoch,expiry,max_native]); commitment = psystd::poseidon_two_to_one(commitment,[input[0],input[1],minimum_mid[0],minimum_mid[1]]); commitment = psystd::poseidon_two_to_one(commitment,[minimum_final[0],minimum_final[1],ctx.user_id,1]); commitment = psystd::poseidon_two_to_one(commitment,execution_key); commitment = psystd::poseidon_two_to_one(commitment,[${root.slice(0,4)}]); commitment = psystd::poseidon_two_to_one(commitment,[${root.slice(4)}]); self.request_commitment = commitment;`);
 });
 method('request_cancel','nonce: Felt',d=>{d.emit('require(self.request_nonce == nonce && nonce != 0, "cancel nonce"); self.request_cancelled = 1;');});
 method('accept_reservation','owner: Felt, nonce: Felt',d=>{
  d.range('owner',24);d.range('nonce',62);d.emit('require(owner != 0 && owner != ctx.user_id && self.epoch_phase == 1 && self.active_owner == 0 && ctx.checkpoint_id <= self.epoch_cutoff && nonce > self.consumed[owner], "reservation acceptance bounds");');
  const r=Object.fromEntries(['request_vault','request_epoch','request_nonce','request_cancelled','request_expiry','request_receiver'].map(n=>[n,read(d,remote('owner',n))]));
  d.emit(`require(${r.request_vault} == ctx.user_id && ${r.request_epoch} == self.epoch && ${r.request_nonce} == nonce && ${r.request_cancelled} == 0 && ${r.request_expiry} >= ctx.checkpoint_id && ${r.request_receiver} == owner, "matching signed intent");`);
  const key=d.name('key'),actual=d.name('actual'),commit=d.name('commit');d.emit(`let ${key}: Hash = ${remote('owner','request_key')}; let ${actual}: Hash = ctx.user_public_key; let ${commit}: Hash = ${remote('owner','request_commitment')};`);for(let i=0;i<4;i++)d.emit(`require(${key}[${i}] == ${actual}[${i}], "execution key binding");`);
  d.emit(`self.active_owner = owner; self.active_nonce = nonce; self.active_expiry = ${r.request_expiry}; self.active_commitment = ${commit}; self.epoch_phase = 2;`);
 });
 method('cancel_reservation','',d=>{
  d.emit('require(self.epoch_phase == 2 && self.active_owner != 0, "no active reservation");');const nonce=read(d,remote('self.active_owner','request_nonce')),cancelled=read(d,remote('self.active_owner','request_cancelled'));
  d.emit(`require((${nonce} == self.active_nonce && ${cancelled} == 1) || ctx.checkpoint_id > self.active_expiry, "owner cancellation or timeout required"); self.consumed[self.active_owner] = self.active_nonce; self.epoch_phase = 3;`);
 });
 method('abort_empty_epoch','',d=>d.emit('require(self.epoch_phase == 1 && self.active_owner == 0 && ctx.checkpoint_id > self.epoch_cutoff, "only expired empty reservation"); self.epoch_phase = 3;'));
 return `// UNDEPLOYED reservation-only candidate; custody and route execution disabled.\n#[contract]\npub struct CompositionReservation {\npub reserved_view: ContractStateArray<1073741824,Felt>,\npub consumed: ContractStateArray<16777216,Felt>,\npub epoch: Felt, pub epoch_phase: Felt, pub epoch_cutoff: Felt, pub active_owner: Felt, pub active_nonce: Felt, pub active_expiry: Felt, pub active_commitment: Hash,\npub request_vault: Felt, pub request_epoch: Felt, pub request_nonce: Felt, pub request_cancelled: Felt, pub request_expiry: Felt, pub request_receiver: Felt, pub request_max_native: Felt, pub request_input: [Felt;2], pub request_mid: [Felt;2], pub request_final: [Felt;2], pub request_key: Hash, pub request_commitment: Hash,\n}\n#[contract_implementation]\nimpl CompositionReservation {\n${methods.join('\n')}\n}\n`;
}
