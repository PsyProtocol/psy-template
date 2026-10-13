import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {validateOptions,validateUsers,loadService,currentUsers} from './config.mjs';
const input={kind:'amm',network:'test',contractId:63,vaultId:123,publicKeyHash:'a'.repeat(64),fingerprint:'b'.repeat(64),codeRoot:'c'.repeat(64),layoutRoot:'d'.repeat(64),rpcConfig:'rpc.json',wallet:'pool_wallet',abi:'abi.json',runtimeDirectory:'runtime',users:[222,111,111]};
test('configuration pins identity, rejects wallet credential fields, and normalizes paths and user hints',()=>{
 const o=validateOptions(input,'/tmp/psy-executor');assert.equal(o.wallet,'/tmp/psy-executor/pool_wallet');assert.deepEqual(o.users,[111,222]);
 assert.equal(o.receiptMaxPages,20);assert.equal(validateOptions({...input,receiptMaxPages:100}).receiptMaxPages,100);
 for(const bad of [{private_key:'secret'},{fingerprint:'bad'},{vaultId:0},{users:[123]},{intervalMs:0},{receiptMaxPages:0},{receiptMaxPages:101},{receiptMaxPages:1.5},{kind:'unknown'}])assert.throws(()=>validateOptions({...input,...bad}));
 assert.throws(()=>validateUsers([16777216],123));
 assert.throws(()=>validateOptions({...input,kind:'bondingcurve'}),/driverConfig/);
});
test('duplicate vaults fail before adapter startup; user hint files are validated each read',async()=>{
 const d=await mkdtemp(join(tmpdir(),'psy-service-config-'));
 try{
  await writeFile(join(d,'vault.json'),JSON.stringify(input));
  await writeFile(join(d,'service.json'),JSON.stringify({vaults:['vault.json','vault.json']}));
  await assert.rejects(loadService(join(d,'service.json')),/duplicate/);
  const file=join(d,'users.json');await writeFile(file,'[111,222,111]');
  assert.deepEqual(await currentUsers({...input,usersFile:file}),[111,222]);await writeFile(file,'[123]');
  await assert.rejects(currentUsers({...input,usersFile:file}),/valid payer/);
 }finally{await rm(d,{recursive:true,force:true});}
});
