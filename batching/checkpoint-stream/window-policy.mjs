// Offline candidates for new instances only; formal live routing rejects them.
// A fixed deterministic window, never a runtime override or a fee reduction.
import assert from 'node:assert/strict';
import {generateExitStream} from './exit-generate.mjs';
import {makeExitPolicy} from './exit-policy.mjs';
import {makeNftBootstrapPolicy} from './nft-bootstrap-policy.mjs';
import {methodSpans} from '../v2/generate.mjs';

export const DETERMINISTIC_WINDOW=4096;
const profiles=Object.freeze({
 amm:[22,'source-covered-window-authorized-exit-v1'],
 bondingcurve:[22,'source-covered-window-authorized-exit-v1'],
 orderbook:[23,'source-covered-window-pair-authorized-exit-v1'],
 nftmarket:[24,'source-covered-window-nft-account-bootstrap-exit-v1'],
});
function exactConfig(value){
 if(typeof value==='number')assert.ok(Number.isSafeInteger(value),'large configuration amounts require exact decimal strings');
 else if(value&&typeof value==='object')for(const child of Object.values(value))exactConfig(child);
}
export function generateWindowStream(market,config){
 assert.ok(Object.hasOwn(profiles,market),'explicit deterministic window market');
 exactConfig(config);
 const source=generateExitStream(market,config);
 const open=methodSpans(source).filter(x=>x.name==='open_source_stream');
 assert.equal(open.length,1,'one source opener');
 const original='expiry == source + 32';
 assert.equal(open[0].body.split(original).length,2,'exact reviewed predecessor guard');
 const body=open[0].body.replace(original,`expiry == source + ${DETERMINISTIC_WINDOW}`);
 return source.slice(0,open[0].open+1)+body+source.slice(open[0].end-1);
}
export function makeWindowPolicy(market,id,config,artifact,token,nft,sdkProfile){
 assert.ok(Object.hasOwn(profiles,market),'explicit deterministic window market');
 exactConfig(config);
 assert.equal(sdkProfile,'sdk-audit-20261102-v1','frozen SDK only');
 const previous=market==='nftmarket'
  ?makeNftBootstrapPolicy(id,config,artifact,token,nft,sdkProfile)
  :makeExitPolicy(market,id,config,artifact,token,nft,sdkProfile);
 const [version,profile]=profiles[market];
 return {...previous,version,profile,source_window_checkpoints:DETERMINISTIC_WINDOW};
}
