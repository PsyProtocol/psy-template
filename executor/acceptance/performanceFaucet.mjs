// Exactly one explicit faucet request per fresh owned QA actor; no retries.
import assert from 'node:assert/strict';import {join} from 'node:path';import {mkdir} from 'node:fs/promises';
import {assertDurableRuntimeDirectory} from '../runtimeStorage.mjs';import {publishFile} from '../durableFile.mjs';
import {read} from '../../batching/admission/liveSupport.mjs';import {publicState} from '../publicState.mjs';
import {observationJson} from '../observations.mjs';
const[base,name]=process.argv.slice(2);assertDurableRuntimeDirectory(base);assert.ok(['performance-owner','performance-recipient'].includes(name));
const config=join(base,'public/rpc.json'),s=await publicState(config),identity=read(join(base,'public',name+'-identity.json')),ids=await s.userIds(identity.publicKeyHash);
assert.equal(s.networkName,'sepolia');assert.equal(BigInt(s.network.magic),1384803358401154921n);assert.equal(ids.length,1);assert.deepEqual(s.network.faucet_rpc_url,['https://faucet-stg.psy-protocol.xyz']);
const out=join(base,'attempts',name+'-faucet-v1');await mkdir(out);const body={jsonrpc:'2.0',id:1,method:'psy_claim_faucet',params:[{recipient_user_id:ids[0]}]};
await publishFile(join(out,'request.json'),JSON.stringify(body)+'\n');await publishFile(join(out,'intent.json'),JSON.stringify({startedAt:new Date().toISOString(),userId:ids[0],publicKeyHash:identity.publicKeyHash,networkMagic:String(s.network.magic),oneAttempt:true,automaticRetry:false})+'\n');
const started=performance.now();
try{const r=await fetch(s.network.faucet_rpc_url[0],{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const text=await r.text();await publishFile(join(out,'response.json'),text);await publishFile(join(out,'observation.json'),observationJson({status:r.status,finishedAt:new Date().toISOString(),wallMilliseconds:performance.now()-started,scope:'one faucet HTTP response; no ordinary claim or grant inclusion certified'})+'\n');assert.ok(r.ok);const response=JSON.parse(text);assert.ok(!response.error,'faucet refused; inspect preserved response, no automatic retry');}
catch(error){await publishFile(join(out,'unknown-or-rejected.json'),JSON.stringify({at:new Date().toISOString(),automaticRetry:false,scope:'Request may have been received; reconcile original actor/grant before any retry. A saved response may describe an explicit rejection.'})+'\n');throw error;}
