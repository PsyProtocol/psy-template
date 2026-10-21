import test from 'node:test';import assert from 'node:assert/strict';
import {assetCohort} from './cohortScope.mjs';
test('fresh market families retain explicit prior vault balances in accounting',()=>{
 const old={actors:[1,2,3,4,5],marketVaults:[6,7,8,9],legacyVaults:[10,11,12,13]};
 assert.equal(assetCohort(old).users.length,14);
 const expanded=assetCohort({...old,extraUsers:[14,15,16,17]});assert.equal(expanded.users.length,18);assert.deepEqual(expanded.assets,[2464,2466]);
 for(const extraUsers of [[1],[14,14],[0],[-1],[16777216],[1.25],[9007199254740992],Array.from({length:33},(_,i)=>100+i)])assert.throws(()=>assetCohort({...old,extraUsers}));
});
