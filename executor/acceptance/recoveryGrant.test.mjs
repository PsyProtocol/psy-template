import test from 'node:test';import assert from 'node:assert/strict';
import {recoveryGrant} from './recoveryGrant.mjs';import {FEE_ESCROW as F} from '../../amm/u124/client.mjs';
const row={sent:9n,claimed:9n,settledFee:9n,pool:77n,amount:F,nonce:3n,used:3n,purpose:2n};
test('recovery grant sends only with zero pending or adopts the exact unused two-fee authorization',()=>{
 assert.deepEqual(recoveryGrant(row,77),{adopt:false,amount:2n*F,nonce:4n});
 assert.deepEqual(recoveryGrant({...row,sent:9n+2n*F,amount:2n*F,nonce:4n},77),{adopt:true,amount:2n*F,nonce:4n});
});
test('partial, overfunded, foreign, spent and mismatched-cursor grants stop rather than authorize a top-up',()=>{
 const pending={...row,sent:9n+2n*F,amount:2n*F,nonce:4n};
 for(const patch of [{sent:9n+F},{sent:9n+3n*F},{pool:78n},{purpose:1n},{amount:F},{nonce:3n},{settledFee:8n},{claimed:10n+2n*F}])assert.throws(()=>recoveryGrant({...pending,...patch},77));
});
