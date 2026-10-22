// Plans one A→B→C path from two existing AMM pools. Each hop uses the same
// exact floor quote the AMM contract checks. Nothing here signs or submits.
import {integer, swapQuote, user} from '../amm/u124/client.mjs';

export function planExactRoute({input, minimumOut, hops}) {
 integer(input);
 integer(minimumOut);
 if (!input || !minimumOut) throw Error('positive input and minimum');
 if (!Array.isArray(hops) || hops.length !== 2) throw Error('minimal route is exactly two hops');
 let amount = input;
 const planned = [];
 for (let i = 0; i < hops.length; i++) {
  const hop = hops[i];
  user(hop.marketId);
  user(hop.assetIn);
  user(hop.assetOut);
  if (hop.assetIn === hop.assetOut) throw Error('hop asset pair');
  if (i > 0 && hop.assetIn !== hops[i - 1].assetOut) throw Error('intermediate asset must be the previous output asset');
  if (planned.some(p => p.marketId === hop.marketId)) throw Error('market reused in one route');
  const output = swapQuote(amount, hop.reserveIn, hop.reserveOut);
  if (!output) throw Error('zero output');
  planned.push({marketId: hop.marketId, assetIn: hop.assetIn, assetOut: hop.assetOut, input: amount, output});
  amount = output;
 }
 if (amount < minimumOut) throw Error('final output below minimum');
 return {schema: 1, execution: 'sequential-existing-amm-settlements', invokeSync: false, atomic: false, input, finalOutput: amount, minimumOut, hops: planned};
}
