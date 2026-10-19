import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bindRequest,sha256} from './requestBinding.mjs';
import {makePolicy,signingRequest} from '../amm/u124/policy.mjs';
import {losslessJson} from '../amm/u124/client.mjs';
const token=JSON.parse(await readFile(new URL('../token/wide/verification-2026-10-12/compiled-reviewed/compilation_artifact.json',import.meta.url))).abi;
const config={assetA:42,assetB:43,issuer:5,target:400,cap:20,liquidity:10,threshold:20,unit:'1000000000000000000',base:'1000000000000000000',step:'100000000000000000'};
for(const kind of ['amm','orderbook','bondingcurve'])test(`${kind} binds every branch, every explicit call and lossless byte digest`,async()=>{
 const abi=JSON.parse(await readFile(new URL(`./fixtures/u124/${kind}.abi.json`,import.meta.url))),policy=makePolicy(kind,1000,config,abi,token);
 for(const branch of policy.branches){
  const fields=[BigInt(branch.branch),200n,201n,17n,3n,19n,4n,23n,5n,1n,2n,3n,0n],request=signingRequest(policy,fields),text=losslessJson(request);
  const bound=bindRequest(text,policy,branch.name);assert.equal(bound.callsSha256,sha256(text));
  assert.notEqual(bindRequest(text+'\n',policy).callsSha256,bound.callsSha256);
  assert.throws(()=>bindRequest(text,policy,'other'),/task kind/);
  for(let i=0;i<request.contract_calls.length;i++)for(const change of [r=>{r.contract_calls[i].contract_id+=1n;},r=>{r.contract_calls[i].method_name+='bad';},r=>{r.contract_calls[i].inputs.push(999n);}]){
   const altered=structuredClone(request);change(altered);assert.throws(()=>bindRequest(losslessJson(altered),policy),/full registered policy/);
  }
  const extra=structuredClone(request);extra.ignorePolicy=true;assert.throws(()=>bindRequest(losslessJson(extra),policy),/full registered policy/);
  assert.throws(()=>bindRequest(text.replace('"contract_calls":','"contract_calls":[],"contract_calls":'),policy),/invalid object key/);
 }
});
