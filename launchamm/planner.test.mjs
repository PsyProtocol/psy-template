import test from 'node:test';import assert from 'node:assert/strict';import {proposePoolAction} from './planner.mjs';
const config={poolContractId:67,poolUserId:1283072,tokenId:65,curveContractId:66,curveVaultId:758784,issuerId:1882112,psyUnit:1000,tokenUnit:1000000};
const pool={phase:1n,reservePsy:300003n,reserveToken:3000n,totalShares:30000n};
const o={payerId:222,pool:1283072n,kind:1n,asset:0n,amountPsy:10000n,amountToken:0n,minOut:1n,deadline:200n,nonce:1n,consumedNonce:0n,sentPsy:1010100000n,settledPsy:0n,sentToken:0n,settledToken:0n,ownedShares:0n};
const run=(order,checkpoint=100)=>proposePoolAction({config,pool,orders:[order],checkpoint});
test('planner requires exact funding and fresh nonce; slippage waits until expiry',()=>{
 assert.equal(run(o).submission.contract_calls[0].inputs[3],96);
 assert.equal(run({...o,sentPsy:o.sentPsy-1n}),null);assert.equal(run({...o,consumedNonce:1n}),null);
 assert.equal(run({...o,minOut:200n}),null);assert.equal(run({...o,minOut:200n},201).kind,'refund-swap');
});
test('expired partial LP funding returns only the funded leg to its payer',()=>{
 const a=run({...o,kind:2n,amountPsy:100n,amountToken:20n,sentPsy:1000200000n},201);
 assert.equal(a.kind,'refund-add');assert.deepEqual(a.submission.contract_calls[0].inputs,[222,100,0]);
});
test('expired remove uses fee-only cancellation and leaves shares intact',()=>{
 const a=run({...o,kind:3n,sentPsy:1000100000n,shares:1000n,ownedShares:1000n,minPsy:1n,minToken:1n},201);
 assert.equal(a.kind,'cancel-remove');assert.deepEqual(a.submission.contract_calls[0].inputs,[222,1]);
});
