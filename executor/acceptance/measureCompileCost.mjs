// Nonfinancial compile experiment. New target only; generated binaries are
// observations and can never be selected as a transaction driver by this tool.
import assert from'node:assert/strict';import{readFileSync,mkdirSync,existsSync,openSync,closeSync,fsyncSync}from'node:fs';import{join}from'node:path';import{spawn,execFileSync}from'node:child_process';import{hostname,totalmem,cpus,loadavg}from'node:os';
import{sha256}from'../requestBinding.mjs';import{saveObservation}from'../observations.mjs';
const[frozenBuild,base]=process.argv.slice(2);assert.ok(base&&!existsSync(base));mkdirSync(base,{mode:0o700});mkdirSync(join(base,'public'));
const resolved=JSON.parse(readFileSync(join(frozenBuild,'RESOLVED-BUILD-v1.json'),'utf8')),manifestFile=join(process.cwd(),'batching/dependencies/session-bound-sdk-20261020/manifest.json'),manifest=JSON.parse(readFileSync(manifestFile,'utf8'));
assert.equal(sha256(readFileSync(manifestFile)),'0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425');assert.equal(resolved.toolchain,'nightly-2025-09-20');
const buildConfig=join(process.cwd(),'batching/dependencies/session-bound-sdk-20261020/build-config.json');assert.equal(manifest.configSha256,resolved.configSha256);
const check=()=>{assert.equal(sha256(readFileSync(buildConfig)),manifest.configSha256,'frozen build configuration changed');for(const[p,h]of Object.entries(resolved.resolvedSourceSha256))assert.equal(sha256(readFileSync(join(resolved.sourceRoot,p))),h,'frozen application source changed');for(const[p,h]of Object.entries(manifest.sourceFiles))assert.equal(sha256(readFileSync(join(resolved.sdkRoot,p))),h,'frozen SDK source changed');};check();
const target=join(base,'target');assert.ok(!existsSync(target));
const args=['+'+resolved.toolchain,'build','--release','--locked','--offline','-j','2','--bin','isolated_wallet','--bin','compact_market_wallet','--target-dir',target,'-Z','unstable-options','--timings=json','--message-format=json'];
const buildEnv={RAYON_NUM_THREADS:'2',PSY_CONFIG_PATH:buildConfig,PSY_NETWORK:manifest.network};
saveObservation(join(base,'public/BUILD-PLAN-v1.json'),{at:new Date().toISOString(),financialOperations:0,sourceRoot:resolved.sourceRoot,sdkRoot:resolved.sdkRoot,sdkManifestSha256:sha256(readFileSync(manifestFile)),buildConfigSha256:manifest.configSha256,explicitBuildEnvironment:buildEnv,externalRustcWrapperConfigured:Boolean(process.env.RUSTC_WRAPPER||process.env.RUSTC_WORKSPACE_WRAPPER),frozenApplicationFiles:Object.keys(resolved.resolvedSourceSha256).length,frozenSdkFiles:Object.keys(manifest.sourceFiles).length,command:['cargo',...args],maxMillisecondsPerBuild:2700000,cold:'new empty Cargo target directory; downloaded registry and OS filesystem caches retained',warm:'same command and target, unchanged sources; not warm transaction resources',newBinariesSelectedForFinancialUse:false,host:hostname(),physicalMemoryBytes:totalmem(),logicalCpus:cpus().length,loadAverage:loadavg(),rustc:execFileSync('rustc',['+'+resolved.toolchain,'-vV'],{encoding:'utf8'}),scope:'SDK/dependency/application source compilation, separate from new-process resource construction and resident transaction jobs'});
saveObservation(join(base,'public/MEASUREMENT-ROOT-v1.json'),{pid:process.pid,startedAt:new Date().toISOString()});saveObservation(join(base,'public/MEASUREMENT-EXCLUDE-v1.json'),{pids:[]});
const observer=spawn(process.execPath,['executor/acceptance/processTreeObserver.mjs',base,join(base,'public/MEASUREMENT-ROOT-v1.json'),join(base,'public/MEASUREMENT-EXCLUDE-v1.json'),'build-tree-v1'],{stdio:['ignore','ignore','inherit']}),observerExit=new Promise(resolve=>{observer.once('error',error=>resolve({error:String(error)}));observer.once('exit',(code,signal)=>resolve({code,signal}));});
const pause=ms=>new Promise(r=>setTimeout(r,ms)),rows=[];let ok=false;
try{
 for(let i=0;i<150&&!existsSync(join(base,'build-tree-v1-READY.json'));i++){assert.equal(observer.exitCode,null);await pause(100);}assert.ok(existsSync(join(base,'build-tree-v1-READY.json')));
 for(const mode of['cold','warm']){
  check();const stdout=openSync(join(base,mode+'.jsonl'),'wx',0o600),stderr=openSync(join(base,mode+'.stderr.log'),'wx',0o600),startedAt=new Date().toISOString(),start=performance.now();let timedOut=false;
  const child=spawn('cargo',args,{cwd:resolved.sourceRoot,env:{...process.env,...buildEnv},stdio:['ignore',stdout,stderr],detached:true});
  const timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGTERM');}catch{}},2700000);
  let result;try{result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});}finally{clearTimeout(timer);fsyncSync(stdout);fsyncSync(stderr);closeSync(stdout);closeSync(stderr);}
  const row={mode,startedAt,finishedAt:new Date().toISOString(),wallMilliseconds:performance.now()-start,...result,timedOut};rows.push(row);saveObservation(join(base,'public',mode+'-TIMING-v1.json'),row);assert.equal(result.code,0,'build failed; partial new target/logs retained, no second build automatically substituted');check();
  const binaries=['isolated_wallet','compact_market_wallet'].map(name=>({name,sha256:sha256(readFileSync(join(target,'release',name)))}));saveObservation(join(base,'public',mode+'-BINARIES-v1.json'),{binaries,selectedForFinancialUse:false});
 }
 ok=true;
}finally{
 observer.kill('SIGTERM');const outcome=await Promise.race([observerExit,pause(10000).then(()=>({timeout:true}))]);if(outcome.timeout)observer.kill('SIGKILL');
 saveObservation(join(base,'public/BUILD-COMPLETE-v1.json'),{at:new Date().toISOString(),ok,rows,observerOutcome:outcome,financialOperations:0,newBinariesSelectedForFinancialUse:false,scope:'compile wall and process-tree samples only; Cargo unit timings can overlap and are not additive category wall times'});assert.equal(outcome.code,0,'compile memory observation incomplete');
}
