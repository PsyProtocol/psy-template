import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareMcpTransaction, executeMcpTransaction} from '../../scripts/mcp_confirmed_client.mjs';

test('preparation submits only a prepare request; execution is a separate owner action', async () => {
  const calls = [];
  const client = {callTool: async request => {
    calls.push(request);
    return {content: [{type: 'text', text: JSON.stringify({status: 'prepared', submitted: false, confirmation_token: 'synthetic-ticket'})}]};
  }};
  const args = {session: 'synthetic-session', to_user_id: 591872, amount: 100};
  await prepareMcpTransaction(client, 'transfer', args);
  assert.deepEqual(calls, [{name: 'prepare_transfer', arguments: args}]);
  await executeMcpTransaction(client, {tool: 'transfer', confirmationToken: 'synthetic-ticket', ownerToken: 'synthetic-owner'});
  assert.deepEqual(calls[1], {name: 'execute_transfer', arguments: {
    confirmation_token: 'synthetic-ticket', owner_token: 'synthetic-owner',
  }});
});

test('genesis generic payments and changed execution parameters never reach transport', async () => {
  const client = {callTool: async () => {throw new Error('transport must not be called');}};
  for (const contract_id of [0, 4]) {
    await assert.rejects(prepareMcpTransaction(client, 'call_contract', {contract_id}), /recipient policy/);
  }
  await assert.rejects(executeMcpTransaction(client, {tool: 'transfer', confirmationToken: 'ticket', ownerToken: 'owner', amount: 999}), /only operation/);
  for (const confirmation of [
    {tool: 'transfer', confirmationToken: 'ticket'},
    {tool: 'transfer', ownerToken: 'owner'},
    {tool: 'transfer', confirmationToken: 'ticket', ownerToken: ' '},
    {tool: 'execute_transfer', confirmationToken: 'ticket', ownerToken: 'owner'},
  ]) await assert.rejects(executeMcpTransaction(client, confirmation));
});

test('failed preparation stays failed and never falls back to a raw transaction', async () => {
  const calls = [];
  const client = {callTool: async request => {calls.push(request); throw new Error('prepare unavailable');}};
  await assert.rejects(prepareMcpTransaction(client, 'claim_batch', {session: 'synthetic', transfers: []}), /prepare unavailable/);
  assert.deepEqual(calls.map(call => call.name), ['prepare_claim_batch']);
});

test('read tools and prefixed transaction names cannot be used as transaction operations', async () => {
  const client = {callTool: async () => {throw new Error('transport must not be called');}};
  for (const tool of ['get_balance', 'prepare_transfer', 'execute_transfer', 'unknown']) {
    await assert.rejects(prepareMcpTransaction(client, tool, {}), /supported transaction/);
  }
});
