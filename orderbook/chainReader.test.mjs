import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { OrderbookChainReader } from './chainReader.mjs';
import { ReadUnavailable } from '../executor/readRetry.mjs';

function reader(runCommand) {
  return new OrderbookChainReader({ cli: 'public-cli', rpcConfig: 'public.json',
    abi: { contract: { state: [] } }, contractId: 64, escrowId: 591872,
    runCommand, readRetryOptions: { attempts: 3, delayMs: 0 } });
}
test('readonly CLI retries connection failures and returns the recovered checkpoint', async () => {
  let calls = 0;
  const r = reader(async (_cli, args) => {
    assert.equal(args[0], 'get-latest-block-state');
    if (++calls < 3) throw Object.assign(Error('transport'), { stderr: 'Error: Connection error to https://realm.test: timeout' });
    await writeFile(args.at(-1), JSON.stringify({ block_state: { checkpoint_id: 157422 } }));
  });
  assert.equal(await r.latestCheckpoint(), 157422);
  assert.equal(calls, 3);
});
test('readonly CLI retries are bounded and semantic errors are returned immediately', async () => {
  let calls = 0;
  await assert.rejects(reader(async () => { calls++; throw Object.assign(Error('transport'),
    { stderr: 'Error: Connection error to https://realm.test: timeout' }); }).latestCheckpoint(), ReadUnavailable);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(reader(async () => { calls++; throw Error('invalid checkpoint'); }).latestCheckpoint(), /invalid checkpoint/);
  assert.equal(calls, 1);
});
