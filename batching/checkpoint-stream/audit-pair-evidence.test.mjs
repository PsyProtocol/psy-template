import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('importing evidence helpers does not run another market CLI',()=>{
 const paired=fileURLToPath(new URL('./audit-pair-evidence.mjs',import.meta.url));
 const input=`process.argv=['node',${JSON.stringify(paired)},'/not-a-real-evidence-directory'];await import(${JSON.stringify(new URL('./audit-evidence.mjs',import.meta.url).href)});process.stdout.write('IMPORT_ONLY');`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',input],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'IMPORT_ONLY');
});
