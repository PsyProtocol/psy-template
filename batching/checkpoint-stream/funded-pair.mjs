// Distinct candidate; never changes v9 priority or v14 AMM/Curve identities.
import assert from 'node:assert/strict';
import {generatePairOptimized} from './pair-optimized-generate.mjs';
import {makePairOptimizedPolicy} from './pair-optimized-build-policy.mjs';
import {attachFeeFunding} from './funded-generate.mjs';
import {attachFeePolicy} from './funded-policy.mjs';
export const FUNDED_PAIR_VERSION=15;
export const FUNDED_PAIR_PROFILE='source-covered-pair-funded-bootstrap-v1';
export function generateFundedPair(market,c){
 assert.ok(['orderbook','nftmarket'].includes(market),'distinct paired market');
 return attachFeeFunding(generatePairOptimized(market,c),c,market);
}
export function makeFundedPairPolicy(market,id,c,artifact,token,nft){
 const base=makePairOptimizedPolicy(market,id,c,artifact,token,nft);
 return attachFeePolicy(base,id,c,artifact,FUNDED_PAIR_VERSION,FUNDED_PAIR_PROFILE);
}
