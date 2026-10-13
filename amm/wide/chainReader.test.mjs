import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeAmmAction} from './chainReader.mjs';
import {proposeAmmAction as legacy} from '../chainReader.mjs';
import {swapQuote,initialQuote} from './quote.mjs';
const fee=1_000_100_000n;
const pool={reservePsy:1_500_000_000n,reserveUsdt:2_000_000n,totalShares:54_772_255n};
const order={payerId:1239104,pool:317504n,kind:1n,asset:0n,amountPsy:1_000_000_000n,amountUsdt:0n,minOut:1n,deadline:300n,nonce:2n,consumedNonce:1n,sentPsy:fee+1_000_000_000n,settledPsy:0n,sentUsdt:0n,settledUsdt:0n};
const input=o=>({contractId:2425,vaultId:317504,pool,orders:[o],checkpoint:200});
test('wide reader proposes exact overflow-safe quote while legacy reader retains its cap',()=>{
 const quote=swapQuote({reserveIn:pool.reservePsy,reserveOut:pool.reserveUsdt,amountIn:order.amountPsy});
 assert.ok(order.amountPsy*9970n*pool.reserveUsdt>18_446_744_069_414_584_321n);
 const action=proposeAmmAction(input(order));assert.equal(action.kind,'swap');
 assert.deepEqual(action.submission.contract_calls[0].inputs,[1239104,0,1_000_000_000,Number(quote.amountOut),2]);
 assert.equal(legacy(input(order)),null);
 assert.equal(proposeAmmAction(input({...order,sentPsy:order.sentPsy-1n})),null);
 const refund=proposeAmmAction({...input(order),checkpoint:301});
 assert.equal(refund.kind,'refund');assert.deepEqual(refund.submission.contract_calls[2].inputs,[1239104,1_000_000_000]);
});
test('wide initial liquidity and reserve cap are enforced by the scanner',()=>{
 const q=initialQuote({amountPsy:pool.reservePsy,amountUsdt:pool.reserveUsdt});
 const add={...order,kind:2n,amountPsy:pool.reservePsy,amountUsdt:pool.reserveUsdt,sentPsy:fee+pool.reservePsy,sentUsdt:pool.reserveUsdt,minOut:q.providerShares};
 const action=proposeAmmAction({...input(add),pool:{reservePsy:0n,reserveUsdt:0n,totalShares:0n}});
 assert.equal(action.kind,'add');assert.equal(action.submission.contract_calls[0].inputs[3],Number(q.providerShares));
 assert.equal(proposeAmmAction({...input(order),pool:{...pool,reservePsy:1_000_000_000_000n}}),null);
});
