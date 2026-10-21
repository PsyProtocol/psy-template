// Test harness only: production factory/journal, with a real parent termination
// after the child RPC result and before the journal receives that result.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';import{promisify}from'node:util';
import {dirname,join}from'node:path';import{readFile,access}from'node:fs/promises';
import{loadOptions}from'../config.mjs';import{createPublicWalletAdapter}from'../publicWalletAdapter.mjs';
import{ExecutionJournal}from'../journal.mjs';import{executeCycle}from'../worker.mjs';import{runDurableSubmission}from'../driverProcess.mjs';
import{publishFile}from'../durableFile.mjs';
const [config,marker]=process.argv.slice(2);assert.ok(marker,'CONFIG FRESH_PARENT_CRASH_MARKER');
const options=await loadOptions(config),run=promisify(execFile);
const adapter=await createPublicWalletAdapter(options,{runDriver:run,submitDriver:async(binary,args,opts)=>{
 await runDurableSubmission(binary,args,opts);
 await publishFile(marker,JSON.stringify({parentPid:process.pid,phase:'child-returned-before-journal-result',submissionDirectory:args[7],automaticRetry:false})+'\n');
 process.exit(88);
}});
const prove=adapter.prove;adapter.prove=async task=>{
 const p=await prove(task),out=p.preparedDirectory+'-verify-only',root=dirname(p.preparedDirectory);
 await run(options.wallet,['verify-prepared',options.policy,options.rpcConfig,join(root,'calls.json'),join(root,'guard.json'),p.preparedDirectory,p.manifestSha256,out],{env:{...process.env,PSY_MARKET_TESTNET_PROFILE:options.testnetProfile,RAYON_NUM_THREADS:String(options.proverThreads)},timeout:900000,maxBuffer:2000000});
 const v=JSON.parse(await readFile(join(out,'verification.json'),'utf8'));assert.equal(v.fullUpsVerified,true);assert.equal(v.reproved,false);
 await assert.rejects(()=>access(join(out,'intent.json')),{code:'ENOENT'});
 return p;
};
const journal=new ExecutionJournal({directory:options.runtimeDirectory,network:options.network,vaultId:options.vaultId,fingerprint:options.fingerprint});
console.log(JSON.stringify(await executeCycle({adapter,journal})));
