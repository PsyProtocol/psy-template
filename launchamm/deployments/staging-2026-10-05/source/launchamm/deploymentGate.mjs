import assert from 'node:assert/strict';
import {CANONICAL_VERIFIER,proofInputs,root} from '../bondingcurve/check_deploy_layout.mjs';

// Use a separately regenerated artifact review; cryptographic verification is
// performed by review_deploy before the exact checked request is submitted.
export function checkNewDeployment(request, artifact, review, deployer) {
  assert.ok(!request.update_contract, 'updates are forbidden');
  const d=request.deploy_contract, abi=artifact.abi.contract, l=abi.state_layout;
  assert.ok(d && deployer, 'new deployment and expected deployer required');
  assert.equal(d.deployer,deployer,'deployer identity');
  assert.equal(d.code_root,review.codeRoot,'independently regenerated code root');
  assert.equal(d.code_definition.state_tree_height,artifact.state_tree_height);
  assert.equal(abi.state_tree_height,artifact.state_tree_height);
  assert.equal(request.canonical_layout_verifier_fingerprint,CANONICAL_VERIFIER);
  assert.equal(request.layout_protocol_version,1);
  assert.equal(request.state_layout_root,review.layoutRoot);
  assert.equal(request.state_layout_field_count,l.field_count);
  assert.equal(request.state_layout_slot_count,l.slot_count);
  assert.equal(l.fields.length,l.field_count);
  assert.deepEqual(d.code_definition.functions.map(x=>x.method_id).sort((a,b)=>a-b),abi.methods.map(x=>x.method_id).sort((a,b)=>a-b));
  const pi=proofInputs(request.canonical_layout_proof);
  assert.equal(pi[0],0n,'new deployment sentinel');assert.equal(pi[1],1n);
  assert.equal(root(pi.slice(2,6)),'b768e4fc8b0b79f516c9da6ea83aa4b13c9a42c646c4c1f9e979ed3ee20855e3','empty old layout');
  assert.equal(pi[6],0n,'old fields');assert.equal(pi[7],0n,'old slots');
  assert.equal(root(pi.slice(8,12)),review.layoutRoot,'proof new layout');
  assert.equal(pi[12],BigInt(l.field_count));assert.equal(pi[13],BigInt(l.slot_count));
  assert.equal(pi[14],BigInt(l.field_count),'appended fields');
  return {valid:true,codeRoot:review.codeRoot,layoutRoot:review.layoutRoot,deployer,fields:l.field_count,slots:l.slot_count};
}
