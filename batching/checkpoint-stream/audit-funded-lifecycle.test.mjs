import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,rm,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {auditFundedLifecycle} from './audit-funded-lifecycle.mjs';
const source=process.env.FUNDED_LIFECYCLE_INPUT;
test('public lifecycle audit accepts the cohort and rejects graph/fee/source substitution', {skip:!source},async()=>{
 assert.equal((await auditFundedLifecycle(source)).completeUps,12);
 for(const [file,change]of [
  ['ordinary-final-claim/request.json',x=>x.user_ec_input.core.new_user_leaf.nonce++],
  ['ordinary-final-claim/verification.json',x=>x.fee++],
  ['bondingcurve-reachable-fee-recovery/source.json',x=>x.fields[6]++],
 ]){
  const root=await mkdtemp(join(tmpdir(),'funded-public-audit-'));try{
   await cp(source,root,{recursive:true});const path=join(root,file),data=JSON.parse(await readFile(path,'utf8'));change(data);await writeFile(path,JSON.stringify(data));
   await assert.rejects(auditFundedLifecycle(root));
  }finally{await rm(root,{recursive:true,force:true});}
 }
});
