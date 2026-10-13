// Ordinary-wallet test clients must use the MCP token tools that enforce
// recipient and amount policy. Public SD-key UPS drivers are a separate path.
export function assertMcpPaymentTool(tool, args) {
  const operation = tool.startsWith('prepare_') ? tool.slice('prepare_'.length) : tool;
  if (operation === 'call_contract' && [0, 4].includes(args.contract_id)) {
    throw new Error('Use MCP transfer or claim_batch for genesis token payments; generic call_contract does not enforce the installed wallet recipient policy reliably.');
  }
}
