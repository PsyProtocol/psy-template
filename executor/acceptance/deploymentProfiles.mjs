import assert from 'node:assert/strict';import {join} from 'node:path';
export function deploymentProfiles(value,base){
 assert.equal(value.version,1);assert.ok(Array.isArray(value.profiles));assert.deepEqual(value.profiles.map(p=>p.market).sort(),['amm','bondingcurve','nftmarket','orderbook']);
 for(const p of value.profiles){assert.match(p.publicKeyHash,/^[0-9a-f]{64}$/);assert.match(p.publicIdentitySha256,/^[0-9a-f]{64}$/);assert.equal(p.walletPath,join(base,'.secrets','deploy-'+p.market+'.json'));assert.equal(p.publicIdentity,join(base,'public','deploy-'+p.market+'-identity.json'));}
 assert.equal(new Set(value.profiles.map(p=>p.publicKeyHash)).size,4,'distinct deployment identities required');return new Map(value.profiles.map(p=>[p.market,p]));
}
