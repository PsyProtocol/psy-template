// Offline synthetic compile only. This profile has NO custody or financial key.
import assert from'node:assert/strict';
import{mkdirSync,readFileSync,writeFileSync,existsSync}from'node:fs';
import{join}from'node:path';import{fileURLToPath}from'node:url';
import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';
import{generateReservation}from'./reservation.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const[compiler,out]=process.argv.slice(2);assert.ok(compiler&&out);assert.ok(!existsSync(out),'fresh output required');
const compilerSha256=sha(readFileSync(compiler));
assert.equal(compilerSha256,'3ee64b059227f2efe69ebdd533c4b80983244fe5f7fd87f93f06086e2c4fca68','reviewed application context-op compiler required; no runtime SDK migration');
const sdkManifestSha256=sha(readFileSync(fileURLToPath(new URL('../../batching/dependencies/session-bound-sdk-20261020/manifest.json',import.meta.url))));
assert.equal(sdkManifestSha256,'0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425');
mkdirSync(out);const source=generateReservation({networkMagic:1384803358401154921n,registryHash:'a'.repeat(64)});
writeFileSync(join(out,'main.psy.rs'),source,{flag:'wx'});
const r=spawnSync(compiler,[join(out,'main.psy.rs'),join(out,'compiled'),'42','43','0'],{encoding:'utf8',maxBuffer:8000000});
writeFileSync(join(out,'compile.log'),(r.stdout??'')+(r.stderr??''),{flag:'wx'});
assert.equal(r.status,0,'reservation compilation failed; original log retained');
const artifact=readFileSync(join(out,'compiled/compilation_artifact.json'));
writeFileSync(join(out,'PREPARED.json'),JSON.stringify({sourceSha256:sha(source),generatorSha256:sha(readFileSync(fileURLToPath(new URL('./reservation.mjs',import.meta.url)))),artifactSha256:sha(artifact),compilerSha256,sdkManifestSha256,networkMagic:'1384803358401154921',registryHash:'a'.repeat(64),scope:'synthetic reservation-only fixture; not a funded composition controller or complete client intent bridge',custodyEnabled:false,fullUpsVerified:false,sdkeyVerified:false,deployed:false},null,2)+'\n',{flag:'wx'});
