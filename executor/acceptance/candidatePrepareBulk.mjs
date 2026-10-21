// Compile fresh candidates and freeze inputs only. No financial RPC.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,copyFileSync,constants,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {compileAdmission} from '../../batching/admission/build.mjs';
import {read,save} from '../../batching/admission/liveSupport.mjs';
const [parent,outArg,proofEvidence,signatureEvidence]=process.argv.slice(2),out=resolve(outArg);assert.ok(!existsSync(out),'fresh candidate directory required');
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const gate=read(join(proofEvidence,'public/BULK-GATE.json')),signature=read(join(signatureEvidence,'public/RESULT.json'));
assert.deepEqual([...new Set(gate.records.map(r=>r.market))].sort(),['amm','bondingcurve','nftmarket','orderbook']);assert.equal(signature.parentFullUpsToolchainManifestSha256,sha(join(proofEvidence,'public/toolchain-manifest.json')));assert.equal(gate.fullUpsVerified,true);assert.equal(gate.records.length,4);assert.equal(signature.allFourPassed,true);assert.equal(gate.broadcast,false);assert.equal(signature.broadcast,false);
for(const row of gate.records){const path=join(proofEvidence,'public',row.report);assert.equal(sha(path),row.sha256);const r=read(path);assert.equal(r.market,row.market);assert.equal(r.actualCalls,7);assert.equal(r.fullUpsVerified,true);assert.equal(r.liveAcceptance,false);}
const tools=read(join(parent,'public/candidate-toolchain-v4.json'));for(const [path,digest]of [[tools.compiler,tools.compilerSha256],[tools.ordinaryBinary,tools.ordinaryBinarySha256],[tools.compactBinary,tools.compactBinarySha256]])assert.equal(sha(path),digest);
mkdirSync(out);for(const dir of ['public','attempts','markets-v1'])mkdirSync(join(out,dir));
for(const file of ['rpc.json','candidate-toolchain-v4.json','candidate-release-v4.json','qa-actors-source.json'])copyFileSync(join(parent,'public',file),join(out,'public',file),constants.COPYFILE_EXCL);
save(join(out,'public/additional-cohort-users-v1.json'),{version:1,users:['amm','orderbook','bondingcurve','nftmarket'].map(k=>read(join(parent,'markets-v1',k,'live-registration.json')).vaultId)});
for(const market of ['amm','orderbook','nftmarket']){const source=join(parent,'markets-v1',market);compileAdmission({market,compiler:tools.compiler,native:source+'/native.json',tokenA:source+'/token-a.json',tokenB:source+'/token-b.json',nft:source+'/nft.json',config:read(source+'/config.json'),out:join(out,'markets-v1',market)});}
const sdk='batching/dependencies/session-bound-sdk-20261020/manifest.json';assert.equal(sha(sdk),signature.sdkManifestSha256);
save(join(out,'public/PREPARED-BULK-v1.json'),{version:1,preparedAt:new Date().toISOString(),parentCase:resolve(parent),admissionMode:'all-four-v1',proofGate:join(resolve(proofEvidence),'public/BULK-GATE.json'),proofGateSha256:sha(join(proofEvidence,'public/BULK-GATE.json')),signatureGate:join(resolve(signatureEvidence),'public/RESULT.json'),signatureGateSha256:sha(join(signatureEvidence,'public/RESULT.json')),sdkManifestSha256:sha(sdk),toolchainSha256:sha(join(parent,'public/candidate-toolchain-v4.json')),scope:'offline preparation only; parent recovery closure must pass before fresh deployments; Curve is compiled after new AMM vault registration',financialRpc:false,productionReady:false});
