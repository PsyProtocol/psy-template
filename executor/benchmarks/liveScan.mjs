// Compare old and new read-only scans at one actual historical checkpoint.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {publicState} from '../publicState.mjs';
const operation=resolve('executor/operations/staging-2026-10-11'),output=resolve(process.argv[2]);
const state=await publicState(join(operation,'rpc-config.json')),checkpoint=state.checkpoint;
const original=globalThis.fetch,stringify=x=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
const metrics=[];
try{
 globalThis.fetch=async(url,options)=>{
  const request=JSON.parse(options.body);assert.ok(request.method.startsWith('psy_get_'));
  if(request.method==='psy_get_latest_l2_block_state')return {ok:true,json:async()=>({result:{checkpoint_id:checkpoint}})};
  assert.equal(request.params.checkpoint_id,checkpoint);return original(url,options);
 };
 for(const [kind,file,name] of [['amm','amm/chainReader.mjs','scanAmm'],['orderbook','orderbook/rpcReader.mjs','scanOrderbook'],['bondingcurve','bondingcurve/chainReader.mjs','scanCurve']]){
  const config=JSON.parse(await readFile(join(operation,kind+'.json'))),results=[];
  for(const [version,root] of [['baseline',join(operation,'app-v2')],['optimized',resolve('.')]]){
   const scan=(await import(pathToFileURL(join(root,file))))[name],start=performance.now();
   const result=await scan(config),ms=Number((performance.now()-start).toFixed(2));
   assert.equal(result.checkpoint,checkpoint);assert.equal(result.action,null);
   await writeFile(join(output,`live-${kind}-${version}.json`),stringify(result),{flag:'wx'});
   results.push(result);metrics.push({kind,version,users:config.users.length,checkpoint,ms});
   console.log(JSON.stringify(metrics.at(-1)));
  }
  assert.equal(stringify(results[0]),stringify(results[1]),'scan state/action changed: '+kind);
 }
 await writeFile(join(output,'live-parity.json'),stringify({status:'passed',mode:'read-only',submissions:0,checkpoint,metrics}),{flag:'wx'});
}finally{globalThis.fetch=original;}
