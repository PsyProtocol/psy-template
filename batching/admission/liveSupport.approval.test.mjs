import test from 'node:test';
import assert from 'node:assert/strict';
import {ordinary} from './liveSupport.mjs';

// These invalid approvals must be rejected before config reads, RPC, prover,
// signer or filesystem work. The missing config makes accidental fallthrough
// fail with a distinct error rather than reaching a real network.
const base={base:'/nonexistent-qa-case',config:'/nonexistent-rpc-config',calls:[],
 env:{PSY_REQUIRE_ORDINARY_APPROVAL:'1'}};
const valid={userId:123,publicKeyHash:'01'.repeat(32),startUserLeafHash:'0'.repeat(64),nextNonce:'1'};
test('required approval is rejected before any ordinary resource or network work',async()=>{
 await assert.rejects(ordinary(base),/explicit approved actor required/);
});
test('malformed reviewed actor cannot reach ordinary preparation',async()=>{
 for(const mutation of [
  {userId:0},{userId:2**24},{userId:1.5},{publicKeyHash:'A'.repeat(64)},
  {startUserLeafHash:'abc'},{nextNonce:'01'},{nextNonce:'0'},{nextNonce:1},
  {nextNonce:'18446744069414584321'},{isNewUser:true},
 ])await assert.rejects(ordinary({...base,expectedActor:{...valid,...mutation}}),error=>error.code!=='ENOENT');
});
