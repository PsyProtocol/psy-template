import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedUtf8, rpcEnvelope, RpcProtocolError } from './rpcWire.mjs';
import { parseLosslessJson } from '../amm/u124/client.mjs';

test('stream bounds count UTF-8 bytes, reject invalid encoding and cancel oversized streams', async () => {
  assert.equal(await readBoundedUtf8(new Response('é'), 2), 'é');
  await assert.rejects(readBoundedUtf8(new Response('é'), 1), /limit/);
  await assert.rejects(readBoundedUtf8(new Response(new Uint8Array([0xff])), 10), RpcProtocolError);
  for (const value of ['1001', '-1', 'NaN', '01']) {
    await assert.rejects(readBoundedUtf8(new Response('ok', { headers: { 'content-length': value } }), 1000), /limit/);
  }
  let cancelled = 0;
  const body = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(10)); }, cancel() { cancelled++; } });
  await assert.rejects(readBoundedUtf8(new Response(body), 5), /limit/);
  assert.equal(cancelled, 1);
  assert.equal(body.locked, false);
});

test('RPC identity and exclusive outcome checks retain exact large public integers', () => {
  const raw = '{"jsonrpc":"2.0","id":1,"result":{"nonce":4611686018427387921}}';
  assert.equal(rpcEnvelope(parseLosslessJson(raw)).result.nonce, 4611686018427387921n);
  assert.equal(rpcEnvelope({ jsonrpc: '2.0', id: 1, result: null }).result, null);
  assert.equal(rpcEnvelope({ jsonrpc: '2.0', id: 1n, error: { code: -32001n, message: 'metadata unavailable' } }).error.code, -32001n);
  for (const value of [null, [], { jsonrpc: '1.0', id: 1, result: {} }, { jsonrpc: '2.0', id: '1', result: {} }, { jsonrpc: '2.0', id: 2, result: {} }, { jsonrpc: '2.0', id: 1 }, { jsonrpc: '2.0', id: 1, result: {}, error: null }, { jsonrpc: '2.0', id: 1, error: { code: '-32001', message: 'bad code' } }]) {
    assert.throws(() => rpcEnvelope(value), RpcProtocolError);
  }
});
