// An authenticated checkpoint state root is not an authenticated complete
// transaction list. No caller-provided success flag installs this capability.
export const REQUIRED_BLOCK_COVERAGE=Object.freeze([
 'a fixed chain instance and checkpoint commitment verified against the UPS history',
 'a complete transaction/operation commitment, count and canonical index range',
 'proof that every operation is included, excluded by the reviewed market predicate, or terminal',
 'binding to exact market, vault, assets, code/layout/function roots and key',
 'unique order identities, funding/cancellation cutoffs and complete dispositions',
 'reviewed verifier/common data and reproducible positive and omission/substitution rejection evidence',
]);
export function requireBlockCoverage(){
 const error=Error('No complete block-to-market coverage verifier is installed. A manifest or RPC scan cannot authorize whole-block settlement.');
 error.code='BLOCK_MARKET_COVERAGE_UNAVAILABLE';throw error;
}
export function requireStreamSettlement(){
 const error=Error('This legacy v1 component route has no installed, reviewed source-covered v3 spending driver. Candidate offline UPS evidence cannot enable it. Never execute pages with independent v4 batch seeds.');
 error.code='STREAM_MARKET_UPS_UNAVAILABLE';throw error;
}
