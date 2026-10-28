import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {generateCheckpointProcessor} from './generate.mjs';
import {makeProcessorPolicy} from './policy.mjs';
export function buildProcessor({compiler,base,out}){
 compiler=resolve(compiler);base=resolve(base);out=resolve(out);if(existsSync(out))throw Error('fresh processor output required');
 const read=p=>JSON.parse(readFileSync(p,'utf8')),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
 const net=spawnSync(compiler,['network-magic'],{encoding:'utf8'});if(net.status!==0||!/^\d+\s*$/.test(net.stdout))throw Error('owned compiler network');
 mkdirSync(out);for(const name of ['token','nft']){mkdirSync(resolve(out,name));copyFileSync(resolve(base,name,'compilation_artifact.json'),resolve(out,name,'compilation_artifact.json'));}copyFileSync(resolve(base,'native.json'),resolve(out,'native.json'));
 const token=read(resolve(out,'token/compilation_artifact.json')),nft=read(resolve(out,'nft/compilation_artifact.json')),records=[];
 for(const market of ['amm','bondingcurve']){
  const previous=read(resolve(base,market,'policy.json')),config={...previous.config,networkMagic:net.stdout.trim(),rewardReceiver:600};
  const dir=resolve(out,market);mkdirSync(dir);const source=resolve(dir,'main.psy.rs');writeFileSync(source,generateCheckpointProcessor(market,config),{flag:'wx'});
  const process=spawnSync(compiler,[source,resolve(dir,'compiled'),String(config.assetA),String(config.assetB)],{encoding:'utf8',maxBuffer:8000000});writeFileSync(resolve(dir,'compile.log'),(process.stdout??'')+(process.stderr??''),{flag:'wx'});
  if(process.error||process.status!==0)throw Error('processor compilation failed: '+market+' '+(process.error?.message??process.stderr));
  const artifact=resolve(dir,'compiled/compilation_artifact.json'),compiled=read(artifact),policy=makeProcessorPolicy(market,previous.market_id,config,compiled.abi,token.abi,nft.abi);
  writeFileSync(resolve(dir,'policy.json'),JSON.stringify(policy,null,2)+'\n',{flag:'wx'});writeFileSync(resolve(dir,'config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});
  records.push({market,sourceSha256:sha(source),artifactSha256:sha(artifact),policySha256:sha(resolve(dir,'policy.json'))});
 }
 const report={schema:1,scope:'offline checkpoint-producer-controlled processor candidate; not qualified entropy or live authorization',networkMagic:net.stdout.trim(),compilerSha256:sha(compiler),records,fullUpsVerified:false,sourceQualified:false,sealBeforeReleaseAuthenticated:false,liveAuthorization:false,broadcast:false};
 writeFileSync(resolve(out,'BUILD.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv.length!==5)throw Error('COMPILER BASE_FIXTURES FRESH_OUT');console.log(JSON.stringify(buildProcessor({compiler:process.argv[2],base:process.argv[3],out:process.argv[4]})));}
