import assert from 'node:assert/strict';
import {readFile,mkdir,lstat,chmod} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {publishFile} from './durableFile.mjs';
import {sha256} from './requestBinding.mjs';

// A configured digest is an operator's reviewed release pin. A private copy
// prevents replacing an install/current path from changing a running worker.
// This does not defend against an administrator controlling the host/runtime.
export async function sealDriver(options){
 assert.match(options.walletSha256??'',/^[0-9a-f]{64}$/,'explicit reviewed walletSha256 required');
 const original=await readFile(options.wallet);
 assert.equal(sha256(original),options.walletSha256,'driver differs from reviewed walletSha256');
 const file=join(options.runtimeDirectory,'drivers',options.walletSha256,'market-wallet');
 await mkdir(dirname(file),{recursive:true,mode:0o700});
 try{await publishFile(file,original);}catch(e){if(e.code!=='EEXIST')throw e;assert.ok((await lstat(file)).isFile(),'sealed driver must be a regular file');assert.equal(sha256(await readFile(file)),options.walletSha256,'sealed driver changed');}
 await chmod(file,0o500);
 const check=async()=>{
  const stat=await lstat(file);assert.ok(stat.isFile(),'sealed driver must be a regular file');
  assert.equal(stat.mode&0o7777,0o500,'sealed driver permissions changed');
  assert.equal(sha256(await readFile(file)),options.walletSha256,'sealed driver changed');
 };
 await check();return {file,check,sha256:options.walletSha256};
}
