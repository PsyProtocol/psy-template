// U124 privacy using the existing single-Felt note-inclusion verifier.
// Two denomination roots prevent interpreting a low-limb note as high-limb credit.
import {readFileSync,writeFileSync} from 'node:fs';
import {canonical,add,sub,expand,range,zero} from '../generate.mjs';
import {NOTE_ROOT_SLOTS,PRIVATE_FINGERPRINT} from './constants.mjs';
const same=(a,b)=>Array.from({length:4},(_,i)=>`${a}[${i}] == ${b}[${i}]`).join(' && ');
const zeroHash=a=>Array.from({length:4},(_,i)=>`${a}[${i}] == 0`).join(' && ');
const appendTree=(limb,name)=>`
if value[${limb}] != 0 {
 let idx = self.private_note_count_${name};
 ${range('idx',20).code}
 let value_hash: Hash = [value[${limb}], 0, 0, 0];
 let commitment: Hash = psystd::poseidon_two_to_one(psystd::poseidon_two_to_one(receiver, value_hash), ${name}_note_secret_hash);
 let current: Hash = commitment;
 let zero: Hash = [0, 0, 0, 0];
 let path_index: Felt = idx;
 for level in 0..20 {
  let is_right: Felt = path_index & 1;
  let is_left: Felt = 1 - is_right;
  let previous: Hash = self.private_last_path_${name}[level];
  let left: Hash = [current[0]*is_left + previous[0]*is_right, current[1]*is_left + previous[1]*is_right, current[2]*is_left + previous[2]*is_right, current[3]*is_left + previous[3]*is_right];
  let right: Hash = [zero[0]*is_left + current[0]*is_right, zero[1]*is_left + current[1]*is_right, zero[2]*is_left + current[2]*is_right, zero[3]*is_left + current[3]*is_right];
  self.private_last_path_${name}[level] = left;
  current = psystd::poseidon_two_to_one(left, right);
  zero = psystd::poseidon_two_to_one(zero, zero);
  path_index = path_index >> 1;
 }
 self.private_note_root_${name} = current;
 self.private_note_count_${name} = idx + 1;
 psystd::emit_event(15, ctx.user_id, ${limb}, commitment, idx);
}
`;
const verifyLimb=(limb,name)=>`
if amount[${limb}] != 0 {
 ${range(`${name}_proof.index`,16).code}
 let public_inputs_hash: Hash = psystd::poseidon_hash(receiver[0], receiver[1], receiver[2], receiver[3], amount[${limb}], user_tree_root[0], user_tree_root[1], user_tree_root[2], user_tree_root[3], checkpoint_id, ${NOTE_ROOT_SLOTS[limb]}, ctx.contract_id, ${name}_nullifier[0], ${name}_nullifier[1], ${name}_nullifier[2], ${name}_nullifier[3]);
 let current: Hash = psystd::poseidon_two_to_one(private_note_inclusion_fingerprint, public_inputs_hash);
 for i in 0..16 {
  let sibling: Hash = ${name}_proof.siblings[i];
  let index_bit: Felt = (${name}_proof.index >> i) & 1;
  let other_bit: Felt = 1 - index_bit;
  let left: Hash = [current[0]*other_bit + sibling[0]*index_bit, current[1]*other_bit + sibling[1]*index_bit, current[2]*other_bit + sibling[2]*index_bit, current[3]*other_bit + sibling[3]*index_bit];
  let right: Hash = [sibling[0]*other_bit + current[0]*index_bit, sibling[1]*other_bit + current[1]*index_bit, sibling[2]*other_bit + current[2]*index_bit, sibling[3]*other_bit + current[3]*index_bit];
  current = psystd::poseidon_two_to_one(left, right);
 }
 require(${same('current','expected_root')}, "private ${name} proof tree root mismatch");
 let nullifier_key: Hash = psystd::poseidon_hash(1, ${name}_nullifier[0], ${name}_nullifier[1], ${name}_nullifier[2], ${name}_nullifier[3]);
 require(!self.private_nullifiers.contains(nullifier_key), "nullifier already claimed");
 self.private_nullifiers.insert(nullifier_key, [1, 0, 0, 0]);
} else {
 require(${zeroHash(name+'_nullifier')} && ${name}_proof.index == 0, "zero limb must use an empty proof");
 for i in 0..16 { let sibling: Hash = ${name}_proof.siblings[i]; require(${zeroHash('sibling')}, "zero limb must use empty siblings"); }
}
`;
let source=readFileSync(new URL('../src/main.psy.rs',import.meta.url),'utf8');
source=source.replace(/^\/\/[^]*?\n#\[derive/,`// U124 private profile; new deployment required. Never overwrite the public layout.
// Claims prove each nonzero limb against its fixed denomination root.
#[derive`);
source=source.replace('const ISSUER_USER_ID',`#[derive(FeltSized)]
pub struct PrivateClaimProof { pub siblings: [Hash; 16], pub index: Felt, }

const ISSUER_USER_ID`);
const marker='    pub delegation_spends: ContractStateArray<268435456, DelegationSpend>,';
if(source.split(marker).length!==2)throw Error('Public layout changed');
source=source.replace(marker,marker+`
    // Public profile ends at felt 1174405221; align roots to four-Felt leaves.
    pub private_alignment: [Felt; 3],
    pub private_note_root_low: Hash,
    pub private_note_root_high: Hash,
    pub private_note_count_low: Felt,
    pub private_note_count_high: Felt,
    pub private_last_path_low: ContractStateArray<20, Hash>,
    pub private_last_path_high: ContractStateArray<20, Hash>,
    // Existing note circuit requires state tree height 32.
    pub private_reserved: ContractStateArray<1000000000, Felt>,
    pub private_nullifiers: ContractHashMap<Hash, Hash, 1048576>,`);
let methods=`
 #[contract_method]
 pub fn private_transfer(&mut self, ctx: &mut ChainContext, receiver: Hash, value: [Felt; 2], low_note_secret_hash: Hash, high_note_secret_hash: Hash) {
  ${canonical('value')}
  require(!${zero('value')}, "value must be positive");
  let stored_balance = self.balance;
  ${sub('next_private_balance','stored_balance','value')}
  ${appendTree(0,'low')}
  ${appendTree(1,'high')}
  self.balance = next_private_balance;
 }
 #[contract_method]
 pub fn private_claim(&mut self, ctx: &mut ChainContext, receiver: Hash, amount: [Felt; 2], user_tree_root: Hash, checkpoint_id: Felt, random0: Felt, random1: Felt, low_nullifier: Hash, high_nullifier: Hash, low_proof: PrivateClaimProof, high_proof: PrivateClaimProof) {
  ${canonical('amount')}
  require(!${zero('amount')}, "claim amount must be positive");
  let expected_receiver: Hash = psystd::poseidon_hash(ctx.user_id, 1337, random0, random1);
  require(${same('receiver','expected_receiver')}, "receiver does not match claiming user");
  let expected_user_tree_root: Hash = psystd::checkpoint_user_tree_root(checkpoint_id);
  require(${same('user_tree_root','expected_user_tree_root')}, "user tree root does not match checkpoint state");
  require(amount[0] == 0 || amount[1] == 0 || !(${same('low_nullifier','high_nullifier')}), "limbs must use distinct nullifiers");
  let stored_balance = self.balance;
  ${add('next_private_balance','stored_balance','amount')}
  let private_note_inclusion_fingerprint: Hash = [${PRIVATE_FINGERPRINT.join(', ')}];
  let expected_root: Hash = psystd::session_proof_tree_root();
  ${verifyLimb(0,'low')}
  ${verifyLimb(1,'high')}
  self.balance = next_private_balance;
  psystd::emit_event(16, ctx.user_id, low_nullifier, high_nullifier, amount);
 }
`;
source=source.trimEnd();if(!source.endsWith('}'))throw Error('Missing impl end');
source=(source.slice(0,-1)+expand(methods)+'}\n').replace(/[ \t]+$/gm,'');
const path=new URL('./src/main.psy.rs',import.meta.url);
if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==source)throw Error('Generated private source differs');}else writeFileSync(path,source);
console.log('Generated 22 U124 methods with two denomination note trees.');
