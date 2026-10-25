import test from 'node:test';import assert from 'node:assert/strict';
import {ordinaryNonceConflict} from './ordinaryNonceConflict.mjs';
import {losslessJson} from '../amm/u124/client.mjs';import {sha256} from './requestBinding.mjs';
const hash=n=>String(n).repeat(64);
function fixture(){
 const make=end=>{
  const core={checkpoint_id:10n,new_user_leaf:{user_id:17n,public_key:hash(1),nonce:44n},state_transition:{start_user_leaf_hash:hash(2),end_user_leaf_hash:end},stats:{guta_fees_collected:1000000000n,da_fees_collected:1000n,slots_modified:1n,total_transactions:2n,user_ops_processed:1n}};
  const raw=Buffer.from(losslessJson({user_ec_input:{core}}));
  return [raw,{requestSha256:sha256(raw),fullProofVerifiedAgainstPinnedNodeKeyAndCommon:true,metadataEndpointsAndFeesVerified:true,userId:17,publicKeyHash:hash(1),nonce:44,startUserLeafHash:hash(2),endUserLeafHash:end}];
 };
 const [originalBytes,originalVerification]=make(hash(3)),[resolutionBytes,resolutionVerification]=make(hash(4));
 return {originalBytes,resolutionBytes,originalVerification,resolutionVerification,expectedUserId:17,expectedPublicKeyHash:hash(1),included:{status:'included',userId:17,endUserLeafHash:hash(4),checkpoint:11,commonCheckpoint:12,contentHash:hash(5),receipt:{success:true,data:{status:'included',tx_type:'UserEndcap',owner_user_id:17,content_hash:hash(5),included_checkpoint_id:11,result:{user_id:17,fees_collected:1000001000,slots_modified:1,total_transactions:2,user_ops_processed:1}}}}};
}
test('same-nonce ordinary conflict requires both exact verified requests and exact confirmed winner',()=>{const r=ordinaryNonceConflict(fixture());assert.equal(r.originalCannotExecute,true);assert.equal(r.nonce,44n);});
test('receipt, identity, fee, verification and raw-byte substitutions do not retire an ambiguous request',()=>{
 for(const change of [x=>x.originalVerification.fullProofVerifiedAgainstPinnedNodeKeyAndCommon=false,x=>x.resolutionVerification.metadataEndpointsAndFeesVerified=false,x=>x.resolutionBytes=Buffer.concat([x.resolutionBytes,Buffer.from(' ')]),x=>x.originalVerification.nonce=45,x=>x.expectedPublicKeyHash=hash(6),x=>x.included.endUserLeafHash=hash(3),x=>x.included.receipt.data.owner_user_id=18,x=>x.included.receipt.data.result.fees_collected++,x=>x.included.receipt.data.content_hash=hash(6),x=>x.included.receipt.data.result.slots_modified=2,x=>x.included.status='unresolved',x=>x.included.commonCheckpoint=10,x=>{x.resolutionBytes=x.originalBytes;x.resolutionVerification=x.originalVerification;}]){const x=fixture();change(x);assert.throws(()=>ordinaryNonceConflict(x));}
});
