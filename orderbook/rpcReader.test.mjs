import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {scanOrderbook} from './rpcReader.mjs';
import {FEE_ESCROW} from './operationCalls.mjs';

test('RPC scan reads one checkpoint and rejects an underfunded pUSDT leg', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orderbook-rpc-test-'));
  try {
    const abi = join(directory, 'abi.json');
    await writeFile(abi, JSON.stringify({contract: {state: [
      ...['active_consumed_nonce', 'active_settled_psy_sent', 'active_settled_usdt_sent'].map((name, i) =>
        ({name, offset: 10000 + i * 1000, type: {item_felt_size: 1, length: 1000}})),
    ]}}));
    const reads = [];
    let sentUsdt = 199n;
    const state = {checkpoint: 100, fields: async user => ({order_kind: 1n,
      order_pool_user: 500n, order_sell_asset: user === 111 ? 0n : 4n,
      order_sell_amount: user === 111 ? 400n : 200n,
      order_min_buy: user === 111 ? 200n : 400n,
      order_deadline: 200n, order_nonce: 1n}),
      slot: async (user, contract, slot) => {
        reads.push([user, contract, slot]);
        if (user === 500) return 0n;
        if (contract === 4) return sentUsdt;
        return BigInt(FEE_ESCROW) + (user === 111 ? 400n : 0n);
      }};
    const options = {rpcConfig: 'test', abi, contractId: 64, vaultId: 500, users: [111, 222]};
    const readState = async () => state;
    const missing = await scanOrderbook(options, readState);
    assert.equal(missing.checkpoint, 100);
    assert.equal(missing.action, null);
    assert.equal(reads.some(([user, contract]) => user === 111 && contract === 4), false);
    sentUsdt = 200n;
    const funded = await scanOrderbook(options, readState);
    assert.equal(funded.action.kind, 'match');
    assert.deepEqual(funded.action.submission.contract_calls[0].inputs, [111, 222, 400, 200, 1, 1]);
    await assert.rejects(scanOrderbook({...options, users: [500]}, readState), /invalid seller ID/);
  } finally {await rm(directory, {recursive: true, force: true});}
});
