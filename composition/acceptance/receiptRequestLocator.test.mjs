import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {indexBroadcastIntents, originalReceiptRequest} from './receiptRequestLocator.mjs';
import {parseLosslessJson} from '../../amm/u124/client.mjs';

test('formal result aliases require unique original task, payer and case request', () => {
  const base = mkdtempSync(join(tmpdir(),'receipt-locator-'));
  const outside = mkdtempSync(join(tmpdir(),'outside-receipt-'));
  try {
    mkdirSync(join(base,'journal')); mkdirSync(join(base,'prepared'));
    const source=join(base,'result.json'), request=join(base,'prepared/request.json');
    writeFileSync(source,'{}'); writeFileSync(request,'{}');
    const task=parseLosslessJson(JSON.stringify({operation:'return-middle',intentId:'fixed-intent',submission:'exact-calls'}));
    const result={taskId:'task-1',task,result:{status:'included'}};
    const original={status:'broadcast-intent',taskId:'task-1',task,
      scope:{vaultId:17},proof:{preparedDirectory:join(base,'prepared')}};
    writeFileSync(join(base,'journal/00000001-broadcast-intent.json'),JSON.stringify(original));
    const index=indexBroadcastIntents(base);
    assert.equal(originalReceiptRequest(base,source,result,17n,index),realpathSync(request));
    const legacy=join(base,'journal/00000002-included.json');
    writeFileSync(legacy,'{}');
    assert.equal(originalReceiptRequest(base,legacy,{status:'included',taskId:'task-1'},17n,index),realpathSync(request));
    assert.throws(()=>originalReceiptRequest(base,source,{status:'included',taskId:'task-1'},17n,index),/share the original journal/);
    assert.throws(()=>originalReceiptRequest(base,source,{...result,task:{...task,submission:'altered'}},17n,index),/task binding/);
    assert.throws(()=>originalReceiptRequest(base,source,result,18n,index),/payer binding/);
    assert.throws(()=>originalReceiptRequest(base,source,{...result,taskId:'missing'},17n,index),/exactly one/);
    assert.throws(()=>originalReceiptRequest(base,source,{...result,result:{status:'unknown'}},17n,index),/only included/);
    index.get('task-1').push(index.get('task-1')[0]);
    assert.throws(()=>originalReceiptRequest(base,source,result,17n,index),/exactly one/);
    index.get('task-1').pop();
    writeFileSync(join(outside,'request.json'),'{}');
    index.get('task-1')[0].record.proof.preparedDirectory=outside;
    assert.throws(()=>originalReceiptRequest(base,source,result,17n,index),/stay in case/);
  } finally { rmSync(base,{recursive:true,force:true}); rmSync(outside,{recursive:true,force:true}); }
});
