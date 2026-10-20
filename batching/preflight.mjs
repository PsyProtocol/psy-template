// Read-only, offline inspection. Call arithmetic is a design budget, not an
// authorization policy, admitted UPS, or throughput measurement.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export function callBudget(policy,budget=32,{envelopeCalls=2}={}){
 assert.ok(Number.isSafeInteger(budget)&&budget>=1,'integer budget');
 assert.ok(Number.isSafeInteger(envelopeCalls)&&envelopeCalls>=0,'integer envelope');
 assert.ok(policy?.version===1&&Array.isArray(policy.branches)&&policy.branches.length,'policy required');
 assert.ok(Number.isSafeInteger(policy.tx_count)&&policy.tx_count>=2,'call count');
 const branches=policy.branches.map(branch=>{
  assert.equal(branch.calls.length,policy.tx_count,'complete original stack');
  const burn=branch.calls.at(-1);
  assert.ok(burn.contract_id===0&&burn.method_name==='simple_burn'&&burn.method_id===2923993647,'final native burn required');
  // This deliberately strips old padding and per-UPS burns to estimate a NEW
  // policy. The old fingerprint cannot authorize the resulting concatenation.
  const operationCalls=branch.calls.slice(0,-1).filter(c=>!(c.contract_id===policy.market_id&&c.method_name==='noop')).length;
  assert.ok(operationCalls>0,'empty operation');
  return {name:branch.name,operationCalls,maxUnitsByCalls:Math.max(0,Math.floor((budget-envelopeCalls-1)/operationCalls)),
   twoUnitsCalls:envelopeCalls+2*operationCalls+1};
 });
 return {market:policy.market,existingExactCount:policy.tx_count,proposedBudget:budget,
  envelopeCalls,burnCalls:1,branches,authorizationReusable:false,admissionVerified:false};
}

const sha=x=>createHash('sha256').update(x).digest('hex');
export function validateCostReport(proof){
 assert.equal(proof.schema,1);assert.equal(proof.fullUpsVerified,false);assert.equal(proof.nodeAdmissionTested,false);
 assert.equal(proof.broadcast,false);assert.equal(proof.marketBatchImplemented,false);
 assert.deepEqual(proof.measurements.map(r=>r.calls),[9,10,16,17,32]);
 for(const r of proof.measurements){assert.equal(r.dynamicInputFelts,2*r.calls,'dynamic input probe required');assert.equal(r.samples.length,3);assert.equal(r.mutationsRejected,5);
  for(const s of r.samples)for(const key of ['baseProveMs','minifyMs','verifyMs'])assert.ok(Number.isFinite(s[key])&&s[key]>0);}
}
const sources=[
 'client_prover/psy_core/psy_config/src/network_constants.rs',
 'client_prover/psy_circuit/psy_ups_circuit/src/signature/sd_key.rs',
 'client_prover/psy_vm/src/ups/sd_key.rs',
 'client_prover/psy_prover/src/session/session.rs',
 'client_prover/psy_circuit/psy_dpn_circuit/src/vm/gadgets/state_readers.rs',
 'client_prover/psy_vm/src/dpn/ops/exec_context.rs',
 'client_prover/psy_core/psy_data/src/qdata/checkpoint.rs',
 'client_prover/psy_circuit/psy_network_circuit/src/ups/gadgets/ups_end_cap.rs',
 'client_prover/psy_circuit/psy_network_circuit/src/ups/gadgets/ups_end_cap_tree.rs',
 'psy_node_common/src/coordinator/processor/gatherers/coordinator_guta_update_gatherer.rs',
 'psy_node_common/src/backup/output/coordinator_output_builder.rs',
];
export function inspect({node,artifacts,proof}){
 const git=(...args)=>execFileSync('git',args,{cwd:node,encoding:'utf8'}).trim();
 const sourceHashes=Object.fromEntries(sources.map(p=>[p,sha(readFileSync(resolve(node,p)))]));
 const policies=Object.fromEntries(['amm','orderbook','bondingcurve','nftmarket'].map(m=>{
  const p=resolve(artifacts,m==='nftmarket'?'market/policy.json':`markets/${m}/policy.json`);
  return [m,{sha256:sha(readFileSync(p)),policy:JSON.parse(readFileSync(p,'utf8'))}];
 }));
 validateCostReport(proof);
 return {schema:1,dependency:{commit:git('rev-parse','HEAD'),
  // Hash the existing diff; never copy it or wallet files into the report.
  trackedDiffSha256:sha(execFileSync('git',['diff','HEAD','--binary'],{cwd:node})),sourceHashes},
  policySha256:Object.fromEntries(Object.entries(policies).map(([m,v])=>[m,v.sha256])),
  callBudgets:[16,32].flatMap(b=>Object.values(policies).map(v=>callBudget(v.policy,b))),
  proofCost:proof,randomOrderingEnabled:false,
  randomness:{checkpointSeedAuthentication:'historical checkpoint Merkle proof exists in DPN',
   applicationSeedReader:'not exposed by current market generators / SD-key policy',
   inspectedCoordinatorSeed:'thread_rng; no verified unbiased beacon or VRF guarantee',
   commitBeforeFutureSeedImplemented:false},
  batchImplemented:false,fullBatchUpsVerified:false,liveAdmissionVerified:false,
  throughput:{vm:null,fullProof:null,confirmedChain:null},broadcast:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),opts={};
 assert.equal(args.length,8,'--node PATH --artifacts PATH --proof PATH --out FRESH_FILE');
 for(let i=0;i<args.length;i+=2){assert.ok(['--node','--artifacts','--proof','--out'].includes(args[i]));assert.ok(!opts[args[i]]);opts[args[i]]=resolve(args[i+1]);}
 assert.equal(Object.keys(opts).length,4);
 const report=inspect({node:opts['--node'],artifacts:opts['--artifacts'],proof:JSON.parse(readFileSync(opts['--proof'],'utf8'))});
 writeFileSync(opts['--out'],JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({report:opts['--out'],batchImplemented:report.batchImplemented,randomOrderingEnabled:report.randomOrderingEnabled,chainTps:null}));
}
