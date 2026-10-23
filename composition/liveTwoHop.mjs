// Retired historical demonstration. Financial execution is intentionally absent.
// The old implementation is preserved at commit 93ad36f. Its allocation-floor
// fallback did not authenticate a deployment occurrence and must never fund a
// new case. This entry only reads the original report; it cannot authorize work.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
export function historicalTwoHopReport(directory) {
 const report=JSON.parse(readFileSync(join(directory,'public/composition-live-complete-v1.json'),'utf8'));
 assert.equal(report.atomic,false);assert.equal(report.invokeSync,false);assert.equal(report.productionReady,false);
 return {schema:1,report,financialExecutionEnabled:false,authorizationVerified:false,
  warning:'Historical sequential user-signed demonstration only. Deployment occurrence 2482 was not exactly indexed. This is not the dedicated composition policy or candidate acceptance.'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 assert.equal(process.argv.length,3,'retired financial runner; read-only usage: liveTwoHop.mjs HISTORICAL_CASE');
 console.log(JSON.stringify(historicalTwoHopReport(process.argv[2])));
}
