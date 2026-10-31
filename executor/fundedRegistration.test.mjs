// Explicit native/transport doubles: these assert durable ownership and recovery,
// not cryptographic membership or a real registration RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {continueFundedRegistration} from './fundedRegistration.mjs';
import {sha256} from './requestBinding.mjs';
const h='a'.repeat(64),other='b'.repeat(64);
async function fixture(fn){const root=await mkdtemp(join(process.cwd(),'.funded-registration-test-'));try{
 const o={profile:'source-funded-v14',network:'testnet',testnetProfile:'mainnet-beta-20261027-v1',runtimeDirectory:root,wallet:join(root,'driver'),walletSha256:sha256('native double'),fingerprint:h,publicKeyHash:h,vaultId:100,policy:join(root,'policy'),rpcConfig:join(root,'rpc')};
 await writeFile(o.wallet,'native double');await writeFile(o.rpcConfig,'{}');await writeFile(o.policy,JSON.stringify({version:14,qualified_randomness:false,executor_binding:{allow_broadcast:true,sdk_commit:'c92880c8b6e2c8d392f19368bc8801a2584fd427',chain_root:h}}));
 let ids=[],chain=h,sends=0,checks=0;
 const readState=async()=>({networkName:'testnet',network:{realm_configs:[{rpc_url:['https://realm.invalid']}]},rpc:async()=>({global_chain_root:chain}),userIds:async()=>ids});
 const runDriver=async(_file,args)=>{if(args[0]==='identity')return{stdout:JSON.stringify({profile:o.profile,publicKeyHash:h,fingerprint:h})};assert.equal(args[0],'check-registration');checks++;await mkdir(args[4]);await writeFile(join(args[4],'verification.json'),JSON.stringify({registered:true,broadcast:false,userId:100,publicKeyHash:h,fingerprint:h,chainRoot:h}));return{};};
 const submitDriver=async()=>{sends++;throw Error('registration ACK lost');};
 await fn({call:()=>continueFundedRegistration(o,{readState,runDriver,submitDriver}),ids:x=>ids=x,chain:x=>chain=x,counts:()=>({sends,checks})});
 }finally{await rm(root,{recursive:true,force:true});}}
test('registration sends once, preserves unknown identity, then verifies exact membership without resending',()=>fixture(async x=>{
 assert.equal((await x.call()).status,'registration-pending');assert.equal((await x.call()).status,'unresolved-registration');assert.equal(x.counts().sends,1);
 x.ids([100]);assert.equal((await x.call()).status,'registered');assert.deepEqual(x.counts(),{sends:1,checks:1});
}));
test('wrong chain and assigned user block funding/advancement',()=>fixture(async x=>{
 x.chain(other);await assert.rejects(x.call());assert.equal(x.counts().sends,0);x.chain(h);x.ids([101]);await assert.rejects(x.call(),/another identity/);assert.equal(x.counts().checks,0);
}));
test('a pre-existing exact registration is verified without another registration send',()=>fixture(async x=>{
 x.ids([100]);assert.equal((await x.call()).status,'registered');assert.deepEqual(x.counts(),{sends:0,checks:1});
}));
