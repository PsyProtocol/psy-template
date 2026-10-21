// Explicit accounting scope, never market discovery or a global inventory claim.
import assert from 'node:assert/strict';
export function assetCohort({actors,marketVaults,legacyVaults,extraUsers=[]}) {
 const users=[...actors,...marketVaults,...legacyVaults,1695936,...extraUsers];
 assert.ok(Array.isArray(extraUsers)&&extraUsers.length<=32,'bounded explicit extra cohort');
 assert.ok(users.every(id=>Number.isSafeInteger(id)&&id>0&&id<16777216),'exact cohort user IDs');
 assert.equal(new Set(users).size,users.length,'duplicate cohort accounts would double count assets');
 return {users,assets:[2464,2466],nftId:2467};
}
