import test from'node:test';import assert from'node:assert/strict';import{mkdtempSync,writeFileSync,existsSync,rmSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';import{spawnSync}from'node:child_process';
test('formal app imports with one config argument do not execute fixture policy CLIs',()=>{
 const dir=mkdtempSync(join(tmpdir(),'psy-suite-import-'));
 try{const runner=join(dir,'importer.mjs'),sentinel=join(dir,'must-not-be-read-or-created');writeFileSync(runner,`await import(${JSON.stringify(new URL('./build.mjs',import.meta.url).href)}); console.log('import-only');\n`,{flag:'wx'});const child=spawnSync(process.execPath,[runner,sentinel],{encoding:'utf8',timeout:10000,maxBuffer:65536});assert.equal(child.status,0,child.stderr);assert.equal(child.stdout.trim(),'import-only');assert.equal(existsSync(sentinel),false);}finally{rmSync(dir,{recursive:true,force:true});}
});
