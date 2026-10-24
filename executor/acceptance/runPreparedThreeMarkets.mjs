// Local acceptance supervisor only. Runs the formal financial route once after
// exact registrations exist; never retries a failed or unknown financial run.
import assert from'node:assert/strict';import{existsSync}from'node:fs';import{join}from'node:path';import{fileURLToPath}from'node:url';
import{run,save}from'../../batching/admission/liveSupport.mjs';import{assertDurableRuntimeDirectory}from'../runtimeStorage.mjs';
const[base]=process.argv.slice(2);assertDurableRuntimeDirectory(base);
for(let poll=0;!existsSync(join(base,'public/PREPARED.json'));poll++){assert.ok(poll<180,'preparation not closed; no financial route started');await new Promise(r=>setTimeout(r,10000));}
const timing=await run(process.execPath,[fileURLToPath(new URL('./runThreeMarkets.mjs',import.meta.url)),base],join(base,'route-run-v1.log'));
save(join(base,'public/ROUTE-PROCESS-TIMING-v1.json'),timing);
console.log('three-market formal route closed');
