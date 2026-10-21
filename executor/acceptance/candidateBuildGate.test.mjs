import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {verifyCandidateBuild} from './candidateBuildGate.mjs';
const root=process.env.CANDIDATE_BUILD_ROOT,compiler='b2adb0a474d3d2b9bd9bb4c5e17e4e9e166930aa27dcbe11a77c3046ac6f141c';
test('all four frozen compiled candidates pass the pre-deployment source/config/compiler/file closure',{skip:!root},()=>{
 for(const market of ['amm','orderbook','bondingcurve','nftmarket'])assert.equal(verifyCandidateBuild(join(root,market),market,compiler).market,market);
});
test('changed artifacts, rehashed noncanonical source, incomplete manifests and wrong compiler are rejected before deployment',{skip:!root},()=>{
 const scratch=mkdtempSync(join(tmpdir(),'psy-deploy-build-'));try{
  cpSync(join(root,'amm'),scratch,{recursive:true});const manifest=join(scratch,'BUILD.json'),original=readFileSync(manifest),report=JSON.parse(original),source=join(scratch,'main.psy.rs'),sourceOriginal=readFileSync(source);
  assert.throws(()=>verifyCandidateBuild(scratch,'amm','0'.repeat(64)));
  assert.throws(()=>verifyCandidateBuild(scratch,'orderbook',compiler));
  const artifact=join(scratch,'compiled/compilation_artifact.json'),artifactOriginal=readFileSync(artifact);writeFileSync(artifact,'{}');assert.throws(()=>verifyCandidateBuild(scratch,'amm',compiler),/prepared deployment input changed/);writeFileSync(artifact,artifactOriginal);
  writeFileSync(source,Buffer.concat([sourceOriginal,Buffer.from('\n// altered candidate\n')]));report.files['main.psy.rs']=createHash('sha256').update(readFileSync(source)).digest('hex');writeFileSync(manifest,JSON.stringify(report));assert.throws(()=>verifyCandidateBuild(scratch,'amm',compiler),/generator\/source mismatch/);
  writeFileSync(source,sourceOriginal);writeFileSync(manifest,original);delete report.files['native.json'];writeFileSync(manifest,JSON.stringify(report));assert.throws(()=>verifyCandidateBuild(scratch,'amm',compiler));
 }finally{rmSync(scratch,{recursive:true});}
});
