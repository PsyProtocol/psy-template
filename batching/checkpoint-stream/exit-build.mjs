// Frozen compiler and source artifacts are explicit; every output is fresh.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {generateExitStream} from './exit-generate.mjs';
import {makeExitPolicy} from './exit-policy.mjs';
import {validateSuiteArtifactValues} from '../market-suite/build.mjs';
import {sdkRelease} from '../../executor/sdkProfiles.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const[normal,pair,compiler,pin,out,profile='mainnet-beta-20261027-v1']=process.argv.slice(2);assert.ok([7,8].includes(process.argv.length));const release=sdkRelease(profile);assert.ok(!existsSync(out));assert.equal(sha(readFileSync(compiler)),pin);
const domain=spawnSync(compiler,['network-magic'],{encoding:'utf8'});assert.equal(domain.status,0);assert.equal(domain.stdout.trim(),'1384803358401154921');
const raw=Object.fromEntries(Object.entries({native:'native.json',tokenA:'token/compilation_artifact.json',tokenB:'token/compilation_artifact.json',nft:'nft/compilation_artifact.json'}).map(([k,p])=>[k,readFileSync(join(pair,p))]));
const deps=validateSuiteArtifactValues(Object.fromEntries(Object.entries(raw).map(([k,b])=>[k,JSON.parse(b)])));
mkdirSync(out);mkdirSync(join(out,'token'));mkdirSync(join(out,'nft'));
for(const[n,b]of [['native.json',raw.native],['token/compilation_artifact.json',raw.tokenA],['nft/compilation_artifact.json',raw.nft]])writeFileSync(join(out,n),b,{flag:'wx'});
const put=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'}),rows={};
try{for(const kind of ['amm','bondingcurve','orderbook','nftmarket']){
 const dir=join(out,kind);mkdirSync(dir);const c=JSON.parse(readFileSync(join(['amm','bondingcurve'].includes(kind)?normal:pair,kind,'config.json'))),source=generateExitStream(kind,c);put(join(dir,'config.json'),c);writeFileSync(join(dir,'main.psy.rs'),source,{flag:'wx'});assert.equal(sha(readFileSync(compiler)),pin);
 const t=Date.now(),r=spawnSync(compiler,[join(dir,'main.psy.rs'),join(dir,'compiled'),String(kind==='nftmarket'?c.tokenId:c.assetA),String(kind==='nftmarket'?c.nftId:c.assetB),String(kind==='nftmarket')],{encoding:'utf8',timeout:180000,maxBuffer:4_000_000});
 writeFileSync(join(dir,'compile.log'),(r.stdout??'')+(r.stderr??'')+(r.error?.message??''),{flag:'wx'});assert.equal(r.status,0,'preserve failed compilation');
 const bytes=readFileSync(join(dir,'compiled/compilation_artifact.json')),a=JSON.parse(bytes),s=makeExitPolicy(kind,1000,c,a,deps.tokenA,deps.nft,profile);put(join(dir,'policy.json'),s.base);put(join(dir,'stream-policy.json'),s);
 rows[kind]={sourceSha256:sha(Buffer.from(source)),artifactSha256:sha(bytes),version:s.version,compileMilliseconds:Date.now()-t};
}put(join(out,'BUILD.json'),{sdkCommit:release.sdkCommit,compilerSha256:pin,rows,financialOperations:0});}
catch(e){put(join(out,'FAILURE.json'),{error:e.message,automaticRetry:false,financialOperations:0});throw e;}
