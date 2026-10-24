// Narrow proof-only recovery classification. A message alone never permits a
// replacement financial request. The service must reconcile the journal first.
import assert from 'node:assert/strict';
import {readFile, readdir, lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {sha256} from '../executor/requestBinding.mjs';

export class ProofSessionReadUnavailable extends Error {
  constructor(evidence, cause) {
    super('sealed proof session read failed before any request; reconcile before rebuilding', {cause});
    this.name='ProofSessionReadUnavailable';
    this.evidence=Object.freeze({...evidence});
  }
}
export async function proofReadEvidence(directory, rejection, endpoints) {
  assert.equal(rejection?.phase,'start-compact-session');
  assert.equal(typeof rejection.error,'string');
  assert.ok((await lstat(directory)).isDirectory());
  const names=await readdir(directory);
  assert.deepEqual(names.sort(),['failure.json'], 'partial or financial proof artifacts require review');
  const path=join(directory,'failure.json');
  assert.ok((await lstat(path)).isFile(), 'failure must be a regular file');
  const bytes=await readFile(path), failure=JSON.parse(bytes);
  assert.equal(failure.ok,false);
  assert.equal(failure.phase,rejection.phase);
  assert.equal(failure.reason,rejection.error, 'saved rejection must match the sealed child response');
  assert.equal(failure.broadcastMayHaveBeenAttempted,false);
  assert.equal(failure.automaticRetry,false);
  const endpoint=endpoints.find(url=>{
    const u=new URL(url);
    assert.equal(u.protocol,'https:');
    assert.equal(u.username+u.password+u.hash,'');
    const exact=url.replace(/\/$/,'');
    return failure.reason.startsWith('Connection error to '+exact+': ');
  });
  assert.ok(endpoint,'only a connection error to the pinned network permits session recovery');
  return {directory,failurePath:path,failureSha256:sha256(bytes),phase:failure.phase,endpoint,
    broadcastMayHaveBeenAttempted:false};
}
