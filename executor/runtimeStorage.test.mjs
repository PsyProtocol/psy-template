import test from'node:test';import assert from'node:assert/strict';
import{mkdtempSync,mkdirSync,symlinkSync,rmSync}from'node:fs';import{join}from'node:path';import{homedir,tmpdir}from'node:os';
import{assertDurableRuntimeDirectory}from'./runtimeStorage.mjs';
test('temporary roots and missing descendants reject; persistent project path and similar names allow',()=>{
 for(const p of ['/tmp/psy/absent/runtime','/private/tmp/psy/runtime','/var/tmp/psy/runtime','/run/psy/runtime','/dev/shm/psy/runtime',join(tmpdir(),'psy/runtime')])assert.throws(()=>assertDurableRuntimeDirectory(p),/temporary|temp/);
 const root=mkdtempSync(join(homedir(),'.psy-runtime-test-'));try{assert.equal(assertDurableRuntimeDirectory(join(root,'tmp/runtime')),join(root,'tmp/runtime'));assert.equal(assertDurableRuntimeDirectory(join(root,'runtime')),join(root,'runtime'));}finally{rmSync(root,{recursive:true,force:true});}
});
test('symlink to temporary storage rejects, including a missing child, before any request is generated',()=>{
 const root=mkdtempSync(join(homedir(),'.psy-runtime-test-'));try{symlinkSync(tmpdir(),join(root,'runtime'));assert.throws(()=>assertDurableRuntimeDirectory(join(root,'runtime','missing')),/temporary/);mkdirSync(join(root,'persistent'));symlinkSync(join(root,'persistent'),join(root,'alias'));assert.equal(assertDurableRuntimeDirectory(join(root,'alias','new')),join(root,'persistent/new'));}finally{rmSync(root,{recursive:true,force:true});}
});
import{writeFileSync}from'node:fs';import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
test('financial CLI modes reject ephemeral journals before absent RPC or wallet can be touched',()=>{
 const root=mkdtempSync(join(tmpdir(),'psy-runtime-cli-'));try{
  const hash='a'.repeat(64),config=join(root,'executor.json'),service=join(root,'service.json');writeFileSync(config,JSON.stringify({kind:'amm',network:'sepolia',contractId:63,vaultId:512,publicKeyHash:hash,fingerprint:hash,codeRoot:hash,layoutRoot:hash,rpcConfig:'absent-rpc.json',wallet:'absent-wallet',abi:'absent-abi.json',runtimeDirectory:join(root,'runtime')}));writeFileSync(service,JSON.stringify({vaults:[config]}));
  for(const [entry,input]of [['run.mjs',config],['service.mjs',service]])for(const mode of ['once','watch']){const r=spawnSync(process.execPath,[fileURLToPath(new URL('./'+entry,import.meta.url)),input,mode],{encoding:'utf8',timeout:3000});assert.equal(r.status,1);assert.match(r.stderr,/financial runtimeDirectory is temporary/);assert.doesNotMatch(r.stderr,/ENOENT/);}
 }finally{rmSync(root,{recursive:true,force:true});}
});
