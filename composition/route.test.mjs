import test from 'node:test';
import assert from 'node:assert/strict';
import {swapQuote} from '../amm/u124/client.mjs';
import {planExactRoute} from './route.mjs';

const hops = [
 {marketId: 2478n, assetIn: 2464n, assetOut: 2466n, reserveIn: 1000n, reserveOut: 1000n},
 {marketId: 2482n, assetIn: 2466n, assetOut: 2468n, reserveIn: 5000n, reserveOut: 8000n},
];

test('two exact floors chain the first output into the second input', () => {
 const route = planExactRoute({input: 100n, minimumOut: 1n, hops});
 const first = swapQuote(100n, 1000n, 1000n);
 const second = swapQuote(first, 5000n, 8000n);
 assert.equal(route.hops[0].output, first);
 assert.equal(route.hops[1].input, first);
 assert.equal(route.hops[1].output, second);
 assert.equal(route.finalOutput, second);
 assert.equal(route.invokeSync, false);
 assert.equal(route.atomic, false);
 assert.equal(route.execution, 'sequential-existing-amm-settlements');
});

test('a route stops when the final floor is below the caller minimum', () => {
 const route = planExactRoute({input: 100n, minimumOut: 1n, hops});
 assert.throws(() => planExactRoute({input: 100n, minimumOut: route.finalOutput + 1n, hops}), /final output below minimum/);
});

test('the second pool must take the first pool output asset', () => {
 const broken = [{...hops[0]}, {...hops[1], assetIn: 2464n}];
 assert.throws(() => planExactRoute({input: 100n, minimumOut: 1n, hops: broken}), /intermediate asset/);
});

test('one market cannot be both hops', () => {
 const broken = [{...hops[0]}, {...hops[1], marketId: hops[0].marketId}];
 assert.throws(() => planExactRoute({input: 100n, minimumOut: 1n, hops: broken}), /market reused/);
});

test('longer or single-hop routes are outside this module', () => {
 assert.throws(() => planExactRoute({input: 100n, minimumOut: 1n, hops: hops.slice(0, 1)}), /exactly two hops/);
 assert.throws(() => planExactRoute({input: 100n, minimumOut: 1n, hops: [...hops, {...hops[1], marketId: 2483n, assetIn: 2468n, assetOut: 2469n}]}), /exactly two hops/);
});

test('a zero floor is not a hop', () => {
 const dust = [{...hops[0], reserveOut: 1n}, hops[1]];
 assert.throws(() => planExactRoute({input: 1n, minimumOut: 1n, hops: dust}), /zero output|empty swap/);
});
