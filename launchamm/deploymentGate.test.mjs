import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {checkNewDeployment} from './deploymentGate.mjs';
const r=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const req=r('../bondingcurve/deployments/staging-2026-09-30/curve.prepared.json');
const artifact=r('../bondingcurve/deployments/staging-2026-09-30/curve.compilation.json');
const review={codeRoot:req.deploy_contract.code_root,layoutRoot:req.state_layout_root};
test('a retained new-deployment proof has an empty old endpoint',()=>assert.ok(checkNewDeployment(req,artifact,review,req.deploy_contract.deployer).valid));
test('layout, code, deployer and proof endpoint mismatches stop submission',()=>{
 for(const mutate of [x=>x.update_contract={},x=>x.state_layout_field_count++,x=>x.deploy_contract.code_root='0',x=>x.deploy_contract.deployer='0',x=>{const b=Buffer.from(x.canonical_layout_proof);b.writeBigUInt64LE(26n,b.length-152+6*8);x.canonical_layout_proof=[...b];}]){
 const x=structuredClone(req);mutate(x);assert.throws(()=>checkNewDeployment(x,artifact,review,req.deploy_contract.deployer));
 }
});
