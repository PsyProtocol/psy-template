import test from 'node:test';import assert from 'node:assert/strict';
import {newIntakePlan,scenarioProfile} from './scenarios.mjs';
test('new wider intake remains within contract bound with identical member capacity and explicit actor roles',()=>{
 const p=newIntakePlan({checkpoint:100,epoch:5,owner:134336,nonce:1n,scenario:'partial-recovery'});
 assert.equal(p.cutoff,196);assert.equal(p.members.length,1);
 assert.deepEqual(p.members,[{owner:134336,nonce:'1'}]);
 assert.deepEqual(scenarioProfile('partial-recovery'),{ownerIndex:1,publisherIndex:0,cutoffLead:96});
 assert.throws(()=>scenarioProfile('../.secrets'));
 assert.throws(()=>newIntakePlan({checkpoint:2**32-64,epoch:5,owner:1,nonce:1n,scenario:'partial-recovery'}));
});
