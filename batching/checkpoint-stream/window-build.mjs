// Fresh deterministic candidate artifacts. No deployment, funding or key release.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {generateWindowStream,makeWindowPolicy} from './window-policy.mjs';
import {generateExitStream} from './exit-generate.mjs';
const [input,nftInput,compiler,compilerSha256,output]=process.argv.slice(2);
assert.equal(process.argv.length,7,'CURRENT_FIXTURES NFT_V21_FIXTURES PINNED_COMPILER SHA256 FRESH_OUTPUT');
assert.ok(!existsSync(output),'fresh candidate required');
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.match(compilerSha256,/^[a-f0-9]{64}$/);
assert.equal(sha(readFileSync(compiler)),compilerSha256);
const root=resolve(input),nftRoot=resolve(nftInput),out=resolve(output);
const read=(p,r=root)=>readFileSync(join(r,p));
assert.equal(JSON.parse(read('BUILD.json')).sdkCommit,'01b8f2b0a077367a7b9879baba1a72aea8ab5510');
assert.equal(JSON.parse(read('nftmarket/stream-policy.json',nftRoot)).version,21);
mkdirSync(out);const files={};
for(const name of ['native.json','token/compilation_artifact.json','nft/compilation_artifact.json']){
 const bytes=read(name,name.startsWith('nft/')?nftRoot:root),dest=join(out,name);
 mkdirSync(resolve(dest,'..'),{recursive:true});writeFileSync(dest,bytes,{flag:'wx'});files[name]=sha(bytes);
}
const token=JSON.parse(read('token/compilation_artifact.json')),collection=JSON.parse(read('nft/compilation_artifact.json',nftRoot));
const rows={};
try{
 for(const market of ['amm','bondingcurve','orderbook','nftmarket']){
  const from=market==='nftmarket'?nftRoot:root,c=JSON.parse(read(market+'/config.json',from));
  assert.equal(read(market+'/main.psy.rs',from).toString(),generateExitStream(market,c),'reviewed predecessor source reproduced');
  const dir=join(out,market);mkdirSync(dir);const source=generateWindowStream(market,c);
  writeFileSync(join(dir,'config.json'),JSON.stringify(c,null,2)+'\n',{flag:'wx'});
  writeFileSync(join(dir,'main.psy.rs'),source,{flag:'wx'});
  assert.equal(sha(readFileSync(compiler)),compilerSha256);
  const t=performance.now(),result=spawnSync(resolve(compiler),[join(dir,'main.psy.rs'),join(dir,'compiled'),String(market==='nftmarket'?c.tokenId:c.assetA),String(market==='nftmarket'?c.nftId:c.assetB),String(market==='nftmarket')],{encoding:'utf8',timeout:180000,maxBuffer:4000000});
  writeFileSync(join(dir,'compile.log'),(result.stdout??'')+(result.stderr??'')+(result.error?.message??''),{flag:'wx'});
  assert.equal(result.status,0,'preserve failed candidate compiler output');
  const bytes=readFileSync(join(dir,'compiled/compilation_artifact.json')),artifact=JSON.parse(bytes);
  const policy=makeWindowPolicy(market,1000,c,artifact,token,collection,'sdk-audit-20261102-v1');
  for(const[name,value]of [['policy.json',policy.base],['stream-policy.json',policy]])writeFileSync(join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  rows[market]={version:policy.version,sourceSha256:sha(Buffer.from(source)),artifactSha256:sha(bytes),window:policy.source_window_checkpoints,compileMilliseconds:performance.now()-t};
 }
 writeFileSync(join(out,'BUILD.json'),JSON.stringify({schema:1,sdkCommit:'01b8f2b0a077367a7b9879baba1a72aea8ab5510',compilerSha256,files,rows,fullUpsVerified:false,financialOperations:0,liveAuthorization:false},null,2)+'\n',{flag:'wx'});
}catch(error){writeFileSync(join(out,'FAILURE.json'),JSON.stringify({message:error.message,automaticRetry:false,financialOperations:0},null,2)+'\n',{flag:'wx'});throw error;}
