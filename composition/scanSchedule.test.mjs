import test from'node:test';import assert from'node:assert/strict';
import{executionFixture}from'./executionFixtures.mjs';import{scanComposition}from'./execution.mjs';
function inflight(){const f=executionFixture();f.funded();f.field(100,'phase',5);f.field(100,'order_nonce',1);f.wide(100,'middle',77n);for(const[n,v]of Object.entries({kind:1,pool:400,nonce:1,side:1}))f.field(100,n,v,0,1001);return f;}
test('a failed pending limb drains all sibling reads before scan rejects',async()=>{
 const f=inflight();let active=0,failed=false;
 const state={...f.state,slot:async(u,c,i)=>{active++;try{if(u===400&&c===42&&i===33554453+400){failed=true;throw Error('read unavailable');}await new Promise(r=>setTimeout(r,2));return await f.state.slot(u,c,i);}finally{active--;}}};
 await assert.rejects(scanComposition(f.model,state),/read unavailable/);assert.equal(failed,true);assert.equal(active,0);
});
test('later scans cannot reuse old order nonce or consent eligibility',async()=>{
 const f=inflight();assert.equal((await scanComposition(f.model,f.state)).action,null);f.field(100,'nonce',2,0,1001);await assert.rejects(scanComposition(f.model,f.state));
});
test('negative pending and noncanonical U124 limbs remain rejected',async()=>{
 for(const mutate of [f=>f.put(100,42,33554455+1600,1n),f=>f.put(400,42,33554454+400,1n<<62n)]){const f=inflight();mutate(f);await assert.rejects(scanComposition(f.model,f.state));}
});
