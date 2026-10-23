import test from 'node:test';import assert from 'node:assert/strict';
import{mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{createHash}from'node:crypto';
import{copyCompiledArtifact}from'./contract/artifacts.mjs';
test('Goldilocks and U124 bytecode constants survive copying exactly; wrong digest and overwrite fail',()=>{
 const base=mkdtempSync(join(tmpdir(),'composition-artifact-'));try{
  const source=join(base,'original.json'),out=join(base,'copy.json');
  const raw='{"abi":{"contract":{"methods":[{"method_id":123,"input_felt_count":2}]}},"circuit_definitions":[{"literal":4611686018427387904,"goldilocks":18446744069414584320}]}\n';
  writeFileSync(source,raw,{flag:'wx'});const sha=createHash('sha256').update(raw).digest('hex');
  assert.notEqual(JSON.stringify(JSON.parse(raw))+'\n',raw,'fixture exercises native JSON rounding');
  assert.throws(()=>copyCompiledArtifact(source,out,'b'.repeat(64)));assert.equal(existsSync(out),false);
  const copied=copyCompiledArtifact(source,out,sha);assert.equal(copied.sha256,sha);assert.equal(readFileSync(out,'utf8'),raw);
  assert.throws(()=>copyCompiledArtifact(source,out,sha));assert.equal(readFileSync(source,'utf8'),raw);
 }finally{rmSync(base,{recursive:true,force:true});}
});
