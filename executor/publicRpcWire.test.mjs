// Real loopback HTTP transport tests only; no financial/proof/extension acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicState } from './publicState.mjs';

async function fixture(fn) {
  const directory = await mkdtemp(join(tmpdir(), 'psy-rpc-wire-'));
  const calls = [];
  let mode = 'valid';
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const bytes of req) raw += bytes;
    const q = JSON.parse(raw); calls.push({ ...q, wire: raw });
    res.setHeader('content-type', 'application/json');
    if (q.method === 'psy_get_latest_l2_block_state') {
      res.end(JSON.stringify({ jsonrpc: '2.0', id: q.id, result: { checkpoint_id: 310 } }));
    } else if (mode === 'redirect') {
      res.writeHead(302, { location: '/redirect-target' }); res.end();
    } else {
      const envelope = { jsonrpc: mode === 'wrong-version' ? '1.0' : '2.0', id: mode === 'wrong-id' ? q.id + 1 : q.id, result: { nonce: 1 } };
      if (mode === 'both') envelope.error = { code: -32000, message: 'contradictory result' };
      if (mode === 'large') envelope.result.padding = 'x'.repeat(1_048_577);
      if (mode === 'neither') delete envelope.result;
      const body = JSON.stringify(envelope);
      // Exercise chunked reading, not only Content-Length rejection.
      res.write(body.slice(0, 700000)); res.end(body.slice(700000));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const config = join(directory, 'rpc.json');
  await writeFile(config, JSON.stringify({ defaultNetwork: 'test', networks: { test: { users_per_realm: 1000, realm_configs: [{ id: 0, rpc_url: [url] }], coordinator_configs: [{ rpc_url: [url] }] } } }));
  try { await fn({ config, calls, url, mode: value => { mode = value; } }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
}

test('the formal Executor rejects wrong response identity and conflicting/missing RPC outcomes without retry', () => fixture(async f => {
  const s = await publicState(f.config);
  for (const mode of ['wrong-id', 'wrong-version', 'both', 'neither']) {
    f.mode(mode); const before = f.calls.length;
    await assert.rejects(s.rpc(f.url, 'psy_get_user_leaf_data', { checkpoint_id: 310, user_id: 10 }));
    assert.equal(f.calls.length, before + 1, 'protocol errors are not transport retries');
  }
}));

test('the formal Executor bounds a chunked RPC body before accepting its result', () => fixture(async f => {
  const s = await publicState(f.config); f.mode('large'); const before = f.calls.length;
  await assert.rejects(s.rpc(f.url, 'psy_get_user_leaf_data', { checkpoint_id: 310, user_id: 10 }), /limit/);
  assert.equal(f.calls.length, before + 1);
  f.mode('valid');
  assert.deepEqual(await s.rpc(f.url, 'psy_get_user_leaf_data', { checkpoint_id: 310, user_id: 10 }), { nonce: 1 });
}));

test('redirects and unconfigured endpoints cannot become public state', () => fixture(async f => {
  const s = await publicState(f.config); f.mode('redirect'); let before = f.calls.length;
  await assert.rejects(s.rpc(f.url, 'psy_get_user_leaf_data', {}), /redirect/);
  assert.equal(f.calls.length, before + 1, 'a redirect is neither followed nor retried');
  before = f.calls.length;
  await assert.rejects(s.rpc(f.url + '/other-endpoint', 'psy_get_user_leaf_data', {}), /Unconfigured/);
  assert.equal(f.calls.length, before);
}));

test('i64::MAX checkpoint parameters retain exact raw integer bytes through coalesced reads', () => fixture(async f => {
  const s = await publicState(f.config);
  const results = await Promise.all([0, 1].map(() => s.rpc(f.url, 'psy_get_contract_tree_state_heights', { checkpoint_id: 9223372036854775807n, contract_ids: [8] }, { exactIntegers: true })));
  assert.equal(results.length, 2);
  const calls = f.calls.filter(q => q.method === 'psy_get_contract_tree_state_heights');
  assert.equal(calls.length, 1);
  assert.match(calls[0].wire, /"checkpoint_id":9223372036854775807[,}]/);
}));

test('mutating caller parameters cannot change queued read bytes or their coalescing identity', () => fixture(async f => {
  const s = await publicState(f.config), params = { checkpoint_id: 310, user_id: 10 };
  const first = s.rpc(f.url, 'psy_get_user_leaf_data', params);
  params.checkpoint_id = 311;
  await Promise.all([first, s.rpc(f.url, 'psy_get_user_leaf_data', params)]);
  const reads = f.calls.filter(q => q.method === 'psy_get_user_leaf_data');
  assert.equal(reads.length, 2);
  assert.deepEqual(reads.map(q => q.params.checkpoint_id).sort(), [310, 311]);
  const before = f.calls.length;
  await assert.rejects(s.rpc(f.url, 'psy_get_user_leaf_data', { checkpoint_id: Number.MAX_SAFE_INTEGER + 1 }));
  assert.equal(f.calls.length, before, 'unsafe integers fail before transport or retry');
}));
