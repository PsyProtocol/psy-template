import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {run} from '../../batching/admission/liveSupport.mjs';
async function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'psy-child-timing-'));try{await fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
test('cold command timing persists on success and includes child execution',()=>fixture(async dir=>{
 const log=join(dir,'success.log'),result=await run(process.execPath,['-e','setTimeout(()=>console.log("done"),20)'],log),saved=JSON.parse(readFileSync(log+'.timing.json'));
 assert.equal(saved.ok,true);assert.equal(saved.spawned,true);assert.equal(saved.exitCode,0);assert.equal(saved.signal,null);assert.ok(saved.wallMilliseconds>=20);assert.equal(result.wallMilliseconds,saved.wallMilliseconds);assert.equal('args'in saved,false);
}));
test('failed exit and failed spawn preserve their errors and timing without another process',()=>fixture(async dir=>{
 const log=join(dir,'exit.log'),counter=join(dir,'once');
 await assert.rejects(run(process.execPath,['-e','require("fs").appendFileSync(process.argv[1],"x");process.exit(7)',counter],log),/client exit 7/);
 assert.equal(readFileSync(counter,'utf8'),'x');const saved=JSON.parse(readFileSync(log+'.timing.json'));assert.equal(saved.ok,false);assert.equal(saved.exitCode,7);
 const missing=join(dir,'missing.log');await assert.rejects(run(join(dir,'absent-client'),[],missing),e=>e.code==='ENOENT');const absent=JSON.parse(readFileSync(missing+'.timing.json'));assert.equal(absent.ok,false);assert.equal(absent.spawned,false);assert.equal(absent.errorCode,'ENOENT');
}));
test('telemetry write failure neither repeats successful work nor replaces a failed command error',()=>fixture(async dir=>{
 const counter=join(dir,'once');for(const code of [0,9]){
  const log=join(dir,'command-'+code+'.log');mkdirSync(log+'.timing.json');const action=()=>run(process.execPath,['-e','require("fs").appendFileSync(process.argv[1],"x");process.exit(Number(process.argv[2]))',counter,String(code)],log);
  if(code===0)await action();else await assert.rejects(action(),/client exit 9/);
 }
 assert.equal(readFileSync(counter,'utf8'),'xx');
}));
test('existing original log is never overwritten or executed again',()=>fixture(async dir=>{
 const log=join(dir,'original.log');writeFileSync(log,'original');await assert.rejects(run(process.execPath,['-e','throw Error("must not execute")'],log),e=>e.code==='EEXIST');assert.equal(readFileSync(log,'utf8'),'original');
}));
