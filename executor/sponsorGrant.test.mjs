import test from'node:test';import assert from'node:assert/strict';import{sponsorGrant}from'./sponsorGrant.mjs';import{FEE_ESCROW as F}from'../amm/u124/client.mjs';
const state={sent:9n,claimed:9n,settledFee:9n,pool:77n,amount:F,nonce:3n,used:3n,purpose:2n},scope={vault:77,purpose:2n,amount:F};
test('fresh sponsorship requires zero pending; an exact unused grant is adopted without another payment',()=>{
 assert.deepEqual(sponsorGrant(state,scope),{adopt:false,amount:F,purpose:2n,nonce:4n});
 assert.deepEqual(sponsorGrant({...state,sent:9n+F,nonce:4n},scope),{adopt:true,amount:F,purpose:2n,nonce:4n});
 assert.deepEqual(sponsorGrant({...state,sent:9n+2n*F,amount:2n*F,nonce:4n,purpose:1n},{...scope,amount:2n*F,purpose:1n}),{adopt:true,amount:2n*F,purpose:1n,nonce:4n});
});
test('leftover recovery grants, cursor drift, spent/foreign authorization and nonce overflow reject before funding',()=>{
 for(const patch of[{sent:9n+5n*F},{sent:9n+2n*F},{sent:9n+F/2n},{claimed:8n},{settledFee:8n},{sent:9n+F,pool:78n},{sent:9n+F,purpose:1n},{sent:9n+F,amount:2n*F},{sent:9n+F},{nonce:(1n<<62n)-1n}])assert.throws(()=>sponsorGrant({...state,...patch},scope));
});
test('recorded QA overfunding is refused before another fee transfer can be prepared',()=>{
 assert.throws(()=>sponsorGrant({sent:48004800000n,claimed:43004300000n,settledFee:43004300000n,pool:662720n,amount:F,nonce:39n,used:36n,purpose:2n},{vault:662720,purpose:2n,amount:F}),/unexpected pending sponsorship/);
});
