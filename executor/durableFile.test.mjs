import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,open,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {publishFile} from './durableFile.mjs';

async function fixture(fn){const directory=await mkdtemp(join(tmpdir(),'psy-publish-'));try{await fn(directory);}finally{await rm(directory,{recursive:true,force:true});}}
test('concurrent publishers expose one complete immutable file and clean their own temporary files',()=>fixture(async directory=>{
 const path=join(directory,'calls.json'),contents=JSON.stringify({calls:'x'.repeat(2000000)});
 const results=await Promise.allSettled([publishFile(path,contents),publishFile(path,contents)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.find(x=>x.status==='rejected').reason.code,'EEXIST');
 assert.equal(await readFile(path,'utf8'),contents);assert.deepEqual(await readdir(directory),['calls.json']);
 await assert.rejects(publishFile(path,'different'),{code:'EEXIST'});assert.equal(await readFile(path,'utf8'),contents);
}));
test('a real writer exit with a partial temporary file leaves the destination available for a complete retry',()=>fixture(async directory=>{
 const path=join(directory,'calls.json'),helper=new URL('./durableFile.mjs',import.meta.url).href;
 // Interrupt the real write after the first bytes reach disk, before publish.
 const script=`import {open} from 'node:fs/promises';
 const handle=await open(${JSON.stringify(join(directory,'probe'))},'w');
 handle.constructor.prototype.writeFile=async function(contents){await this.write(contents.slice(0,8));await this.sync();process.exit(9);};await handle.close();
 const {publishFile}=await import(${JSON.stringify(helper)});await publishFile(${JSON.stringify(path)},'complete public calls');`;
 const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:['ignore','ignore','pipe']});
 let error='';child.stderr.on('data',x=>error+=x);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(code,9,error);
 await assert.rejects(open(path,'r'),{code:'ENOENT'});
 const orphan=(await readdir(directory)).find(x=>x.endsWith('.tmp'));assert.ok(orphan);
 assert.equal(await readFile(join(directory,orphan),'utf8'),'complete');
 await publishFile(path,'complete public calls');assert.equal(await readFile(path,'utf8'),'complete public calls');
}));
