// Offline ABI/IR consistency check. This does not verify a deployment proof.
import assert from 'node:assert/strict';
export function checkWideArtifact(artifact, baselineAbi) {
  const abi=artifact?.abi?.contract, baseline=baselineAbi?.contract;
  assert.ok(abi?.state_layout && baseline?.state_layout,'canonical layout manifest required');
  assert.equal(artifact.state_tree_height,32,'artifact tree height');
  assert.equal(abi.state_tree_height,32,'ABI tree height');
  assert.equal(abi.state_layout.field_count,22,'field count');
  assert.equal(abi.state_layout.slot_count,2_214_592_529,'slot count');
  assert.deepEqual(abi.state,baseline.state,'state offsets and types');
  assert.deepEqual(abi.state_layout,baseline.state_layout,'canonical state layout');
  assert.deepEqual(abi.methods,baseline.methods,'method IDs and argument ABI');
  const defs=artifact.circuit_definitions;
  assert.ok(Array.isArray(defs) && defs.length===14,'14 circuit definitions required');
  assert.equal(new Set(defs.map(d=>d.name)).size,14,'unique circuit names');
  assert.equal(new Set(defs.map(d=>d.method_id)).size,14,'unique circuit IDs');
  for (const method of abi.methods) {
    const definition=defs.find(d=>d.name===method.name);
    assert.ok(definition,`${method.name} definition missing`);
    assert.equal(definition.method_id,method.method_id,`${method.name} circuit ID`);
    const count=method.inputs.reduce((n,x)=>n+x.felt_size,0);
    assert.equal(definition.circuit_inputs.length,count,`${method.name} argument count`);
  }
  return {valid:true,methods:14,fields:22,slots:abi.state_layout.slot_count,deploymentReady:false};
}
