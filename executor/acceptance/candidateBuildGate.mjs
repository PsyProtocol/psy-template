import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {generateAdmission} from '../../batching/admission/generate.mjs';
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
export function verifyCandidateBuild(build,market,compilerSha256){
 assert.match(compilerSha256,/^[0-9a-f]{64}$/);const report=JSON.parse(readFileSync(join(build,'BUILD.json'),'utf8'));
 assert.equal(report.market,market);assert.equal(report.schema,1);assert.equal(report.compilerSha256,compilerSha256);
 assert.deepEqual(Object.keys(report.files).sort(),['main.psy.rs','config.json','token-a.json','token-b.json','nft.json','native.json','compiled/compilation_artifact.json'].sort());
 for(const [path,digest]of Object.entries(report.files))assert.equal(sha(join(build,path)),digest,'prepared deployment input changed '+path);
 assert.equal(readFileSync(join(build,'main.psy.rs'),'utf8'),generateAdmission(market,JSON.parse(readFileSync(join(build,'config.json'),'utf8'))),'reviewed generator/source mismatch before deployment');
 return {market,compilerSha256,buildManifestSha256:sha(join(build,'BUILD.json')),files:report.files};
}
