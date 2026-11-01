import assert from 'node:assert/strict';
const models=Object.freeze({
 'source-funded-v14':Object.freeze({version:14n,policy:'source-covered-deterministic-funded-bootstrap-v1',markets:Object.freeze(['amm','bondingcurve'])}),
 'source-funded-pair-v15':Object.freeze({version:15n,policy:'source-covered-pair-funded-bootstrap-v1',markets:Object.freeze(['orderbook','nftmarket'])}),
 'source-authorized-exit-v18':Object.freeze({version:18n,policy:'source-covered-authorized-exit-v1',markets:Object.freeze(['amm','bondingcurve'])}),
 'source-pair-authorized-exit-v19':Object.freeze({version:19n,policy:'source-covered-pair-authorized-exit-v1',markets:Object.freeze(['orderbook','nftmarket'])})
});
export function fundedProfile(profile,kind){const model=models[profile];assert.ok(model&&model.markets.includes(kind),'explicit supported funded profile/market required');return model;}
export function isFundedProfile(profile){return Object.hasOwn(models,profile);}
