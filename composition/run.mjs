// Independent financial Executor route. Ownership/route constraints come from
// the dedicated controller/key, not the observation-only workflow scaffold.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {dirname,resolve} from 'node:path';
import {createCompositionAdapter} from './adapter.mjs';import {ExecutionJournal} from '../executor/journal.mjs';import {executeCycle,executionExitCode,pause} from '../executor/worker.mjs';
import {losslessJson} from '../amm/u124/client.mjs';
import {selectCompositionAction} from './selection.mjs';
const[file,mode='scan']=process.argv.slice(2);assert.ok(file&&['scan','once','watch','reconcile'].includes(mode),'composition/run.mjs CONFIG [scan|once|watch|reconcile]');
const config=JSON.parse(await readFile(file,'utf8')),paths=['intent','plan','policy','controllerAbi','controllerSource','controllerArtifact','tokenAbi','otherTokenAbi','nativeAbi','rpcConfig','wallet','runtimeDirectory'];
const allowed=[...paths,'marketAbis','profile','network','sdkManifestHash','testnetProfile','vaultId','fingerprint','publicKeyHash','walletSha256','controllerBudget','ownerFeeReserve','proverThreads','assetMetadata','components','controllerCompiler','tokenCompiler','marketCompiler','componentInspector','baseKeyDriver'];assert.ok(Object.keys(config).every(k=>allowed.includes(k)),'unknown composition configuration');
for(const p of paths){assert.ok(typeof config[p]==='string'&&config[p]);config[p]=resolve(dirname(file),config[p]);}
assert.ok(Array.isArray(config.marketAbis)&&config.marketAbis.length===2);config.marketAbis=config.marketAbis.map(p=>resolve(dirname(file),p));
assert.ok(Array.isArray(config.components));for(const c of config.components)for(const k of ['source','artifact',...(c.role==='market'?['config','policy']:[])]){assert.equal(typeof c[k],'string');c[k]=resolve(dirname(file),c[k]);}for(const k of ['controllerCompiler','tokenCompiler','marketCompiler','componentInspector','baseKeyDriver']){assert.equal(typeof config[k]?.file,'string');config[k].file=resolve(dirname(file),config[k].file);}
const adapter=await createCompositionAdapter(config),journal=new ExecutionJournal({directory:config.runtimeDirectory,network:config.network,vaultId:config.vaultId,fingerprint:config.fingerprint}),stop=new AbortController();process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
try{
 if(mode==='scan')console.log(losslessJson(await adapter.scan()));
 else if(mode==='reconcile')console.log(losslessJson(await journal.reconcile(adapter.reconcile)));
 else do{
  // Unknown broadcast is reconciled before any fee trace or new proof.
  await journal.reconcile(adapter.reconcile);
  const selection=await selectCompositionAction(adapter,journal);let result;
  if(selection.status!=='selected')result=selection;
  else{
   const exact=selection.task;
   // Reuse the normal journal proof validation/nonce/anchor/broadcast protocol.
   // A reused proof has its own authenticated source checkpoint. Observe the
   // current common checkpoint for telemetry without changing its exact task.
   const checkpoint=selection.checkpoint??(await adapter.scan()).checkpoint;
   result=await executeCycle({adapter:{...adapter,scan:async()=>({action:exact,checkpoint})},journal,signal:stop.signal});
  }
  console.log(losslessJson(result));if(mode==='once'){process.exitCode=executionExitCode(result);break;}if(result.status==='not-submitted')break;
  await pause(10000,stop.signal);
 }while(!stop.signal.aborted);
}finally{await adapter.close();}
