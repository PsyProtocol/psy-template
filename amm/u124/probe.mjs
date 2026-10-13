import {IntegerDsl} from './math.mjs';
import {writeFileSync} from 'node:fs';
const methods=[];
function method(name,params,body){const d=new IntegerDsl();body(d);methods.push(`#[contract_method]\npub fn ${name}(&mut self, ctx: &mut ChainContext, ${params}) {\n${d.text()}\n}`);}
method('product_equal','a: [Felt; 2], b: [Felt; 2], c: [Felt; 2], d: [Felt; 2]',p=>p.cmpDigits(p.product('a','b'),p.product('c','d'),'==','product equality'));
method('exact_swap','input: [Felt; 2], reserve_in: [Felt; 2], reserve_out: [Felt; 2], output: [Felt; 2]',p=>{for(const v of['input','reserve_in','reserve_out','output'])p.nonzero(v);p.add('input','reserve_in');const eff=p.mul(p.digits('input'),['9970']),den=p.addDigits(p.mul(p.digits('reserve_in'),['10000']),eff);p.floor('output',p.mul(eff,p.digits('reserve_out')),den,'exact swap floor');});
writeFileSync(new URL('./contract/src/arithmetic-probe.psy.rs',import.meta.url),`// LOCAL ARITHMETIC PROOF ONLY; never deploy.\n#[contract]\npub struct Probe {pub unused: Felt,}\n#[contract_implementation]\nimpl Probe {\n${methods.join('\n')}\n}\n`);
