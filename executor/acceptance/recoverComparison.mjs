// Recover only the surviving observations, never authorize a historical send.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {saveObservation} from '../observations.mjs';
const [provedRecord,coldDirectory,output]=process.argv.slice(2);
const read=p=>parseLosslessJson(readFileSync(p,'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const r=read(provedRecord);assert.equal(r.status,'proved');
const warmDirectory=r.proof.preparedDirectory;
assert.equal(sha(join(warmDirectory,'prepared.json')),r.proof.manifestSha256);
function checked(dir){
 const manifest=read(join(dir,'prepared.json'));
 for(const [file,key] of [['preflight.json','preflightSha256'],['request.json','requestSha256']])assert.equal(sha(join(dir,file)),manifest[key]);
 const p=read(join(dir,'preflight.json')),request=read(join(dir,'request.json'));
 assert.equal(p.fullUpsVerified,true);assert.equal(p.exactStackAndSessionVerified,true);assert.equal(p.broadcast,false);
 assert.deepEqual(request.user_ec_input.core,p.core);
 assert.equal(p.callsSha256,manifest.callsSha256);assert.equal(p.guardSha256,manifest.guardSha256);
 return {p,manifest};
}
const {p:w,manifest:wm}=checked(warmDirectory),{p:c,manifest:cm}=checked(coldDirectory);
for(const field of ['policySha256','callsSha256','guardSha256'])assert.equal(wm[field],cm[field]);
for(const [file,key] of [['calls.json','callsSha256'],['guard.json','guardSha256']])assert.equal(sha(join(dirname(warmDirectory),file)),wm[key]);
assert.equal(w.benchmarkSourceCheckpoint,null);assert.equal(c.benchmarkSourceCheckpoint,w.core.checkpoint_id);
for(const field of ['core','fee','actualCalls','callsSha256','guardSha256'])assert.deepEqual(w[field],c[field]);
saveObservation(output,{schema:1,recoveredAt:new Date().toISOString(),provedRecord,warmDirectory,coldDirectory,driverSha256:r.proof.driverSha256,
 scope:'historical same-source cancelled partial-AMM commitment pair; metadata/digest recovery only; original driver reported full verification; no independent cryptographic re-verification in this script',
 warmTimingsMs:w.timingsMilliseconds,coldTimingsMs:c.timingsMilliseconds,sourceCheckpoint:w.core.checkpoint_id,calls:w.actualCalls,fee:w.fee,
 coldProcessTiming:null,loadAverageAfterPair:null,missingObservations:'Original report serialization failed after proof checks. Outer process interval and load samples were not persisted; they are not reconstructed.',
 originalProofWindowExpired:true,authorizesBroadcast:false,broadcast:false,maximumCapacityPassed:false,chainTps:null,productionReady:false});
