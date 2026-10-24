// In-process reuse of verified immutable SOURCE/IR/layout closure, never state,
// nonce, transaction proofs, quotes or receipt results. One scope, three entries.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sha256} from '../executor/requestBinding.mjs';
import {losslessJson} from '../amm/u124/client.mjs';
import {componentPaths,verifyComponents} from './components.mjs';
import {verifyControllerBuild} from './controllerBuild.mjs';
import {verifyControllerDeployment} from './initialDeployment.mjs';
export function createCompositionBuildResources({observe=async()=>{},
  verifiers={components:verifyComponents,controller:verifyControllerBuild,deployment:verifyControllerDeployment}}={}) {
  let scope,inputGuard;
  const entries=new Map();
  const get=async(kind,o,model,io)=>{
    const identity=sha256(losslessJson({options:o,intentId:model.intent.id,
      registryHash:model.plan.registryHash,policy:model.policy}));
    if(scope)assert.equal(identity,scope,'build resources belong to another dependency/network/key/intent scope');
    else scope=identity;
    const started=performance.now(),hit=entries.has(kind);
    if(!inputGuard)inputGuard=(async()=>{
      const paths=[...['intent','plan','policy','controllerAbi','controllerSource','controllerArtifact',
        'tokenAbi','otherTokenAbi','nativeAbi','rpcConfig','wallet'].map(k=>o[k]),...o.marketAbis,
        ...componentPaths(o),...['controllerCompiler','tokenCompiler','marketCompiler','componentInspector','baseKeyDriver'].map(k=>o[k].file),
        ...(o.initialDeployment?[o.initialDeployment.request,o.initialDeployment.verifier.file]:[])];
      const hashes=new Map();
      for(const path of new Set(paths))hashes.set(path,sha256(await readFile(path)));
      return async()=>{for(const [path,hash] of hashes)
        assert.equal(sha256(await readFile(path)),hash,'cached verification input changed: '+path);};
    })();
    if(!hit)entries.set(kind,(async()=>{
      const checkInputs=await inputGuard;
      await checkInputs();
      const verified=await verifiers[kind](o,model,io);
      await checkInputs();await verified.check();
      return verified;
    })());
    const verified=await entries.get(kind);
    const checkInputs=await inputGuard;
    // A changed file rejects reuse; do not quietly compile a replacement under
    // the original cache identity. Live identity reads still run in the adapter.
    await checkInputs();await verified.check();
    await observe({kind,scope,cacheHit:hit,wallMilliseconds:Math.round(performance.now()-started),
      scopeDescription:'immutable local verification only; fresh live identities/session/state/nonce/full UPS remain mandatory'});
    return verified;
  };
  return {
    verifyRouteComponents:(o,m,io)=>get('components',o,m,io),
    verifyControllerSource:(o,m,io)=>get('controller',o,m,io),
    verifyInitialDeployment:(o,m,io)=>get('deployment',o,m,io)
  };
}
