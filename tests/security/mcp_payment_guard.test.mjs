import assert from 'node:assert/strict';
import test from 'node:test';
import {assertMcpPaymentTool} from '../../scripts/mcp_payment_guard.mjs';

test('ordinary MCP client refuses generic genesis-token calls before spending', () => {
  for (const contract_id of [0, 4]) {
    assert.throws(() => assertMcpPaymentTool('call_contract', {
      contract_id, method_name: 'simple_transfer', inputs: [591872, 1_000_100_000],
    }), /recipient policy/);
  }
  assert.doesNotThrow(() => assertMcpPaymentTool('transfer', {to_user_id: 591872, amount: 1_000_100_000}));
  assert.doesNotThrow(() => assertMcpPaymentTool('claim_batch', {transfers: []}));
  assert.doesNotThrow(() => assertMcpPaymentTool('call_contract', {contract_id: 1758, method_name: 'open_swap'}));
});
