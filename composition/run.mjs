// Independent financial Executor route. Ownership/route constraints come from
// the dedicated controller/key, not the observation-only workflow scaffold.
import assert from 'node:assert/strict';
import {loadCompositionConfig} from './config.mjs';
import {runCompositionService} from './service.mjs';
import {createCompositionAdapter} from './adapter.mjs';
import {losslessJson} from '../amm/u124/client.mjs';
const[file,mode='scan']=process.argv.slice(2);assert.ok(file&&['scan','once','watch','reconcile'].includes(mode),'composition/run.mjs CONFIG [scan|once|watch|reconcile]');
const config=await loadCompositionConfig(file);
const stop=new AbortController();process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
if(mode==='scan'){
 const adapter=await createCompositionAdapter(config);
 try{console.log(losslessJson(await adapter.scan()));}finally{await adapter.close();}
}else{
 const result=await runCompositionService(config,{mode,signal:stop.signal,settings:config.service,
  onStatus:event=>console.log(losslessJson(event))});
 process.exitCode=['completed','reconciled','included','already-included','idle','owner-claim-required','stopped'].includes(result.status)?0:1;
}
