import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sealDriver} from './sealedDriver.mjs';
import {sha256} from './requestBinding.mjs';
const run=promisify(execFile);
async function fixture(fn){const runtimeDirectory=await mkdtemp(join(tmpdir(),'psy-sealed-driver-'));try{
 const wallet=join(runtimeDirectory,'installed-wallet'),bytes='#!/bin/sh\nprintf original\n';await writeFile(wallet,bytes,{mode:0o700});
 await fn({wallet,walletSha256:sha256(bytes),runtimeDirectory});
 }finally{await rm(runtimeDirectory,{recursive:true,force:true});}}
test('running driver stays on the reviewed bytes after the installation path is replaced',()=>fixture(async options=>{
 const pinned=await sealDriver(options);assert.notEqual(pinned.file,options.wallet);
 await writeFile(options.wallet,'#!/bin/sh\nprintf replacement\n');await pinned.check();
 assert.equal((await run(pinned.file)).stdout,'original');
 await assert.rejects(sealDriver(options),/differs from reviewed/);
 assert.equal(sha256(await readFile(pinned.file)),options.walletSha256);
}));
test('missing digest, wrong digest, modified private driver and permission changes fail closed',()=>fixture(async options=>{
 await assert.rejects(sealDriver({...options,walletSha256:undefined}),/explicit reviewed/);
 await assert.rejects(sealDriver({...options,walletSha256:'0'.repeat(64)}),/differs from reviewed/);
 const pinned=await sealDriver(options);await chmod(pinned.file,0o700);await assert.rejects(pinned.check(),/permissions changed/);
 await writeFile(pinned.file,'#!/bin/sh\nprintf changed\n');await chmod(pinned.file,0o500);await assert.rejects(pinned.check(),/sealed driver changed/);
 await assert.rejects(sealDriver(options),/sealed driver changed/);
}));
