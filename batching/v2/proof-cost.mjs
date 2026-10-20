// Summarize measured full-UPS traces. No estimates are substituted for timings.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export function summarizeProofCosts(reports){
 const rows=[];
 for(const {path,bytes} of reports){const d=JSON.parse(bytes);assert.equal(d.broadcast,false);assert.ok(Array.isArray(d.measurements));
  for(const m of d.measurements){if(m.phase==='cold-circuit-build'){assert.ok(Number.isFinite(m.elapsedMs)&&m.elapsedMs>=0);continue;}
   assert.ok(['commit','settle','expire','maintenance'].includes(m.phase),'known UPS phase');assert.equal(m.fullUpsVerified,true);assert.equal(m.broadcast,false);assert.ok(Array.isArray(m.steps));assert.equal(m.steps.length+1,m.calls,'trace must include every explicit call; automatic burn is separate');
   let noopMs=0,workMs=0;const byMethod=new Map();for(const [i,s] of m.steps.entries()){
    assert.equal(s.index,i);assert.ok(Number.isFinite(s.ms)&&s.ms>=0);assert.equal(typeof s.method,'string');if(s.method==='noop')noopMs+=s.ms;else workMs+=s.ms;
    const r=byMethod.get(`${s.contract}/${s.method}`)??{contract:s.contract,method:s.method,calls:0,ms:0};r.calls++;r.ms+=s.ms;byMethod.set(`${s.contract}/${s.method}`,r);
   }
   assert.ok(m.elapsedMs>=noopMs+workMs,'trace exceeds whole UPS time');
   const stages=m.overheadStagesMs??null;if(stages){assert.deepEqual(Object.keys(stages).sort(),['burn','endcapProveAndVerify','sdKeySign','seedState','sessionStart','stateDeltaChecks']);for(const ms of Object.values(stages))assert.ok(Number.isFinite(ms)&&ms>=0,'stage timing');assert.ok(Object.values(stages).reduce((a,b)=>a+b,0)<=m.elapsedMs-noopMs-workMs+1,'stage trace exceeds overhead');}
   rows.push({input:path,inputSha256:createHash('sha256').update(bytes).digest('hex'),market:d.market,phase:m.phase,members:d.members??null,fills:d.fills??null,calls:m.calls,
    elapsedMs:m.elapsedMs,noopCalls:m.steps.filter(s=>s.method==='noop').length,noopMs,workCallMs:workMs,
    untracedMs:m.elapsedMs-noopMs-workMs,overheadStagesMs:stages,noopFraction:noopMs/m.elapsedMs,
    // This is a diagnostic cost attribution, not a speedup prediction. A new
    // key/profile still has proving, envelope, burn, and verification costs.
    byMethod:[...byMethod.values()],chainTps:null,broadcast:false});
  }
 }
 return {schema:1,scope:'measured full-UPS call attribution; untraced includes setup, automatic burn, signing, endcap and verification',rows,speedupClaim:null,chainTps:null,broadcast:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [flag,out,...inputs]=process.argv.slice(2);assert.ok(flag==='--out'&&out&&inputs.length,'--out FRESH_JSON PROOF_REPORT...');
 const report=summarizeProofCosts(inputs.map(p=>({path:resolve(p),bytes:readFileSync(p,'utf8')})));
 writeFileSync(resolve(out),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output:resolve(out),phases:report.rows.length,broadcast:false}));
}
