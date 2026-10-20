// Explicit recovery of ONE preserved transaction identity, never a new proof,
// nonce or transfer. Not an automatic retry loop. Unknown stays unknown until
// historical inclusion is reconciled by the normal receipt reader.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {read,save,run,binding} from './liveSupport.mjs';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {publicState} from '../../executor/publicState.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function recoverExactWire({config,input,attempt,verifier,out}){
 mkdirSync(out,{recursive:false});
 const requestPath=join(attempt,'request.json'),bytes=readFileSync(requestPath),wire=readFileSync(join(attempt,'rpc-request.json')),packet=parseLosslessJson(wire.toString()),request=parseLosslessJson(bytes.toString());
 assert.equal(packet.jsonrpc,'2.0');assert.equal(packet.id,1n);assert.equal(packet.method,'psy_submit_user_end_cap');assert.deepEqual(packet.params,request);assert.ok(wire.length<8*1024*1024);
 await run(verifier,[requestPath,join(out,'verification.json')],join(out,'verification.log'));
 const verified=read(join(out,'verification.json')),p=read(join(attempt,'preflight.json')),source=read(input);
 assert.equal(verified.fullProofVerifiedAgainstPinnedNodeKeyAndCommon,true);assert.equal(verified.metadataEndpointsAndFeesVerified,true);assert.equal(verified.requestSha256,sha(bytes));assert.equal(p.inputSha256,sha(readFileSync(input)));assert.equal(verified.endUserLeafHash,p.endUserLeafHash);
 const s=await publicState(config),realm=s.network.realm_configs.find(r=>r.id===Math.floor(verified.userId/s.network.users_per_realm));assert.ok(realm);assert.ok(['https://realm0-stg.psy-protocol.xyz','https://realm1-stg.psy-protocol.xyz'].includes(realm.rpc_url[0]));assert.ok(s.checkpoint>=verified.sourceCheckpoint&&s.checkpoint<=source.validUntilCheckpoint,'original bounded broadcast window');
 const dependencies=[];for(const expected of source.contracts){const current=await binding(s,expected.contract.contractId);assert.deepEqual(current,expected,'original dependency changed');dependencies.push(current);}
 const args={checkpoint_id:s.checkpoint,user_id:verified.userId},leaf=await s.rpc(realm.rpc_url[0],'psy_get_user_leaf_data',args),hash=await s.rpc(realm.rpc_url[0],'psy_get_user_tree_leaf_hash',args);
 assert.equal(leaf.public_key,verified.publicKeyHash);
 const identity={checkpoint:s.checkpoint,userId:verified.userId,nonce:verified.nonce,startUserLeafHash:verified.startUserLeafHash,endUserLeafHash:verified.endUserLeafHash,wireSha256:sha(wire),originalRequestSha256:sha(bytes),verifierBinarySha256:sha(readFileSync(verifier)),currentLeaf:leaf,currentLeafHash:hash,dependencies};
 if(hash===verified.endUserLeafHash){save(join(out,'decision.json'),{...identity,status:'already-applied-no-transmission',broadcast:false});return;}
 assert.equal(hash,verified.startUserLeafHash,'original anchor changed; reconcile, never replace the transaction');assert.equal(leaf.nonce+1,verified.nonce,'original next nonce only');
 save(join(out,'intent.json'),{...identity,status:'explicit-identical-wire-retransmission',priorOutcome:'unknown',mayAlreadyBePending:true,newBusinessOperation:false,automaticRetry:false,maximumTransmissionsInThisRecovery:1});
 // The exact original body is sent once. An RPC error/timeout is not permission
 // to create another proof or advance the nonce. Preserve it and reconcile.
 try{const response=await fetch(realm.rpc_url[0],{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:wire,signal:AbortSignal.timeout(120000)}),body=await response.text();assert.ok(Buffer.byteLength(body)<=65536,'oversized recovery response');save(join(out,'response.json'),{httpStatus:response.status,body,automaticRetry:false,included:false,reconciliationRequired:true});}
 catch(error){save(join(out,'transport-unknown.json'),{name:error.name,automaticRetry:false,included:false,reconciliationRequired:true});throw error;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const [config,input,attempt,verifier,out]=process.argv.slice(2);assert.ok(out,'CONFIG ORIGINAL_INPUT ORIGINAL_ATTEMPT OFFLINE_VERIFIER FRESH_OUT');await recoverExactWire({config,input,attempt,verifier,out});}
