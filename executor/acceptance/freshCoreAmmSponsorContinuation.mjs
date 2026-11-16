// Root-owned adoption of seven confirmed stages and one separately confirmed
// sponsor recovery. This entry never retries a failed or unknown operation.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {runFreshCoreAmmJourney} from './freshCoreAmmLive.mjs';
export async function runSponsorContinuation(base,activationReleasePath,sponsorReleasePath){
 assert.ok(base&&activationReleasePath&&sponsorReleasePath,'owned case and both reviewed releases required');
 return runFreshCoreAmmJourney(base,{continuationRelease:activationReleasePath,sponsorContinuationRelease:sponsorReleasePath});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){assert.equal(process.argv.length,5,'OWNED_QA_CASE ACTIVATION_RELEASE SPONSOR_RELEASE');await runSponsorContinuation(...process.argv.slice(2));}
