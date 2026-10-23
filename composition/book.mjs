// Plans one AMM hop and then one resting orderbook cross. The book fill is the
// full bid: the AMM output is sold in one order, and the contract checks that
// deposit against the signed amount. Nothing here signs or submits.
import {integer, matchBook, swapQuote, user} from '../amm/u124/client.mjs';

export function planAmmThenBook({input, minimumOut, amm, trader, book}) {
 integer(input);
 integer(minimumOut);
 if (!input || !minimumOut) throw Error('positive input and minimum');
 user(amm.marketId);
 user(amm.assetIn);
 user(amm.assetOut);
 user(book.marketId);
 user(book.assetIn);
 user(book.assetOut);
 user(trader);
 if (amm.assetIn === amm.assetOut || book.assetIn === book.assetOut) throw Error('hop asset pair');
 if (book.assetIn !== amm.assetOut) throw Error('intermediate asset must be the previous output asset');
 if (book.marketId === amm.marketId) throw Error('market reused in one route');
 const intermediate = swapQuote(input, amm.reserveIn, amm.reserveOut);
 if (!intermediate) throw Error('zero output');
 if (!Array.isArray(book.bids) || book.bids.length === 0) throw Error('empty book');
 const fills = matchBook([{user: trader, amount: intermediate, minimum: minimumOut}], book.bids);
 if (fills.length !== 1) throw Error('no crossing order');
 const bid = fills[0].b;
 const output = bid.amount;
 if (output < minimumOut) throw Error('final output below minimum');
 return {
  schema: 1,
  execution: 'amm-settlement-then-orderbook-match',
  invokeSync: false,
  atomic: false,
  partialFill: false,
  input,
  intermediate,
  finalOutput: output,
  minimumOut,
  hops: [
   {kind: 'amm', marketId: amm.marketId, assetIn: amm.assetIn, assetOut: amm.assetOut, input, output: intermediate},
   {kind: 'orderbook', marketId: book.marketId, assetIn: book.assetIn, assetOut: book.assetOut, input: intermediate, output, counterparty: bid.user, counterpartyMinimum: bid.minimum},
  ],
 };
}
