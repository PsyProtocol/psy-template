// Adopt completed measurement artifacts only for the EXACT original proof.
// Financial submission still performs fresh native full-proof/live checks.
import assert from'node:assert/strict';import{readFileSync,existsSync}from'node:fs';import{join,dirname,resolve}from'node:path';import{parseLosslessJson}from'../../amm/u124/client.mjs';import{sha256}from'../requestBinding.mjs';
const exact=p=>parseLosslessJson(readFileSync(p,'utf8'));
export function completedColdCalibration(marker,proof){
 if(!existsSync(marker))return null;const p=JSON.parse(readFileSync(marker,'utf8'));assert.equal(resolve(p.warmDirectory),resolve(proof.preparedDirectory));assert.equal(resolve(p.coldDirectory),resolve(dirname(marker)));assert.equal(p.preparedManifestSha256,proof.manifestSha256);
 const warmManifest=readFileSync(join(p.warmDirectory,'prepared.json'));assert.equal(sha256(warmManifest),proof.manifestSha256);
 const warm=exact(join(p.warmDirectory,'preflight.json')),cold=exact(join(p.coldDirectory,'preflight.json'));
 for(const [dir,pre]of[[p.warmDirectory,warm],[p.coldDirectory,cold]]){const m=exact(join(dir,'prepared.json'));assert.equal(sha256(readFileSync(join(dir,'request.json'))),m.requestSha256);assert.equal(sha256(readFileSync(join(dir,'preflight.json'))),m.preflightSha256);assert.equal(pre.fullUpsVerified,true);assert.equal(pre.exactStackAndSessionVerified,true);assert.equal(pre.broadcast,false);assert.deepEqual(exact(join(dir,'request.json')).user_ec_input.core,pre.core);}
 assert.deepEqual(warm.core,cold.core);assert.equal(warm.benchmarkSourceCheckpoint,null);assert.equal(cold.benchmarkSourceCheckpoint,warm.core.checkpoint_id);assert.equal(warm.callsSha256,cold.callsSha256);assert.equal(warm.guardSha256,cold.guardSha256);assert.equal(warm.actualCalls,cold.actualCalls);assert.equal(warm.fee,cold.fee);return p.coldProcessTiming;
}
export function completedGuardCalibration(marker,{proof,requestSha256,baselineBinary,binary}){
 if(!existsSync(marker))return null;const p=JSON.parse(readFileSync(marker,'utf8'));assert.equal(p.requestSha256,requestSha256);assert.deepEqual(p.samples.map(s=>s.variant),['baseline','optimized','optimized','baseline']);
 for(const s of p.samples){assert.equal(s.driverSha256,sha256(readFileSync(s.variant==='baseline'?baselineBinary:binary)));const v=readFileSync(join(s.source,'verification.json'));assert.equal(sha256(v),s.verificationSha256);assert.deepEqual(JSON.parse(v),s.verification);assert.equal(s.verification.requestSha256,requestSha256);assert.equal(s.verification.preparedManifestSha256,proof.manifestSha256);assert.equal(s.verification.fullUpsVerified,true);assert.equal(s.verification.exactStackAndSessionVerified,true);assert.equal(s.verification.broadcast,false);assert.equal(s.verification.reproved,false);assert.ok(!existsSync(join(s.source,'request.json'))&&!existsSync(join(s.source,'intent.json')));}
 return p;
}
