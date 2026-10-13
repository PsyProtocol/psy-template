import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';

// Controlled RPC latency, same users/ABI/checkpoint for each implementation.
// No network, wallet or submit driver is used by this benchmark.
const root=resolve(process.argv[2]??'.'),count=100,repeats=3,delayMs=3;
const operation=resolve('executor/operations/staging-2026-10-11');
const directory=await mkdtemp(join(tmpdir(),'psy-scan-bench-'));
const rpcConfig=join(directory,'rpc.json');
await writeFile(rpcConfig,JSON.stringify({defaultNetwork:'test',networks:{test:{users_per_realm:1048576,realm_configs:[{id:0,rpc_url:['https://realm0.test']},{id:1,rpc_url:['https://realm1.test']}],coordinator_configs:[{rpc_url:['https://coordinator.test']}]}}}));
const original=globalThis.fetch;
try{
 for(const [kind,file,name] of [['amm','amm/chainReader.mjs','scanAmm'],['orderbook','orderbook/rpcReader.mjs','scanOrderbook'],['bondingcurve','bondingcurve/chainReader.mjs','scanCurve']]){
  const scan=(await import(pathToFileURL(join(root,file))))[name];
  const options={...JSON.parse(await readFile(join(operation,kind+'.json'))),rpcConfig,users:Array.from({length:count},(_,i)=>10000+i*64)};
  const samples=[];
  for(let run=0;run<repeats;run++){
   let calls=0,active=0,peak=0;
   globalThis.fetch=async(_url,request)=>{
    const {method}=JSON.parse(request.body);assert.ok(method.startsWith('psy_get_'));
    calls++;active++;peak=Math.max(peak,active);
    await new Promise(r=>setTimeout(r,delayMs));active--;
    return {ok:true,json:async()=>({result:method==='psy_get_latest_l2_block_state'?{checkpoint_id:100}:'0'.repeat(64)})};
   };
   const start=performance.now(),state=await scan(options);
   assert.equal(state.checkpoint,100);assert.equal(state.orders.length,count);assert.equal(state.action,null);
   samples.push({ms:Number((performance.now()-start).toFixed(2)),requests:calls,peak});
  }
  console.log(JSON.stringify({kind,users:count,rpcDelayMs:delayMs,samples}));
 }
}finally{globalThis.fetch=original;await rm(directory,{recursive:true,force:true});}
