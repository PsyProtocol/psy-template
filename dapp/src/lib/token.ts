// Production wrapper around the PsyTokenContract defined in contract/src/main.psy.
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

  openDelegationChannel(
    channelIdx: number | bigint,
    spender: bigint | number | string,
    amount: bigint | number,
  ): ContractCallArgs {
    return {
      contract_id: requireContractId(),
      method_name: 'open_delegation_channel',
      inputs: [felt(channelIdx), felt(spender), felt(amount)],
    }
  },

  spendDelegation(
    owner: bigint | number | string,
    channelIdx: number | bigint,
    amount: bigint | number,
    recipient: bigint | number | string,
  ): ContractCallArgs {
    return {
      contract_id: requireContractId(),
      method_name: 'spend_delegation',
      inputs: [felt(owner), felt(channelIdx), felt(amount), felt(recipient)],
    }
  },

  requestRevokeDelegation(channelIdx: number | bigint): ContractCallArgs {
    return {
      contract_id: requireContractId(),
      method_name: 'request_revoke_delegation',
      inputs: [felt(channelIdx)],
    }
  },

  finalizeRevokeDelegation(
    channelIdx: number | bigint,
    spender: bigint | number | string,
  ): ContractCallArgs {
    return {
      contract_id: requireContractId(),
      method_name: 'finalize_revoke_delegation',
      inputs: [felt(channelIdx), felt(spender)],
    }
  },

  setMetadata(symbol: string | bigint | number, decimals: bigint | number): ContractCallArgs {
    const symbolFelt = typeof symbol === 'string' ? encodeSymbol(symbol) : felt(symbol);
    return {
      contract_id: requireContractId(),
      method_name: 'set_metadata',
      inputs: [symbolFelt, felt(decimals)],
    }
  },

  setMintAuthority(newAuthority: bigint | number | string): ContractCallArgs {
    return {
      contract_id: requireContractId(),
      method_name: 'set_mint_authority',
      inputs: [felt(newAuthority)],
    }
  },

  renounceMintAuthority(): ContractCallArgs {
    return {
      contract_id: requireContractId(),
      method_name: 'renounce_mint_authority',
      inputs: [],
    }
  },

  privateTransfer(
    receiver: Array<bigint | number | string>,
    value: bigint | number,
    noteSecretHash: Array<bigint | number | string>,
  ): ContractCallArgs {
    if (receiver.length !== 4 || noteSecretHash.length !== 4) {
      throw new Error('receiver and noteSecretHash must be 4-element Felt arrays (Hash)');
    }
    return {
      contract_id: requireContractId(),
      method_name: 'private_transfer',
      inputs: [...receiver.map(felt), felt(value), ...noteSecretHash.map(felt)],
    }
  },

  privateClaim(
    nullifierHash: Array<bigint | number | string>,
    receiver: Array<bigint | number | string>,
    amount: bigint | number,
    userTreeRoot: Array<bigint | number | string>,
    checkpointId: bigint | number,
    noteRootSlot: bigint | number,
    random0: bigint | number,
    random1: bigint | number,
    proofSiblings: Array<Array<bigint | number | string>>,
    proofIndex: bigint | number,
  ): ContractCallArgs {
    const flattenedSiblings = proofSiblings.flat().map(felt);
    return {
      contract_id: requireContractId(),
      method_name: 'private_claim',
      inputs: [
        ...nullifierHash.map(felt),
        ...receiver.map(felt),
        felt(amount),
        ...userTreeRoot.map(felt),
        felt(checkpointId),
        felt(noteRootSlot),
        felt(random0),
        felt(random1),
        ...flattenedSiblings,
        felt(proofIndex),
      ],
    }
  },
}

/**
 * Storage slot index offsets corresponding to PsyTokenContract struct fields.
 */
export const TOKEN_STORAGE_SLOTS = {
  BALANCE: 0,
  MINT_AUTHORITY: 1,
  IS_MINT_RENOUNCED: 2,
  TOTAL_MINTED: 3,
  DECIMALS: 4,
  SYMBOL: 5,
} as const;

/**
 * Encodes an ASCII symbol string (up to 7 characters) into a Felt.
 */
export function encodeSymbol(symbol: string): bigint {
  let val = 0n;
  const trimmed = symbol.trim().slice(0, 7);
  for (let i = 0; i < trimmed.length; i++) {
    val = (val << 8n) | BigInt(trimmed.charCodeAt(i));
  }
  return val;
}

/**
 * Decodes a Felt back into an ASCII symbol string.
 */
export function decodeSymbol(feltVal: bigint | number | string): string {
  let v = BigInt(feltVal);
  let chars = '';
  while (v > 0n) {
    const byte = Number(v & 0xffn);
    chars = String.fromCharCode(byte) + chars;
    v >>= 8n;
  }
  return chars;
}

/**
 * Unpacks a 64-bit Felt value from a 64-character hexadecimal leaf hash string.
 */
export function readSlotValue(leafHashHex: string | undefined, subSlotIndex = 0): bigint {
  if (!leafHashHex || leafHashHex.length !== 64) {
    return 0n;
  }
  const start = subSlotIndex * 16;
  const hexChunk = leafHashHex.substring(start, start + 16);
  return BigInt('0x' + hexChunk);
}

export interface TokenMetadata {
  authority: bigint;
  isMintRenounced: boolean;
  totalMinted: bigint;
  decimals: number;
  symbol: string;
}
