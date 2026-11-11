// Read-only recovery of one saved initial deployment. A missing receipt is
// unknown, never evidence that retransmission or a replacement is safe.
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha256} from '../requestBinding.mjs';
import {publicState} from '../publicState.mjs';
import {read, save, contractBinding} from '../../batching/admission/liveSupport.mjs';
import {freshDeploymentReceipt} from '../../batching/admission/freshDeployment.mjs';
import {verifyDeploymentOwner, PROFILE} from '../../batching/mainnet-beta/native.mjs';
import {readBoundedUtf8} from '../../market-client/rpcWire.mjs';

export function validateRecoveredDeployment({before, preflight, identity, requestBytes, receipt, leaf, checkpoint, owner}) {
  assert.equal(identity.requestSha256, sha256(requestBytes), 'original request changed');
  assert.equal(identity.deployer, String(owner));
  assert.match(identity.expectedContentHash, /^[0-9a-f]{64}$/);
  for (const name of ['codeRoot', 'functionTreeRoot', 'stateTreeHeight'])
    assert.equal(identity[name], preflight[name], 'lookup identity differs from verified initial endpoints');
  assert.equal(preflight.initialLayoutVerified, true);
  assert.equal(preflight.publicEndpointsBound, true);
  assert.equal(preflight.oldFieldCount, 0); assert.equal(preflight.oldSlotCount, 0);
  assert.equal(preflight.expectedDeployer, String(owner));
  assert.equal(receipt.success, true); const data = receipt.data;
  assert.equal(data.status, 'included'); assert.equal(data.tx_type, 'DeployContract');
  assert.equal(data.content_hash, identity.expectedContentHash);
  const id = freshDeploymentReceipt(before, data);
  assert.ok(checkpoint >= data.included_checkpoint_id, 'receipt not visible in common state');
  verifyDeploymentOwner(leaf, owner, PROFILE);
  for (const [actual, expected] of [['code_root','codeRoot'], ['function_tree_root','functionTreeRoot'],
    ['state_layout_root','layoutRoot'], ['state_tree_height','stateTreeHeight'],
    ['state_layout_field_count','newFieldCount'], ['state_layout_slot_count','newSlotCount']])
    assert.equal(leaf[actual], preflight[expected], 'recovered deployment endpoint ' + actual);
  return {contractId:id, binding:contractBinding(id, leaf)};
}

export async function reconcileInitialDeployment({config, attempt, identityPath, chainRootAt1, owner,
  readState=publicState, fetchImpl=fetch}) {
  assert.match(chainRootAt1, /^[a-f0-9]{64}$/); assert.notEqual(chainRootAt1, '0'.repeat(64));
  const identity=read(identityPath), before=read(join(attempt,'before.json')),
    preflight=read(join(attempt,'preflight.json')), intent=read(join(attempt,'intent.json')),
    requestBytes=readFileSync(join(attempt,'request.json'));
  assert.equal(sha256(requestBytes), identity.requestSha256, 'saved original request changed');
  assert.ok(Number.isSafeInteger(owner)&&owner>0&&owner<2**24,'registered numeric owner required');
  assert.match(identity.expectedContentHash,/^[0-9a-f]{64}$/);
  assert.equal(identity.deployer,String(owner));
  for(const name of ['codeRoot','functionTreeRoot','stateTreeHeight'])assert.equal(identity[name],preflight[name]);
  assert.equal(intent.action, 'initial-deploy-only'); assert.equal(intent.chainRootAt1, chainRootAt1);
  assert.equal(preflight.expectedDeployer, String(owner));
  const s=await readState(config), anchor=await s.rpc(s.coordinator,'psy_get_checkpoint_leaf_data',{checkpoint_id:1});
  assert.equal(s.networkName,'testnet'); assert.equal(anchor.global_chain_root,chainRootAt1,'chain reset; never replay a historical request');
  const c=read(config), url=c.networks[c.defaultNetwork].api_services_url[0].replace(/\/$/,'')+
    '/api/v1/transaction/hash/'+identity.expectedContentHash;
  const r=await fetchImpl(url,{signal:AbortSignal.timeout(20000),redirect:'manual',cache:'no-store'});
  const text=await readBoundedUtf8(r,1048576);
  const value=JSON.parse(text);
  const observation={at:new Date().toISOString(),contentHash:identity.expectedContentHash,checkpoint:s.checkpoint,
    chainRootAt1,httpStatus:r.status,receipt:value,broadcasts:0,newProofs:0};
  if(r.status===404 || (r.status===200 && value.data?.status!=='included'))
    return {...observation,status:'unknown',mayRetry:false,reason:'absence or pending status does not prove final rejection'};
  assert.equal(r.status,200,'receipt transport failed; original outcome remains unknown');
  const id=freshDeploymentReceipt(before,value.data), leaf=await s.contractLeaf(id);
  // Re-read the chain anchor after recovery too. The immutable request and
  // resource proof are preserved; no fake acknowledgement file is produced.
  assert.equal((await s.rpc(s.coordinator,'psy_get_checkpoint_leaf_data',{checkpoint_id:1})).global_chain_root,chainRootAt1);
  const checked=validateRecoveredDeployment({before,preflight,identity,requestBytes,receipt:value,leaf,checkpoint:s.checkpoint,owner});
  return {...observation,...checked,status:'included',leaf,preflight,receipt:value,requestSaved:true,initialLayoutReverified:false,
    scope:'Exact saved initial request, fresh occurrence, verified initial layout endpoints and indexed receipt. RPC/indexer observation is not an independent finality proof.'};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  assert.equal(process.argv.length,8,'CONFIG ORIGINAL_ATTEMPT LOOKUP_IDENTITY CHAIN_ROOT OWNER FRESH_REPORT');
  const [, ,config,attempt,identityPath,chainRootAt1,ownerText,out]=process.argv;
  assert.ok(!existsSync(out),'preserve prior observations'); const owner=Number(ownerText);
  const result=await reconcileInitialDeployment({config,attempt,identityPath,chainRootAt1,owner});
  save(out,result); console.log(JSON.stringify({status:result.status,contentHash:result.contentHash,
    contractId:result.contractId??null,checkpoint:result.checkpoint,broadcasts:0,newProofs:0}));
}
