// Generate the complete public Token profile; no contract helper return/invoke_sync.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const RADIX='4611686018427387904';
const at=(a,i)=>`${a}[${i}]`;
let serial=0;const comparisons=new Map();
const tag=label=>`u124_${label}_${++serial}`;
function range(value,bits,label='range'){
 const id=tag(label);
 // Explicit weighted recomposition also works in the local VM oracle, whose
 // SumBits evaluator currently sums bits without their positional weights.
 const weighted=Array.from({length:bits},(_,i)=>`${id}[${i}].to_felt() * ${1n<<BigInt(i)}`).join(' + ');
 return {id,code:`let ${id} = psystd::split_bits(${value}, ${bits});\nrequire(${weighted} == ${value}, "noncanonical integer range");`};
}
export const canonical=a=>range(at(a,0),62).code+'\n'+range(at(a,1),62).code;
export const zero=a=>`(${at(a,0)} == 0 && ${at(a,1)} == 0)`;
function limbLess(out,a,b,bits=62){
 const x=range(a,bits,'left'),y=range(b,bits,'right');
 return `${x.code}\n${y.code}\nlet ${out} = false;\nfor bit in 0..${bits} { ${out} = (!${x.id}[bit] && ${y.id}[bit]) || (${x.id}[bit] == ${y.id}[bit] && ${out}); }`;
}
function compare(a,b,strict){const id=tag('cmp');comparisons.set(id,limbLess(id+'_lo',at(a,0),at(b,0))+'\n'+limbLess(id+'_hi',at(a,1),at(b,1))+`\nlet ${id} = ${id}_hi || (${at(a,1)} == ${at(b,1)} && ${id}_lo)${strict?'':` || (${at(a,1)} == ${at(b,1)} && ${at(a,0)} == ${at(b,0)})`};`);return id;}
function scalarLe(a,b,bits=62){const id=tag('scalar_cmp');comparisons.set(id,limbLess(id+'_lt',a,b,bits)+`\nlet ${id} = ${id}_lt || ${a} == ${b};`);return id;}
export const le=(a,b)=>compare(a,b,false);
export const lt=(a,b)=>compare(a,b,true);
export function add(out,a,b){const low=range(out+'_low_sum',63,'low_sum');return `${canonical(a)}\n${canonical(b)}\nlet ${out}_low_sum = ${at(a,0)} + ${at(b,0)};\n${low.code}\nlet ${out}_carry = ${low.id}[62].to_felt();\nlet ${out}_high = ${at(a,1)} + ${at(b,1)} + ${out}_carry;\nlet ${out}: [Felt; 2] = [${out}_low_sum - ${out}_carry * ${RADIX}, ${out}_high];\n${canonical(out)}`;}
export function sub(out,a,b){return `${canonical(a)}\n${canonical(b)}\nrequire(${le(b,a)}, "amount subtraction underflow");\n${limbLess(out+'_needs_borrow',at(a,0),at(b,0))}\nlet ${out}_borrow = ${out}_needs_borrow.to_felt();\nlet ${out}: [Felt; 2] = [${at(a,0)} + ${out}_borrow * ${RADIX} - ${at(b,0)}, ${at(a,1)} - ${at(b,1)} - ${out}_borrow];\n${canonical(out)}`;}
function expand(body){
 let result='',cursor=0,match;const re=/require\(/g;
 while((match=re.exec(body))){let end=re.lastIndex,depth=1;while(depth){const c=body[end++];if(c==='(')depth++;if(c===')')depth--;if(end>body.length)throw Error('Unbalanced require');}
  const call=body.slice(match.index,end);let code='';for(const[id,fragment]of comparisons)if(new RegExp(`\\b${id}\\b`).test(call))code+=fragment+'\n';
  result+=body.slice(cursor,match.index)+code+call;cursor=end;re.lastIndex=end;
 }return result+body.slice(cursor);
}
let source=readFileSync(new URL('../src/main.psy.rs',import.meta.url),'utf8');
const base='fd0669238a091266dd9d0f51ed159e1b6677d25189c32877be1788ef6683d078';
if(createHash('sha256').update(source).digest('hex')!==base)throw Error('Reviewed public token base changed');
source=source.replace(/pub (balance|total_minted|total_supply|max_supply|burn_requested|amount_sent|amount_claimed|allocated_amount|spent): Felt,/g,'pub $1: [Felt; 2],');
source=source.replace('pub burn_settled: ContractStateArray<16777216, Felt>,','pub burn_settled: ContractStateArray<16777216, [Felt; 2]>,');
source=source.replaceAll('amount: Felt','amount: [Felt; 2]').replace('cap: Felt','cap: [Felt; 2]');
source=source.replace('amounts: [Felt; 2]','amounts: [Felt; 4]').replace('amounts: [Felt; 5]','amounts: [Felt; 10]');
let count=0;
function transform(name,body){
 const replace=(old,next,n=1)=>{if(body.split(old).length-1!==n)throw Error(`${name}: replacement count differs: ${old}`);body=body.replaceAll(old,next);};
 const positive='require(amount > 0, ';if(body.includes(positive)){body=body.replaceAll(positive,`${canonical('amount')}\n        require(!${zero('amount')}, `);}
 if(name==='set_max_supply'){
  replace('self.total_minted == 0 && self.max_supply == 0',`${zero('self.total_minted')} && ${zero('self.max_supply')}`);
  replace('require(cap > 0,',`${canonical('cap')}\n        require(!${zero('cap')},`);
 }
 if(['mint','mint_to'].includes(name)){
  replace('require(amount <= 18446744069414584320 - self.total_minted, "total minted overflow");',add('next_minted','self.total_minted','amount'));
  replace('require(self.max_supply == 0 || amount <= self.max_supply - self.total_minted, "max supply exceeded");',`${canonical('self.max_supply')}\n        require(${zero('self.max_supply')} || ${le('next_minted','self.max_supply')}, "max supply exceeded");`);
  replace('require(amount <= 18446744069414584320 - self.total_supply, "total supply overflow");',add('next_supply','self.total_supply','amount'));
  replace('self.total_minted += amount;','self.total_minted = next_minted;');replace('self.total_supply += amount;','self.total_supply = next_supply;');
  if(name==='mint'){replace('require(amount <= 18446744069414584320 - self.balance, "balance overflow");',add('next_balance','self.balance','amount'));replace('self.balance += amount;','self.balance = next_balance;');}
  else{replace('require(amount <= 18446744069414584320 - sent, "amount sent overflow");',add('next_sent','sent','amount'));replace('self.other_user_info[recipient].amount_sent = sent + amount;','self.other_user_info[recipient].amount_sent = next_sent;');}
 }
 if(name==='burn'){
  replace('require(self.balance >= amount, "insufficient balance to burn");',sub('next_balance','self.balance','amount'));
  replace('require(amount <= 18446744069414584320 - self.burn_requested, "burn request overflow");',add('next_requested','self.burn_requested','amount'));
  replace('self.balance -= amount;','self.balance = next_balance;');replace('self.burn_requested += amount;','self.burn_requested = next_requested;');
 }
 if(name==='settle_burn'){
  replace('requested > settled',lt('settled','requested'));
  replace('let amount = requested - settled;',sub('amount','requested','settled'));
  replace('require(self.total_supply >= amount, "burn exceeds total supply");',sub('next_supply','self.total_supply','amount'));
  replace('self.total_supply -= amount;','self.total_supply = next_supply;');
 }
 if(name==='transfer'){
  replace('require(self.balance >= amount, "insufficient balance");',sub('next_balance','self.balance','amount'));
  replace('require(amount <= 18446744069414584320 - sent, "amount sent overflow");',add('next_sent','sent','amount'));
  replace('self.other_user_info[recipient].amount_sent = sent + amount;','self.other_user_info[recipient].amount_sent = next_sent;');replace('self.balance -= amount;','self.balance = next_balance;');
 }
 if(name==='claim'){
  replace('sender_total > already_claimed',lt('already_claimed','sender_total'));
  replace('let claimable = sender_total - already_claimed;',sub('claimable','sender_total','already_claimed'));
  replace('require(claimable <= 18446744069414584320 - self.balance, "balance overflow");',add('next_balance','self.balance','claimable'));
  replace('self.balance += claimable;','self.balance = next_balance;');
 }
 if(name==='cancel_unclaimed_payment'){
  replace('sender_total > info.amount_claimed',lt('info.amount_claimed','sender_total'));
  replace('let amount = sender_total - info.amount_claimed;',sub('amount','sender_total','info.amount_claimed'));
  replace('require(amount <= 18446744069414584320 - info.amount_sent, "refund outbox overflow");',add('next_sent','info.amount_sent','amount'));
  replace('self.other_user_info[sender].amount_sent = info.amount_sent + amount;','self.other_user_info[sender].amount_sent = next_sent;');
 }
 if(name==='refund_claimed_payment'){
  replace('require(info.amount_claimed >= info.amount_sent, "claimed payment already spent");',sub('credit','info.amount_claimed','info.amount_sent'));
  replace('amount <= info.amount_claimed - info.amount_sent',le('amount','credit'));
  replace('require(self.balance >= amount, "insufficient balance for refund");',sub('next_balance','self.balance','amount')+'\n'+add('next_sent','info.amount_sent','amount'));
  replace('self.other_user_info[sender].amount_sent = info.amount_sent + amount;','self.other_user_info[sender].amount_sent = next_sent;');replace('self.balance -= amount;','self.balance = next_balance;');
 }
 if(name.startsWith('batch_transfer_')){
  replace('let total: Felt = 0;','let total: [Felt; 2] = [0, 0];');
  replace('require(amounts[i] <= 18446744069414584320 - total, "total amount overflow");\n            total += amounts[i];',`let item: [Felt; 2] = [amounts[i * 2], amounts[i * 2 + 1]];\n            ${add('next_total','total','item')}\n            total = next_total;`);
  replace('require(self.balance >= total, "insufficient balance for batch transfer");',sub('next_balance','self.balance','total'));
  replace('let amount = amounts[i];','let amount: [Felt; 2] = [amounts[i * 2], amounts[i * 2 + 1]];');replace('if amount > 0 {',`if !${zero('amount')} {`);
  replace('require(amount <= 18446744069414584320 - sent, "amount sent overflow");',add('next_sent','sent','amount'));
  replace('self.other_user_info[recipient].amount_sent = sent + amount;','self.other_user_info[recipient].amount_sent = next_sent;');replace('self.balance -= total;','self.balance = next_balance;');
 }
 if(name==='open_delegation_channel'){
  replace('require(self.balance >= amount, "insufficient balance to allocate");',sub('next_balance','self.balance','amount'));replace('self.balance -= amount;','self.balance = next_balance;');
 }
 if(['spend_delegation','close_delegation_channel'].includes(name)){
  replace('let spent: Felt = ledger.spent * same_version.to_felt();',`${canonical('ledger.spent')}\n        let spent: [Felt; 2] = [ledger.spent[0] * same_version.to_felt(), ledger.spent[1] * same_version.to_felt()];`);
  if(name==='spend_delegation'){
   replace('require(spent <= allocated && amount <= allocated - spent, "insufficient delegation allowance");',add('next_spent','spent','amount')+`\n${canonical('allocated')}\n        require(${le('next_spent','allocated')}, "insufficient delegation allowance");`);
   replace('require(amount <= 18446744069414584320 - sent, "amount sent overflow");',add('next_sent','sent','amount'));replace('spent: spent + amount,','spent: next_spent,');replace('self.other_user_info[recipient].amount_sent = sent + amount;','self.other_user_info[recipient].amount_sent = next_sent;');
  }
 }
 if(name==='finalize_revoke_delegation'){
  replace('require(remote_spent <= ch.allocated_amount, "confirmed spent exceeds allocation");','');
  replace('let refund = ch.allocated_amount - remote_spent;',sub('refund','ch.allocated_amount','remote_spent'));
  replace('require(refund <= 18446744069414584320 - self.balance, "balance overflow");',add('next_balance','self.balance','refund'));replace('self.balance += refund;','self.balance = next_balance;');replace('allocated_amount: 0,','allocated_amount: [0, 0],');
 }
 // Bind scalar ranges with short bit decompositions as well. Versions use
 // 62 bits; addresses and channel indices use exactly their array capacities.
 body=body.replace('ch.channel_version < 18446744069414584320',scalarLe('ch.channel_version','4611686018427387902'));
 body=body.replace('ledger.channel_version <= version',scalarLe('ledger.channel_version','version'));
 body=body.replace('ledger.channel_version <= channel_version',scalarLe('ledger.channel_version','channel_version'));
 body=body.replace('channel_version > 0','channel_version != 0');
 body=body.replace('decimals <= 18',scalarLe('decimals','18',5));
 for(const variable of ['ctx.user_id','recipient','sender','spender','owner','channel_idx']){
  const old=variable+' < '+(variable==='channel_idx'?'16':'16777216');
  const id=tag('scalar_range');comparisons.set(id,range(variable,variable==='channel_idx'?4:24).code+`\nlet ${id} = true;`);body=body.replaceAll(old,id);
 }
 body=expand(body);
 // The current compiler requires reading inline arrays and struct elements
 // into locals before indexing their limbs. Keep the SDK/compiler unchanged.
 body=body.replaceAll('let sent = self.other_user_info[recipient].amount_sent;','let sent_info = self.other_user_info[recipient];\n        let sent = sent_info.amount_sent;');
 body=body.replace('let already_claimed = self.other_user_info[sender].amount_claimed;','let claim_info = self.other_user_info[sender];\n        let already_claimed = claim_info.amount_claimed;');
 let reads='';for(const field of ['balance','total_minted','total_supply','max_supply','burn_requested']){
  if(body.includes(`self.${field}[`)){reads+=`\n        let stored_${field} = self.${field};`;body=body.replaceAll(`self.${field}[`,`stored_${field}[`);}
 }
 body=reads+body;
 return body;
}
// Transform bodies with balanced braces, keeping every original method and guard.
let output='',cursor=0;const pattern=/pub fn (\w+)\([^]*?\)\s*\{/g;let match;
while((match=pattern.exec(source))){const start=pattern.lastIndex;let end=start,depth=1;while(depth&&end<source.length){const c=source[end++];if(c==='{')depth++;if(c==='}')depth--;}
 output+=source.slice(cursor,start)+transform(match[1],source.slice(start,end-1))+'}';cursor=end;pattern.lastIndex=end;count++;}
output+=source.slice(cursor);if(count!==20)throw Error('Public method count changed');
output=`// UNDEPLOYED public U124 token profile. Each amount is [low62, high62].\n// Generated from public token SHA256 ${base}; never update a single-Felt deployment with this layout.\n`+output;
const path=new URL('./src/main.psy.rs',import.meta.url);
output=output.replace(/[ \t]+$/gm,'');
if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==output)throw Error('Generated source differs');}else writeFileSync(path,output);
const probe=expand(`#[contract]\npub struct AmountProbe { pub unused: Felt, }\n#[contract_implementation]\nimpl AmountProbe {\n#[contract_method]\npub fn verify_add(&mut self, ctx: &mut ChainContext, a: [Felt; 2], b: [Felt; 2], expected: [Felt; 2]) { ${add('sum','a','b')} ${canonical('expected')} require(sum[0] == expected[0] && sum[1] == expected[1], "wrong sum"); }\n#[contract_method]\npub fn verify_sub(&mut self, ctx: &mut ChainContext, a: [Felt; 2], b: [Felt; 2], expected: [Felt; 2]) { ${sub('difference','a','b')} ${canonical('expected')} require(difference[0] == expected[0] && difference[1] == expected[1], "wrong difference"); }\n}\n`);
const probePath=new URL('./src/arithmetic-probe.psy.rs',import.meta.url);
if(process.argv.includes('--check')){if(readFileSync(probePath,'utf8')!==probe)throw Error('Generated probe differs');}else writeFileSync(probePath,probe);
console.log(`Generated ${count} public methods using U124 amounts.`);
