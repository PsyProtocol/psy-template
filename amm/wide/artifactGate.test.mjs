import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkWideArtifact } from './artifactGate.mjs';
const artifact=JSON.parse(readFileSync(process.env.AMM_WIDE_ARTIFACT??new URL('./verification-2026-10-11/compiled-attempt-3/compilation_artifact.json',import.meta.url)));
const baseline=JSON.parse(readFileSync(new URL('../contract/target-pusdt-verified/abi.json',import.meta.url)));
test('wide compilation preserves all 22 state fields and the 14-method ABI',()=>{
  const result=checkWideArtifact(artifact,baseline);
  assert.equal(result.valid,true);
  assert.equal(result.deploymentReady,false);
});
test('missing layout, changed offsets and changed argument definitions fail the gate',()=>{
  const missing=structuredClone(artifact); delete missing.abi.contract.state_layout;
  assert.throws(()=>checkWideArtifact(missing,baseline));
  const offset=structuredClone(artifact); offset.abi.contract.state[4].offset++;
  assert.throws(()=>checkWideArtifact(offset,baseline));
  const argumentsChanged=structuredClone(artifact);argumentsChanged.circuit_definitions[0].circuit_inputs.push(0);
  assert.throws(()=>checkWideArtifact(argumentsChanged,baseline));
});
test('duplicate or changed circuit method IDs fail the gate',()=>{
  const changed=structuredClone(artifact); changed.circuit_definitions[0].method_id++;
  assert.throws(()=>checkWideArtifact(changed,baseline));
  const duplicate=structuredClone(artifact);duplicate.circuit_definitions[1]=structuredClone(duplicate.circuit_definitions[0]);
  assert.throws(()=>checkWideArtifact(duplicate,baseline));
});
