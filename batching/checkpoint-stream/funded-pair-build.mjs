// Two new offline candidates only. Compiler and dependencies are explicit pins.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {generateFundedPair,makeFundedPairPolicy} from './funded-pair.mjs';
import {auditPairArtifact} from './pair-artifact.mjs';
import {validateSuiteArtifactValues} from '../market-suite/build.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const put=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
export function buildFundedPairs({input,compiler,compilerSha256,out,reuse={}}){
 input=resolve(input);out=resolve(out);assert.ok(!existsSync(out));assert.match(compilerSha256,/^[a-f0-9]{64}$/);assert.equal(sha(readFileSync(compiler)),compilerSha256);
 const domain=spawnSync(compiler,['network-magic'],{encoding:'utf8',timeout:10000});assert.equal(domain.status,0);assert.equal(domain.stdout.trim(),'1384803358401154921');
 const paths={native:'native.json',tokenA:'token/compilation_artifact.json',tokenB:'token/compilation_artifact.json',nft:'nft/compilation_artifact.json'},bytes=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,readFileSync(join(input,p))]));
 const deps=validateSuiteArtifactValues(Object.fromEntries(Object.entries(bytes).map(([k,v])=>[k,JSON.parse(v)])));
 const configs=Object.fromEntries(['orderbook','nftmarket'].map(k=>[k,{...JSON.parse(readFileSync(join(input,k,'config.json'))),feeOwner:600}]));
 const sources=Object.fromEntries(Object.entries(configs).map(([k,c])=>[k,generateFundedPair(k,c)]));mkdirSync(out);mkdirSync(join(out,'token'));mkdirSync(join(out,'nft'));
 for(const[k,path]of Object.entries(paths))if(k!=='tokenB')writeFileSync(join(out,path),bytes[k],{flag:'wx'});
 const records={};try{for(const market of ['orderbook','nftmarket']){
  const dir=join(out,market),c=configs[market];mkdirSync(dir);put(join(dir,'config.json'),c);writeFileSync(join(dir,'main.psy.rs'),sources[market],{flag:'wx'});
  assert.equal(sha(readFileSync(compiler)),compilerSha256);const cached=reuse[market];
  if(cached){
   assert.equal(cached.compilerSha256,compilerSha256);assert.equal(cached.sourceSha256,sha(Buffer.from(sources[market])));
   assert.equal(sha(readFileSync(join(cached.directory,'main.psy.rs'))),cached.sourceSha256);assert.deepEqual(JSON.parse(readFileSync(join(cached.directory,'config.json'))),c);
   const bytes=readFileSync(join(cached.directory,'compiled/compilation_artifact.json'));assert.equal(sha(bytes),cached.artifactSha256);
   mkdirSync(join(dir,'compiled'));writeFileSync(join(dir,'compiled/compilation_artifact.json'),bytes,{flag:'wx'});put(join(dir,'compile-reuse.json'),cached);
  }else{
   const result=spawnSync(compiler,[join(dir,'main.psy.rs'),join(dir,'compiled'),String(market==='nftmarket'?c.tokenId:c.assetA),String(market==='nftmarket'?c.nftId:c.assetB),String(market==='nftmarket')],{encoding:'utf8',timeout:180000,maxBuffer:4_000_000});
   writeFileSync(join(dir,'compile.log'),(result.stdout??'')+(result.stderr??'')+(result.error?.message??''),{flag:'wx'});assert.equal(result.status,0,'preserve failed candidate compile');
  }
  const raw=readFileSync(join(dir,'compiled/compilation_artifact.json')),artifact=JSON.parse(raw),audit=auditPairArtifact(market,c,artifact),spec=makeFundedPairPolicy(market,1000,c,artifact,deps.tokenA,deps.nft);
  put(join(dir,'FOREIGN_READ_AUDIT.json'),audit);put(join(dir,'policy.json'),spec.base);put(join(dir,'stream-policy.json'),spec);records[market]={artifactSha256:sha(raw),sourceSha256:sha(Buffer.from(sources[market])),version:spec.version,profile:spec.profile,reused:!!cached};
 }put(join(out,'BUILD.json'),{schema:1,sdkCommit:'c92880c8b6e2c8d392f19368bc8801a2584fd427',compilerSha256,records,financialOperations:0,liveAuthorization:false,fullUpsVerified:false});
 }catch(e){put(join(out,'FAILURE.json'),{financialOperations:0,automaticRetry:false,message:e.message});throw e;}
 return records;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const[input,compiler,compilerSha256,out]=process.argv.slice(2);assert.equal(process.argv.length,6);console.log(JSON.stringify(buildFundedPairs({input,compiler,compilerSha256,out})));
}
