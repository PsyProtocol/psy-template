import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseLosslessJson,losslessJson} from '../amm/u124/client.mjs';
import {signingRequest as marketRequest} from '../amm/u124/policy.mjs';
import {signingRequest as nftRequest} from '../nft-marketplace/policy.mjs';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

// The byte digest preserves exact integer literals and the caller's fee
// placeholder. The independently verified UPS report includes the actual fee.
export function bindRequest(text,policy,kind){
 assert.equal(typeof text,'string','lossless serialized submission required');
 const request=parseLosslessJson(text),fields=request?.software_defined_call?.inputs;
 const expected=(policy.market==='nftmarket'?nftRequest:marketRequest)(policy,fields);
 assert.deepEqual(request,parseLosslessJson(losslessJson(expected)),'request differs from the full registered policy call template');
 const branch=policy.branches.find(b=>BigInt(b.branch)===fields[0]);
 if(kind!==undefined)assert.equal(branch.name,kind,'task kind differs from policy branch');
 return {request,branch:branch.name,callsSha256:sha256(text)};
}
