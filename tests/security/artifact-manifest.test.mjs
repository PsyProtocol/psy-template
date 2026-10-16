import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const required=['token/compilation_artifact.json','private-token/compilation_artifact.json','nft/compilation_artifact.json','market/compiled/compilation_artifact.json','vm-markets/amm/compilation_artifact.json','vm-markets/orderbook/compilation_artifact.json','vm-markets/bondingcurve/compilation_artifact.json'];
const hash=s=>createHash('sha256').update(s).digest('hex');
for(const mutation of ['source','product'])test(`offline suite refuses ${mutation} mismatch before running tests`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'psy-manifest-'));
 try {
  for(const file of required){mkdirSync(join(dir,file,'..'),{recursive:true});writeFileSync(join(dir,file),'{}');}
  const source='amm/u124/generate.mjs';
  const inputs={sources:{[source]:mutation==='source'?'0'.repeat(64):hash(readFileSync(source))},products:{'market/policy.json':hash('{}')}};
  writeFileSync(join(dir,'market/policy.json'),mutation==='product'?'changed':'{}');
  writeFileSync(join(dir,'inputs.json'),JSON.stringify(inputs));
  const out=join(dir,'results');
  const child=spawnSync(process.execPath,['tests/security/run-six-contracts.mjs','--artifacts',dir,'--out',out],{encoding:'utf8'});
  assert.notEqual(child.status,0);assert.match(child.stderr,mutation==='source'?/Source changed since compilation/:/Prepared product changed/);
  assert.equal(existsSync(out),false);
 }finally {rmSync(dir,{recursive:true,force:true});}
});
