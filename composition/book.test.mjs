import test from 'node:test';
import assert from 'node:assert/strict';
import {swapQuote} from '../amm/u124/client.mjs';
import {planAmmThenBook} from './book.mjs';

const amm = {marketId: 2478n, assetIn: 2464n, assetOut: 2466n, reserveIn: 1000n, reserveOut: 1000n};
const book = {
 marketId: 2479n,
 assetIn: 2466n,
 assetOut: 2468n,
 bids: [
  {user: 70n, amount: 30n, minimum: 40n},
  {user: 80n, amount: 80n, minimum: 40n},
 ],
};

test('the AMM floor is sold in full to the best crossing bid', () => {
 const route = planAmmThenBook({input: 100n, minimumOut: 1n, amm, trader: 860352n, book});
 const intermediate = swapQuote(100n, 1000n, 1000n);
 assert.equal(route.intermediate, intermediate);
 assert.equal(route.hops[0].output, intermediate);
 assert.equal(route.hops[1].input, intermediate);
 assert.equal(route.hops[1].output, 80n);
 assert.equal(route.hops[1].counterparty, 80n);
 assert.equal(route.finalOutput, 80n);
 assert.equal(route.partialFill, false);
 assert.equal(route.invokeSync, false);
 assert.equal(route.atomic, false);
 assert.equal(route.execution, 'amm-settlement-then-orderbook-match');
});

test('a bid that cannot take the whole AMM output does not cross', () => {
 const tight = {...book, bids: [{user: 70n, amount: 90n, minimum: 91n}]};
 assert.throws(() => planAmmThenBook({input: 100n, minimumOut: 1n, amm, trader: 860352n, book: tight}), /no crossing order/);
});

test('the book must take the AMM output asset', () => {
 assert.throws(() => planAmmThenBook({input: 100n, minimumOut: 1n, amm, trader: 860352n, book: {...book, assetIn: 2464n}}), /intermediate asset/);
});

test('the AMM and the book are different markets', () => {
 assert.throws(() => planAmmThenBook({input: 100n, minimumOut: 1n, amm, trader: 860352n, book: {...book, marketId: amm.marketId}}), /market reused/);
});

test('the trader cannot fill their own bid', () => {
 const own = {...book, bids: [{user: 860352n, amount: 80n, minimum: 40n}]};
 assert.throws(() => planAmmThenBook({input: 100n, minimumOut: 1n, amm, trader: 860352n, book: own}), /no crossing order/);
});
