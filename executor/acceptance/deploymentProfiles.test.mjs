import test from 'node:test';import assert from 'node:assert/strict';import {deploymentProfiles} from './deploymentProfiles.mjs';
const fixture=()=>({version:1,profiles:['amm','orderbook','bondingcurve','nftmarket'].map((market,i)=>({market,publicKeyHash:String(i+1).repeat(64),publicIdentitySha256:'a'.repeat(64),walletPath:'/case/.secrets/deploy-'+market+'.json',publicIdentity:'/case/public/deploy-'+market+'-identity.json'}))});
test('fresh deployment release binds four distinct public identities to exact local files',()=>assert.equal(deploymentProfiles(fixture(),'/case').size,4));
test('duplicate keys, repeated/missing markets, foreign files and malformed hashes stop before loading a wallet',()=>{
 for(const change of [r=>r.profiles[1].publicKeyHash=r.profiles[0].publicKeyHash,r=>r.profiles[1].market='amm',r=>r.profiles.pop(),r=>r.profiles[0].walletPath='/other/private.json',r=>r.profiles[0].publicIdentity='/case/public/../other.json',r=>r.profiles[0].publicKeyHash='short']){const r=fixture();change(r);assert.throws(()=>deploymentProfiles(r,'/case'));}
});
