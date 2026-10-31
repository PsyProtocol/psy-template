// Offline-only four-market build and late identity binding. No signer or RPC.
import assert from 'node:assert/strict';
import{readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync,constants}from'node:fs';
import{resolve,join}from'node:path';import{fileURLToPath}from'node:url';
import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';
import{validateConfig}from'../../amm/u124/build.mjs';
import{validateU124TokenAbi}from'../../executor/u124Abi.mjs';
import{validateNftAbi}from'../../nft-marketplace/abi.mjs';
import{validateNativeArtifact,PROFILE}from'../mainnet-beta/native.mjs';
import{generateStream}from'../checkpoint-stream/generate.mjs';
import{generatePairOptimized}from'../checkpoint-stream/pair-optimized-generate.mjs';
import{makeStreamPolicy}from'../checkpoint-stream/build-policy.mjs';
import{makePairOptimizedPolicy}from'../checkpoint-stream/pair-optimized-build-policy.mjs';
import{auditStreamArtifact}from'../checkpoint-stream/pair-artifact.mjs';
import{MARKETS,loadBuildSnapshot,validateManifestContents}from'./manifest.mjs';
export{MARKETS}from'./manifest.mjs';
const freeze=JSON.parse(readFileSync(new URL('../dependencies/mainnet-beta-20261027/manifest.json',import.meta.url),'utf8'));
const read=p=>JSON.parse(readFileSync(p,'utf8')),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const boundedId=id=>Number.isSafeInteger(id)&&id>=5&&id<16777216;
function validate(spec){
 assert.equal(spec.schema,1);assert.equal(spec.sdkCommit,freeze.sdkCommit,'frozen SDK required');assert.equal(spec.networkMagic,'1384803358401154921','explicit testnet domain');
 assert.match(spec.chainRootAt1,/^[0-9a-f]{64}$/,'declared chain instance required');assert.notEqual(spec.chainRootAt1,'0'.repeat(64));
 assert.deepEqual(Object.keys(spec.artifacts).sort(),['native','nft','tokenA','tokenB'],'exact artifact roles required');assert.deepEqual(Object.keys(spec.compilers).sort(),['pair','stream'],'exact compiler roles required');
 validateConfig(spec.config);assert.ok(!spec.config.bootstrap,'automatic graduation/bootstrap routing is not part of this suite');assert.equal(spec.config.networkMagic,spec.networkMagic);
 assert.ok(boundedId(spec.config.nftId)&&![spec.config.assetA,spec.config.assetB].includes(spec.config.nftId),'distinct collection identity');
 assert.ok([spec.config.assetA,spec.config.assetB].includes(spec.config.tokenId),'NFT payment must be one of the reviewed FT assets');
 assert.equal(spec.randomMode,false,'this release path is explicitly deterministic');
 for(const role of['stream','pair']){
  const pin=spec.compilers[role];assert.match(pin.sha256,/^[0-9a-f]{64}$/);assert.equal(sha(pin.path),pin.sha256,'compiler bytes changed');
  const query=spawnSync(resolve(pin.path),['network-magic'],{encoding:'utf8',timeout:10000,maxBuffer:65536});assert.equal(query.status,0,'compiler domain query failed');assert.equal(query.stdout.trim(),spec.networkMagic,'compiler/config domain mismatch');
 }
 return validateSuiteArtifacts(spec.artifacts);
}
export function validateSuiteArtifacts(paths){
 return validateSuiteArtifactValues(Object.fromEntries(['native','tokenA','tokenB','nft'].map(role=>[role,read(paths[role])])));
}
export function validateSuiteArtifactValues(artifacts){
 validateNativeArtifact(artifacts.native,PROFILE);for(const role of['tokenA','tokenB']){assert.equal(artifacts[role].state_tree_height,31);validateU124TokenAbi(artifacts[role].abi);}validateNftAbi(artifacts.nft.abi,artifacts.nft.state_tree_height);
 for(const role of['native','tokenA','tokenB','nft']){const defs=artifacts[role].circuit_definitions;assert.ok(Array.isArray(defs));assert.equal(new Set(defs.map(d=>d.name)).size,defs.length,'duplicate actual dependency function name');assert.equal(new Set(defs.map(d=>d.method_id)).size,defs.length,'duplicate actual dependency selector');}
 for(const role of['tokenA','tokenB','nft']){const a=artifacts[role],defs=a.circuit_definitions,abi=a.abi.contract.methods;assert.deepEqual(defs.map(d=>d.name).sort(),abi.map(d=>d.name).sort(),'complete dependency ABI/function coverage');for(const d of defs){const method=abi.find(m=>m.name===d.name);assert.equal(d.method_id,method.method_id,'actual dependency function/ABI identity');assert.equal(d.circuit_inputs.length,method.input_felt_count,'actual dependency input count');assert.equal(d.circuit_outputs.length,method.output_felt_count,'actual dependency output count');}}
 for(const name of['claim','transfer'])assert.equal(artifacts.tokenA.abi.contract.methods.find(m=>m.name===name).method_id,artifacts.tokenB.abi.contract.methods.find(m=>m.name===name).method_id,'shared FT method identity');
 return artifacts;
}

export function compileMarketSuite({spec,out,reuse}){
 out=resolve(out);assert.ok(!existsSync(out),'fresh suite output required');validate(spec);
 let prior;
 if(reuse){assert.match(reuse.manifestSha256,/^[0-9a-f]{64}$/,'reviewed reuse digest required');const path=resolve(reuse.build),snapshot=loadBuildSnapshot(path,freeze,{expectedSha256:reuse.manifestSha256}),report=snapshot.manifest;assert.equal(report.chainRootAt1,spec.chainRootAt1);for(const role of Object.keys(spec.artifacts))assert.equal(sha(spec.artifacts[role]),report.frozenInputs['artifact:'+role].sha256,'reuse dependency identity mismatch');for(const role of Object.keys(spec.compilers))assert.equal(spec.compilers[role].sha256,report.frozenInputs['compiler:'+role].sha256,'reuse compiler mismatch');prior={path,report,bytes:snapshot.files,digest:reuse.manifestSha256};}

 const frozenInputs=Object.fromEntries([...Object.entries(spec.artifacts).map(([k,v])=>['artifact:'+k,{path:resolve(v),sha256:sha(v)}]),...Object.entries(spec.compilers).map(([k,v])=>['compiler:'+k,{path:resolve(v.path),sha256:v.sha256}])]);
 mkdirSync(out,{recursive:true});save(join(out,'config.json'),spec.config);mkdirSync(join(out,'dependencies'));
 for(const[role,path]of Object.entries(spec.artifacts))copyFileSync(path,join(out,'dependencies',role+'.json'),constants.COPYFILE_EXCL);
 const records={};
 try{
  for(const market of MARKETS){
   const directory=join(out,market);mkdirSync(directory);const paired=['orderbook','nftmarket'].includes(market);
   const source=paired?generatePairOptimized(market,spec.config):generateStream(market,spec.config),sourcePath=join(directory,'main.psy.rs');writeFileSync(sourcePath,source,{flag:'wx'});
   const ids=market==='nftmarket'?[spec.config.tokenId,spec.config.nftId]:[spec.config.assetA,spec.config.assetB];
   const binary=spec.compilers[paired?'pair':'stream'];assert.equal(sha(binary.path),binary.sha256);
   const args=[sourcePath,join(directory,'compiled'),...ids.map(String),...(paired?[String(market==='nftmarket')]:[])];
   const reused=prior?.report.markets[market]?.sourceSha256===sha(sourcePath);
   if(reused){mkdirSync(join(directory,'compiled'));writeFileSync(join(directory,'compiled/compilation_artifact.json'),prior.bytes.get(market+'/compiled/compilation_artifact.json'),{flag:'wx'});assert.equal(sha(join(directory,'compiled/compilation_artifact.json')),prior.report.markets[market].artifactSha256,'cached artifact changed during copy');writeFileSync(join(directory,'compile.log'),'Reused exact immutable bytecode from pinned source/dependency/compiler/domain identity; no proof or state reused.\n',{flag:'wx'});}
   else{const result=spawnSync(resolve(binary.path),args,{encoding:'utf8',timeout:180000,maxBuffer:4000000});writeFileSync(join(directory,'compile.log'),(result.stdout??'')+(result.stderr??''),{flag:'wx'});assert.equal(result.status,0,'compile failed; preserve output '+market);}
   const artifact=read(join(directory,'compiled/compilation_artifact.json')),audit=auditStreamArtifact(market,spec.config,artifact);save(join(directory,'FOREIGN_READ_AUDIT.json'),audit);
   records[market]={profile:paired?'source-covered-pair-triangular-recovery-v1':'source-covered-priority-stream-v3',policyVersion:paired?9:5,sourceSha256:sha(sourcePath),artifactSha256:sha(join(directory,'compiled/compilation_artifact.json')),marketId:null,foreignReadCommandsChecked:audit.foreignReadCommandsChecked,compilerInvoked:!reused,reusedBuildSha256:reused?prior.digest:null,fullUpsVerified:false,freshVaultBootstrapAccepted:false,liveAuthorization:false};
  }
  for(const{path,sha256}of Object.values(frozenInputs))assert.equal(sha(path),sha256,'build input changed');
  const files={};for(const name of['config.json',...Object.keys(spec.artifacts).map(k=>'dependencies/'+k+'.json'),...MARKETS.flatMap(k=>[k+'/main.psy.rs',k+'/compile.log',k+'/FOREIGN_READ_AUDIT.json',k+'/compiled/compilation_artifact.json'])])files[name]=sha(join(out,name));
  const manifest={schema:1,sdkCommit:freeze.sdkCommit,clientCommit:freeze.clientCommit,backendCommit:freeze.backendCommit,networkMagic:spec.networkMagic,chainRootAt1:spec.chainRootAt1,nativeProtocol:PROFILE,randomMode:false,markets:records,files,frozenInputs,financialOperations:0,fullUpsVerified:false,liveAuthorization:false,scope:'New offline stream candidates; complete bytecode, layout, key, full UPS, actual identity/metadata, source coverage, admission precedence and budget gates remain mandatory before live activation.'};validateManifestContents(out,manifest,freeze);save(join(out,'BUILD.json'),manifest);return manifest;
 }catch(error){save(join(out,'FAILURE.json'),{schema:1,status:'incomplete-build',financialOperations:0,automaticRetry:false});throw error;}
}
export function bindMarketSuite({build,marketIds,out,buildManifestSha256}){
 build=resolve(build);out=resolve(out);assert.ok(!existsSync(out),'fresh bound output required');const snapshot=loadBuildSnapshot(build,freeze,{expectedSha256:buildManifestSha256}),manifest=snapshot.manifest,readSnapshot=name=>JSON.parse(snapshot.files.get(name).toString('utf8'));
 assert.deepEqual(Object.keys(marketIds).sort(),[...MARKETS].sort(),'all four exact assignments required');assert.equal(new Set(Object.values(marketIds)).size,4,'unique market IDs');const c=readSnapshot('config.json'),assets=[c.assetA,c.assetB,c.nftId];
 for(const id of Object.values(marketIds))assert.ok(boundedId(id)&&!assets.includes(id),'distinct actual market ID');
 const dependencies=validateSuiteArtifactValues(Object.fromEntries(['native','tokenA','tokenB','nft'].map(role=>[role,readSnapshot('dependencies/'+role+'.json')]))),token=dependencies.tokenA,nft=dependencies.nft;const policies={};
 for(const market of MARKETS){
  const a=readSnapshot(market+'/compiled/compilation_artifact.json');auditStreamArtifact(market,c,a);
  assert.equal(snapshot.files.get(market+'/main.psy.rs').toString('utf8'),['orderbook','nftmarket'].includes(market)?generatePairOptimized(market,c):generateStream(market,c),'source/config/profile binding');
  const policy=['orderbook','nftmarket'].includes(market)?makePairOptimizedPolicy(market,marketIds[market],c,a,token,nft):makeStreamPolicy(market,marketIds[market],c,a,token,nft);
  assert.equal(policy.version,manifest.markets[market].policyVersion,'no profile downgrade');assert.equal(policy.profile,manifest.markets[market].profile,'exact profile identity');assert.equal(policy.live_authorization,false);policies[market]=policy;
 }
 mkdirSync(out,{recursive:true});const files={};for(const market of MARKETS){mkdirSync(join(out,market));for(const[name,v]of[['policy.json',policies[market].base],['stream-policy.json',policies[market]]]){const path=market+'/'+name;save(join(out,path),v);files[path]=sha(join(out,path));}}
 for(const[path,digest]of Object.entries(files))assert.equal(sha(join(out,path)),digest,'bound policy changed before publication');
 const result={schema:1,expectedBuildDigestMatched:buildManifestSha256!==undefined,buildSha256:snapshot.manifestSha256,sdkCommit:freeze.sdkCommit,networkMagic:manifest.networkMagic,chainRootAt1:manifest.chainRootAt1,marketIds,files,marketAssignmentsVerified:false,newKeysRegistered:false,freshVaultBootstrapAccepted:false,fullUpsVerified:false,liveAuthorization:false,financialOperations:0};save(join(out,'BOUND.json'),result);return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const[mode,...args]=process.argv.slice(2),flags={};assert.equal(args.length%2,0,'flag/value pairs');for(let i=0;i<args.length;i+=2){assert.ok(args[i].startsWith('--')&&!Object.hasOwn(flags,args[i]));flags[args[i]]=args[i+1];}
 if(mode==='compile')console.log(JSON.stringify(compileMarketSuite({spec:read(flags['--spec']),out:flags['--out'],...(flags['--reuse-build']||flags['--reuse-sha256']?{reuse:{build:flags['--reuse-build'],manifestSha256:flags['--reuse-sha256']}}:{})})));
 else if(mode==='bind')console.log(JSON.stringify(bindMarketSuite({build:flags['--build'],marketIds:read(flags['--market-ids']),out:flags['--out'],buildManifestSha256:flags['--build-sha256']})));
 else throw Error('compile --spec JSON --out FRESH [--reuse-build DIR --reuse-sha256 HASH] | bind --build DIR --market-ids JSON --out FRESH [--build-sha256 HASH]; offline only');
}
