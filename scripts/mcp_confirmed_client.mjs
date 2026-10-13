import {assertMcpPaymentTool} from './mcp_payment_guard.mjs';

// Same transaction classification as psy_mcp_server. Keep preparation and
// execution separate so the caller can present the server's summary to the
// owner before supplying the confirmation credential. There is no raw fallback.
export const MCP_TRANSACTION_TOOLS = Object.freeze([
  'create_wallet', 'mint_agent_account', 'psyup_deploy', 'call_contract',
  'transfer', 'transfer_batch', 'claim_all', 'deposit', 'retry_deposit_delivery',
  'claim_deposit', 'private_claim', 'claim_batch', 'withdraw', 'claim_faucet',
  'private_transfer', 'x402_fetch',
]);

function transactionName(tool) {
  if (!MCP_TRANSACTION_TOOLS.includes(tool)) {
    throw new Error('Expected a supported transaction operation without prepare_/execute_ prefix');
  }
  return tool;
}

export async function prepareMcpTransaction(client, tool, args) {
  transactionName(tool);
  assertMcpPaymentTool(tool, args);
  return client.callTool({name: `prepare_${tool}`, arguments: args});
}

export async function executeMcpTransaction(client, confirmation) {
  const keys = Object.keys(confirmation);
  if (keys.some(key => !['tool', 'confirmationToken', 'ownerToken'].includes(key))) {
    throw new Error('Execution accepts only operation, confirmation ticket and owner credential');
  }
  const {tool, confirmationToken, ownerToken} = confirmation;
  transactionName(tool);
  if (typeof confirmationToken !== 'string' || !confirmationToken.trim() ||
      typeof ownerToken !== 'string' || !ownerToken.trim()) {
    throw new Error('A confirmation ticket and explicit owner credential are required');
  }
  return client.callTool({name: `execute_${tool}`, arguments: {
    confirmation_token: confirmationToken, owner_token: ownerToken,
  }});
}
