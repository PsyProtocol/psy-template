// Root-owned continuation only. It adopts the exact confirmed prefix and the
// separately executed single pre-session recovery; it never retries that job.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {runFreshCoreAmmJourney} from './freshCoreAmmLive.mjs';
export async function runActivationContinuation(base,releasePath){
 assert.ok(base&&releasePath,'owned case and reviewed release path required');
 return runFreshCoreAmmJourney(base,{continuationRelease:releasePath});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){assert.equal(process.argv.length,4,'OWNED_QA_CASE CASE_RELATIVE_RELEASE');await runActivationContinuation(process.argv[2],process.argv[3]);}
