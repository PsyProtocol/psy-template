import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,cpSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';import{join}from'node:path';
import {compileAdmission,bindAdmission} from './build.mjs';
const root=process.env.ADMISSION_BUILD,compiler=process.env.ADMISSION_COMPILER;if(!root||!compiler)throw Error('frozen ADMISSION_BUILD and ADMISSION_COMPILER required');
const scratch=mkdtempSync(join(tmpdir(),'psy-admission-builder-'));
const read=p=>JSON.parse(readFileSync(p));
function options(kind,out){return {market:kind,compiler,native:root+'/native.json',tokenA:root+'/token/compilation_artifact.json',tokenB:root+'/token/compilation_artifact.json',nft:root+'/nft/compilation_artifact.json',config:read(`${root}/${kind}/config.json`),out};}
test('single-market candidates preserve all frozen source/artifact/policy bytes',()=>{
 for(const kind of ['amm','orderbook','bondingcurve','nftmarket']){
  const out=join(scratch,kind),r=compileAdmission(options(kind,out));assert.equal(r.marketId,null);assert.equal(r.fullUpsVerified,false);
  assert.equal(readFileSync(out+'/main.psy.rs','utf8'),readFileSync(`${root}/${kind}/main.psy.rs`,'utf8'));
  assert.deepEqual(read(out+'/compiled/compilation_artifact.json'),read(`${root}/${kind}/compiled/compilation_artifact.json`));
  const p=bindAdmission({build:out,marketId:1000,out:join(scratch,kind+'-policy')});assert.deepEqual(p,read(`${root}/${kind}/policy.json`));
  assert.throws(()=>compileAdmission(options(kind,out)),/fresh output/);
 }
});
test('domain, asset layout and native ABI substitution fail before output creation',()=>{
 const out=join(scratch,'wrong-domain'),x=options('amm',out);assert.throws(()=>compileAdmission({...x,config:{...x.config,networkMagic:'1'}}),/domain/);assert.equal(existsSync(out),false);
 const bad=read(x.tokenA);bad.state_tree_height=30;const file=join(scratch,'bad-token.json');writeFileSync(file,JSON.stringify(bad),{flag:'wx'});
 assert.throws(()=>compileAdmission({...x,tokenA:file,out:join(scratch,'wrong-height')}));
 const native=read(x.native);native.circuit_definitions.find(d=>d.name==='simple_burn').method_id=1;const n=join(scratch,'bad-native.json');writeFileSync(n,JSON.stringify(native),{flag:'wx'});
 assert.throws(()=>compileAdmission({...x,native:n,out:join(scratch,'wrong-native')}),/native method shape/);
});
test('late policy binding rejects asset aliases and altered candidate artifacts',()=>{
 // Independently compiled candidate, not a mutation of the frozen fixtures.
 const out=join(scratch,'binding-input');compileAdmission(options('amm',out));const cfg=read(out+'/config.json');
 assert.throws(()=>bindAdmission({build:out,marketId:cfg.assetA,out:join(scratch,'alias-policy')}),/distinct actual market ID/);
 const tampered=join(scratch,'tampered');cpSync(out,tampered,{recursive:true,errorOnExist:true,force:false});writeFileSync(tampered+'/main.psy.rs',readFileSync(tampered+'/main.psy.rs','utf8')+'\n// tampered candidate\n');
 assert.throws(()=>bindAdmission({build:tampered,marketId:2467,out:join(scratch,'tampered-policy')}),/changed build input/);
});
