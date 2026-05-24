// Thin wrapper around the PsyTokenContract defined in contract/src/main.psy.
// Each method here produces a ContractCallArgs ready for window.psy.sendTransaction.

import type { ContractCallArgs } from '@psy-protocol/psy-sdk'
import { getContractId } from '../config'

function requireContractId(): bigint {
  const id = getContractId()
  if (id === null) throw new Error('Contract id not configured')
  return id
}

const felt = (v: bigint | number | string): bigint => BigInt(v)

export const token = {
  mint(amount: bigint | number): ContractCallArgs {
    return {
      contract_id: requireContractId(),
      method_name: 'mint',
      inputs: [felt(amount)],
    }
  },

  burn(amount: bigint | number): ContractCallArgs {
    return {
      contract_id: requireContractId(),
      method_name: 'burn',
      inputs: [felt(amount)],
    }
  },

  transfer(recipient: bigint | number | string, amount: bigint | number): ContractCallArgs {
    return {
      contract_id: requireContractId(),
      method_name: 'transfer',
      inputs: [felt(recipient), felt(amount)],
    }
  },

  claim(sender: bigint | number | string): ContractCallArgs {
    return {
      contract_id: requireContractId(),
      method_name: 'claim',
      inputs: [felt(sender)],
    }
  },

  batchTransfer(
    recipients: Array<bigint | number | string>,
    amounts: Array<bigint | number>,
  ): ContractCallArgs {
    if (recipients.length !== amounts.length) {
      throw new Error('recipients and amounts must have the same length')
    }
    if (recipients.length !== 2 && recipients.length !== 5) {
      throw new Error('batchTransfer only supports 2 or 5 recipients (matches the contract)')
    }
    return {
      contract_id: requireContractId(),
      method_name: `batch_transfer_${recipients.length}`,
      inputs: [...recipients.map(felt), ...amounts.map(felt)],
    }
  },
}
