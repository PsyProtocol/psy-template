// Offline gate after exact indexed/historical receipt reconciliation. A missing
// receipt, expired deadline or observed higher nonce is never a conflict proof.
import assert from 'node:assert/strict';
import {sha256} from './requestBinding.mjs';
import {parseLosslessJson} from '../amm/u124/client.mjs';

export function ordinaryNonceConflict({originalBytes,resolutionBytes,originalVerification,resolutionVerification,included,expectedUserId,expectedPublicKeyHash}) {
 const pairs=[[originalBytes,originalVerification],[resolutionBytes,resolutionVerification]];
 const cores=pairs.map(([raw,v])=>{
  const c=parseLosslessJson(raw.toString()).user_ec_input.core;
  assert.equal(v.requestSha256,sha256(raw));
  assert.equal(v.fullProofVerifiedAgainstPinnedNodeKeyAndCommon,true);
  assert.equal(v.metadataEndpointsAndFeesVerified,true);
  assert.equal(BigInt(v.userId),BigInt(expectedUserId));
  assert.equal(v.publicKeyHash,expectedPublicKeyHash);
  assert.equal(BigInt(v.nonce),c.new_user_leaf.nonce);
  assert.equal(v.startUserLeafHash,c.state_transition.start_user_leaf_hash);
  assert.equal(v.endUserLeafHash,c.state_transition.end_user_leaf_hash);
  assert.equal(c.new_user_leaf.user_id,BigInt(expectedUserId));
  assert.equal(c.new_user_leaf.public_key,expectedPublicKeyHash);
  return c;
 });
 const [a,b]=cores;
 assert.equal(a.new_user_leaf.nonce,b.new_user_leaf.nonce);
 assert.equal(a.state_transition.start_user_leaf_hash,b.state_transition.start_user_leaf_hash);
 assert.notEqual(a.state_transition.end_user_leaf_hash,b.state_transition.end_user_leaf_hash);
 assert.notEqual(sha256(originalBytes),sha256(resolutionBytes));
 assert.equal(included.status,'included');
 assert.equal(BigInt(included.userId),BigInt(expectedUserId));
 assert.equal(included.endUserLeafHash,b.state_transition.end_user_leaf_hash);
 const r=included.receipt;
 assert.equal(r.success,true);assert.equal(r.data.status,'included');assert.equal(r.data.tx_type,'UserEndcap');
 assert.match(included.contentHash,/^[0-9a-f]{64}$/);
 assert.equal(r.data.content_hash,included.contentHash);
 assert.equal(BigInt(r.data.owner_user_id),BigInt(expectedUserId));
 assert.equal(BigInt(r.data.result.user_id),BigInt(expectedUserId));
 assert.equal(BigInt(r.data.included_checkpoint_id),BigInt(included.checkpoint));
 assert.ok(BigInt(included.commonCheckpoint)>=BigInt(included.checkpoint));
 assert.ok(BigInt(included.checkpoint)>=b.checkpoint_id);
 for(const k of ['slots_modified','total_transactions','user_ops_processed'])assert.equal(BigInt(r.data.result[k]),b.stats[k]);
 const fee=b.stats.guta_fees_collected+b.stats.da_fees_collected;
 assert.equal(BigInt(r.data.result.fees_collected),fee);
 return {schema:1,kind:'ordinary-confirmed-same-nonce-conflict',userId:BigInt(expectedUserId),publicKeyHash:expectedPublicKeyHash,nonce:a.new_user_leaf.nonce,start:a.state_transition.start_user_leaf_hash,originalEnd:a.state_transition.end_user_leaf_hash,resolutionEnd:b.state_transition.end_user_leaf_hash,originalRequestSha256:sha256(originalBytes),resolutionRequestSha256:sha256(resolutionBytes),resolutionContentHash:included.contentHash,checkpoint:included.checkpoint,commonCheckpoint:included.commonCheckpoint,fee,originalCannotExecute:true,scope:'two independently full-verified exact requests with same signer, nonce and start; winning resolution has exact historical-leaf/indexed receipt and common visibility. Not a missing-receipt or expiry inference.'};
}
