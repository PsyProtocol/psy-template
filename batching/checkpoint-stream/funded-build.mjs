// Fresh offline AMM/Curve artifacts only. No key registration or network API.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {generateFundedStream} from './funded-generate.mjs';
import {makeFundedPolicy} from './funded-policy.mjs';
import {auditStreamArtifact} from './pair-artifact.mjs';
import {validateSuiteArtifactValues} from '../market-suite/build.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const freeze=JSON.parse(readFileSync(new URL('../dependencies/mainnet-beta-20261027/manifest.json',import.meta.url)));
export function buildFundedFixtures({input,compiler,compilerSha256,out}) {
  out=resolve(out);input=resolve(input);assert.ok(!existsSync(out),'fresh funded fixture output required');
  assert.match(compilerSha256,/^[a-f0-9]{64}$/);assert.equal(sha(readFileSync(compiler)),compilerSha256,'reviewed compiler bytes');
  const domain=spawnSync(resolve(compiler),['network-magic'],{encoding:'utf8',timeout:10000});
  assert.equal(domain.status,0);assert.equal(domain.stdout.trim(),'1384803358401154921','frozen compiler domain');
  const paths={native:'native.json',tokenA:'token/compilation_artifact.json',tokenB:'token/compilation_artifact.json',nft:'nft/compilation_artifact.json'};
  const bytes=Object.fromEntries(Object.entries(paths).map(([role,name])=>[role,readFileSync(join(input,name))]));
  const deps=validateSuiteArtifactValues(Object.fromEntries(Object.entries(bytes).map(([role,b])=>[role,JSON.parse(b)])));
  const configs=Object.fromEntries(['amm','bondingcurve'].map(kind=>[kind,JSON.parse(readFileSync(join(input,kind,'config.json')))]));
  const sources=Object.fromEntries(Object.entries(configs).map(([kind,c])=>[kind,generateFundedStream(kind,c)]));
  mkdirSync(out,{recursive:true});mkdirSync(join(out,'token'));mkdirSync(join(out,'nft'));
  for(const[role,name]of Object.entries(paths))if(role!=='tokenB')writeFileSync(join(out,name),bytes[role],{flag:'wx'});
  const records={};
  try{
    for(const kind of ['amm','bondingcurve']){
      const dir=join(out,kind),c=configs[kind];mkdirSync(dir);save(join(dir,'config.json'),c);
      writeFileSync(join(dir,'main.psy.rs'),sources[kind],{flag:'wx'});
      assert.equal(sha(readFileSync(compiler)),compilerSha256);
      const result=spawnSync(resolve(compiler),[join(dir,'main.psy.rs'),join(dir,'compiled'),String(c.assetA),String(c.assetB)],{encoding:'utf8',timeout:180000,maxBuffer:4_000_000});
      writeFileSync(join(dir,'compile.log'),(result.stdout??'')+(result.stderr??''),{flag:'wx'});assert.equal(result.status,0,'funded compile failed; preserve output');
      const raw=readFileSync(join(dir,'compiled/compilation_artifact.json')),a=JSON.parse(raw),audit=auditStreamArtifact(kind,c,a),policy=makeFundedPolicy(kind,1000,c,a,deps.tokenA,deps.nft);
      save(join(dir,'FOREIGN_READ_AUDIT.json'),audit);save(join(dir,'policy.json'),policy.base);save(join(dir,'stream-policy.json'),policy);
      records[kind]={sourceSha256:sha(Buffer.from(sources[kind])),artifactSha256:sha(raw),profile:policy.profile,version:policy.version};
    }
    const files={};for(const name of [...new Set(Object.values(paths)),...['amm','bondingcurve'].flatMap(k=>[k+'/config.json',k+'/main.psy.rs',k+'/compile.log',k+'/compiled/compilation_artifact.json',k+'/FOREIGN_READ_AUDIT.json',k+'/policy.json',k+'/stream-policy.json'])])files[name]=sha(readFileSync(join(out,name)));
    const report={schema:1,sdkCommit:freeze.sdkCommit,clientCommit:freeze.clientCommit,backendCommit:freeze.backendCommit,compilerSha256,networkMagic:domain.stdout.trim(),records,files,randomMode:false,fullUpsVerified:false,liveAuthorization:false,financialOperations:0,scope:'Synthetic offline fixture identities; actual deployed identities/resources, full UPS and actor authorization remain separate gates.'};
    save(join(out,'FUNDED-BUILD.json'),report);return report;
  }catch(error){save(join(out,'FAILURE.json'),{schema:1,financialOperations:0,automaticRetry:false});throw error;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [input,compiler,compilerSha256,out]=process.argv.slice(2);assert.equal(process.argv.length,6,'INPUT REVIEWED_COMPILER SHA256 FRESH_OUTPUT required');
  console.log(JSON.stringify(buildFundedFixtures({input,compiler,compilerSha256,out})));
}
