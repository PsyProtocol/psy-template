import test from 'node:test';import assert from 'node:assert/strict';import {retryRead,ReadUnavailable} from './readRetry.mjs';
test('transport read failure retries within a finite bound',async()=>{let calls=0;assert.equal(await retryRead(async()=>{if(++calls<3)throw new TypeError('connection timeout');return 42;},{delayMs:0}),42);assert.equal(calls,3);});
test('logical read errors are not retried; transport exhaustion is classified',async()=>{let calls=0;await assert.rejects(retryRead(async()=>{calls++;throw Error('contract identity mismatch');},{delayMs:0}),/identity/);assert.equal(calls,1);await assert.rejects(retryRead(async()=>{throw new TypeError('connection timeout');},{delayMs:0}),ReadUnavailable);});
test('HTTP 500 reads recover or enter bounded backoff; authorization failures remain fatal',async()=>{
 let calls=0;const unavailable=()=>Object.assign(Error('HTTP 500'),{status:500});
 assert.equal(await retryRead(async()=>{if(++calls===1)throw unavailable();return 'receipt';},{delayMs:0}),'receipt');assert.equal(calls,2);
 calls=0;await assert.rejects(retryRead(async()=>{calls++;throw unavailable();},{delayMs:0}),ReadUnavailable);assert.equal(calls,3);
 calls=0;await assert.rejects(retryRead(async()=>{calls++;throw Object.assign(Error('HTTP 403'),{status:403});},{delayMs:0}),/403/);assert.equal(calls,1);
});

test('empty read response retries with a bound; malformed nonempty JSON and data errors fail closed',async()=>{let calls=0;const empty=()=>JSON.parse('');assert.equal(await retryRead(async()=>{if(++calls===1)return empty();return 'exact original receipt';},{delayMs:0}),'exact original receipt');assert.equal(calls,2);calls=0;await assert.rejects(()=>retryRead(async()=>{calls++;return empty();},{delayMs:0}),ReadUnavailable);assert.equal(calls,3);calls=0;await assert.rejects(()=>retryRead(async()=>{calls++;return JSON.parse('{invalid');},{delayMs:0}),SyntaxError);assert.equal(calls,1);});
