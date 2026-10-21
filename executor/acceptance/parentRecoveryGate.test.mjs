import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {closedParent} from './parentRecoveryGate.mjs';
test('new financial cohort cannot start with missing claims, principal or fee reconciliation',()=>{
 const root=mkdtempSync(join(tmpdir(),'psy-parent-gate-'));mkdirSync(join(root,'public'));const p={version:1,admissionMode:'all-four-v1',parentCase:root},file=join(root,'public/maximum-partial-cancel-refund-complete-v1.json'),ok={allOriginalFtNftAndNativePrincipalReturned:true,ordinaryClaimsIncluded:true,maximumCapacityPassed:false,nativeBefore:'100',nativeAfter:'90',fees:'10',completedAt:'test'};
 try{assert.throws(()=>closedParent(p));for(const patch of [{ordinaryClaimsIncluded:false},{allOriginalFtNftAndNativePrincipalReturned:false},{maximumCapacityPassed:true},{fees:'9'},{nativeAfter:'110',fees:'-10'}]){writeFileSync(file,JSON.stringify({...ok,...patch}));assert.throws(()=>closedParent(p));}writeFileSync(file,JSON.stringify(ok));assert.match(closedParent(p).sha256,/^[0-9a-f]{64}$/);writeFileSync(file,JSON.stringify(ok).replace('\"100\"','9007199254741003').replace('\"90\"','9007199254740993'));assert.match(closedParent(p).sha256,/^[0-9a-f]{64}$/);}finally{rmSync(root,{recursive:true});}
});
