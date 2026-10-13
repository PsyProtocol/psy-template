// Generate straight-line wide comparisons: no helper return/invoke_sync required.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('usage: generate.mjs [--check]');
const checkOnly = process.argv.includes('--check');
function emit(url, value) {
  if (checkOnly) {
    if (readFileSync(url, 'utf8') !== value) throw new Error(`Generated source differs: ${url}`);
  } else writeFileSync(url, value);
}
const baseUrl=new URL('../contract/src/main.psy.rs',import.meta.url);
let source=readFileSync(baseUrl,'utf8');
const expected='dbae94c0aac9ed83a54cc1d058b074a35c6a5df9372817105570ac3846811e3b';
if (createHash('sha256').update(source).digest('hex')!==expected) throw new Error('Reviewed base source changed; reconcile before regenerating');
source=source.replaceAll('10000000','1000000000000');
source=source.replaceAll('require(reserve_in > 0 && reserve_out > 0, "pool empty");', 'require(reserve_in > 0 && reserve_out > 0 && reserve_in <= 1000000000000 && reserve_out <= 1000000000000, "invalid pool reserves");');
source=source.replace('require(amount_psy <= 1000000000000 - rp','require(rp <= 1000000000000 && ru <= 1000000000000, "invalid reserves");\n        require(amount_psy <= 1000000000000 - rp');
source=source.replace('require(owned >= burned && total >= burned + 1000','require(burned <= 1000000000000 && owned <= 1000000000000, "invalid shares");\n        require(owned >= burned && total >= burned + 1000');
const weighted=(n)=>Array.from({length:28},(_,i)=>`${n}[${i}].to_felt() * ${2**i}`).join(' + ');
function product(prefix,a,b){
  const p=prefix;
  return `let ${p}a = ${a};\nlet ${p}b = ${b};\nrequire(${p}a < 72057594037927936 && ${p}b < 72057594037927936, "wide operand exceeds 56 bits");\nlet ${p}ab = psystd::split_bits(${p}a, 56);\nlet ${p}bb = psystd::split_bits(${p}b, 56);\nlet ${p}a0 = ${weighted(p+'ab')};\nlet ${p}b0 = ${weighted(p+'bb')};\nlet ${p}a1 = (${p}a - ${p}a0) / 268435456;\nlet ${p}b1 = (${p}b - ${p}b0) / 268435456;\nlet ${p}c0 = ${p}a0 * ${p}b0;\nlet ${p}c0b = psystd::split_bits(${p}c0, 56);\nlet ${p}p0 = ${weighted(p+'c0b')};\nlet ${p}carry0 = (${p}c0 - ${p}p0) / 268435456;\nlet ${p}c1 = ${p}a0 * ${p}b1 + ${p}a1 * ${p}b0 + ${p}carry0;\nlet ${p}c1b = psystd::split_bits(${p}c1, 57);\nlet ${p}p1 = ${weighted(p+'c1b')};\nlet ${p}carry1 = (${p}c1 - ${p}p1) / 268435456;\nlet ${p}c2 = ${p}a1 * ${p}b1 + ${p}carry1;\nlet ${p}c2b = psystd::split_bits(${p}c2, 57);\nlet ${p}p2 = ${weighted(p+'c2b')};\nlet ${p}p3 = (${p}c2 - ${p}p2) / 268435456;\n`;
}
let index=0;
function compare(a,b,op,c,d,message){
  const n=++index,l=`w${n}l`,r=`w${n}r`;
  let condition;
  if(op==='==') condition=[0,1,2,3].map(i=>`${l}p${i} == ${r}p${i}`).join(' && ');
  else condition=`${l}p3 < ${r}p3 || (${l}p3 == ${r}p3 && (${l}p2 < ${r}p2 || (${l}p2 == ${r}p2 && (${l}p1 < ${r}p1 || (${l}p1 == ${r}p1 && ${l}p0 ${op} ${r}p0)))))`;
  return `// Wide integer comparison ${n}; all column intermediates < 2^58.\n${product(l,a,b)}${product(r,c,d)}require(${condition}, "${message}");`;
}
function replace(old,text,count=1){
  const found=source.split(old).length-1;
  if(found!==count) throw new Error(`Expected ${count} replacements, got ${found}: ${old}`);
  source=source.replaceAll(old,text);
}
replace('let numerator = amount_in * 9970 * reserve_out;', 'let effective_in = amount_in * 9970;',2);
replace('require(amount_out * denominator <= numerator, "output above exact quote");',compare('amount_out','denominator','<=','effective_in','reserve_out','output above exact quote'),2);
replace('require(numerator < (amount_out + 1) * denominator, "output below exact quote");',compare('effective_in','reserve_out','<','amount_out + 1','denominator','output below exact quote'),2);
replace('let product = amount_psy * amount_usdt;','// Initial LP shares use a wide square-root bound.');
replace('require(gross * gross <= product, "initial shares too high");',compare('gross','gross','<=','amount_psy','amount_usdt','initial shares too high'));
replace('require(product < (gross + 1) * (gross + 1), "initial shares too low");',compare('amount_psy','amount_usdt','<','gross + 1','gross + 1','initial shares too low'));
replace('require(amount_psy * ru == amount_usdt * rp, "deposit ratio mismatch");',compare('amount_psy','ru','==','amount_usdt','rp','deposit ratio mismatch'));
for(const [amount,reserve,label] of [['amount_psy','rp','PSY'],['amount_usdt','ru','pUSDT']]){
  replace(`require(minted * ${reserve} <= ${amount} * total && ${amount} * total < (minted + 1) * ${reserve}, "wrong ${label} shares");`,compare('minted',reserve,'<=',amount,'total',`wrong ${label} shares`)+ '\n'+compare(amount,'total','<','minted + 1',reserve,`wrong ${label} shares`));
  replace(`require(${amount} * total <= burned * ${reserve} && burned * ${reserve} < (${amount} + 1) * total, "wrong ${label} withdrawal");`,compare(amount,'total','<=','burned',reserve,`wrong ${label} withdrawal`)+'\n'+compare('burned',reserve,'<',`${amount} + 1`,'total',`wrong ${label} withdrawal`));
}
source=source.replace('// All quote products are below 2*10^18, below the field modulus.','// Quote denominators fit a Felt; products use exact wide comparison.');
const header=`// UNDEPLOYED wide-arithmetic candidate; reserve/share cap 10^12 base units.\n// Generated by amm/wide/generate.mjs from SHA256 ${expected}.\n// Division by 2^28 occurs only on exactly divisible integer columns.\n`;
emit(new URL('./contract/src/main.psy.rs',import.meta.url),header+source);
console.log(`Generated ${index} comparison templates; swap templates occur in both branches.`);
// The proof probe uses the same generated comparison templates and bounds.
const probes = [['verify_le','<='],['verify_lt','<'],['verify_eq','==']].map(([name,op])=>
  `#[contract_method]\npub fn ${name}(&mut self, ctx: &mut ChainContext, a: Felt, b: Felt, c: Felt, d: Felt) {\n${compare('a','b',op,'c','d','integer comparison rejected')}\n}`);
emit(new URL('./contract/src/arithmetic-probe.psy.rs',import.meta.url),`// Offline proof probe only, never deploy.\n#[contract]\npub struct WideProbe {pub unused: Felt,}\n#[contract_implementation]\nimpl WideProbe {${probes.join('\n')}}\n`);
