# PSY-20 Standard Token Template

Production-ready PSY-20 fungible token smart contract for Psy Protocol.

## Architecture & Features

This contract implements the **PSY-20** standard tailored for Psy's ZK-native, user-partitioned state architecture:

1. **Authority & Metadata Model**:
   - `set_metadata(symbol, decimals)`: Sets the token symbol (up to 7 ASCII characters packed into a Felt) and decimal precision (e.g. 9 or 18).
   - `mint(amount)`: Mints tokens to the authorized authority and automatically updates `total_minted` in the authority's partition.
   - `set_mint_authority(new_authority)`: Transfers minting authority to a new user.
   - `renounce_mint_authority()`: Permanently locks supply and disables further minting (fixed-supply / meme / governance tokens).
2. **Outbox / Claim Transfer Pattern**:
   - `transfer(recipient, amount)`: Deducts caller balance and credits recipient's outbox slot.
   - `claim(sender)`: Pulls pending inbound tokens from sender's outbox into caller balance.
   - `batch_transfer_2(recipients, amounts)` / `batch_transfer_5(recipients, amounts)`: High-performance batched transfers.
   - `burn(amount)`: Burns caller tokens.
3. **Sandboxed Delegation Channels**:
   - `open_delegation_channel(channel_idx, spender, amount)`: Allocates a sandboxed spending budget (channels 0..15) to an AI Agent or automated spender.
   - `spend_delegation(channel_idx, amount, recipient)`: Allows the authorized spender to spend from the allocated budget to a recipient without accessing the owner's primary balance.
   - `revoke_delegation_channel(channel_idx)`: Reclaims unspent funds back to caller balance at any time.
   - Strictly isolates balance reservation into dedicated channel slots.
4. **Shielded Private Transfer**:
   - `private_transfer(receiver, value, note_secret_hash)`: Shields transparent tokens into a Poseidon note commitment and inserts it into a 20-level Incremental Merkle Tree (IMT).
   - Enables confidential payments claimable via zero-knowledge membership proofs and nullifiers without exposing on-chain transfer graphs.

---

## Step-by-Step Operational Guide

### 1. Build and Deploy

```sh
# Compile contract and generate ABI
psyup build

# Deploy to active network
psyup deploy
```

Generated build outputs:
- `target/token.json` — Compiled ZK circuit artifact
- `target/token.abi.json` — Application Binary Interface for SDK / wallets

---

### 2. Standard Operations Walkthrough

#### Scenario A: Initialize Metadata & Minting
```ts
// 1. Configure token symbol and precision (Authority User)
await window.psy.sendTransaction(account, token.setMetadata("PSY", 9n));

// 2. Mint initial tokens (updates balance and total_minted)
await window.psy.sendTransaction(account, token.mint(1_000_000n));

// 3. (Optional) Renounce Mint Authority to fix maximum supply forever
await window.psy.sendTransaction(account, token.renounceMintAuthority());
```

#### Scenario B: Outbox Transfer & Recipient Claim
Psy utilizes a state-partitioned asynchronous transfer model to eliminate global state contention:
```ts
// 1. Alice (User 100) transfers 500 tokens to Bob (User 200)
// This debits Alice's balance and records 500 in Alice's outbox for Bob
await window.psy.sendTransaction(aliceAccount, token.transfer(200n, 500n));

// 2. Bob (User 200) claims the pending tokens from Alice (User 100)
// This pulls the 500 tokens into Bob's liquid balance
await window.psy.sendTransaction(bobAccount, token.claim(100n));
```

#### Scenario C: AI Agent / Bot Delegation Channel
Delegate an exact spending budget to an automated agent with guaranteed isolation:
```ts
// 1. Alice opens channel 0 for Agent (User 888) with an allowance of 300 tokens
// 300 tokens are reserved into channel 0; Alice's remaining balance is protected
await window.psy.sendTransaction(aliceAccount, token.openDelegationChannel(0, 888n, 300n));

// 2. Agent (User 888) spends 100 tokens from channel 0 to Merchant (User 999)
// The 100 tokens route to Merchant's outbox; 200 tokens remain in channel 0
await window.psy.sendTransaction(agentAccount, token.spendDelegation(0, 100n, 999n));

// 3. Alice can revoke the channel at any time to recover unspent funds
// Remaining 200 tokens are immediately refunded back to Alice's balance
await window.psy.sendTransaction(aliceAccount, token.revokeDelegationChannel(0));
```

#### Scenario D: Shielded Private Transfer
Shield transparent tokens into an on-chain Poseidon commitment tree:
```ts
// Receiver Hash: 4 Felt elements [h0, h1, h2, h3]
// Note Secret Hash: 4 Felt elements [s0, s1, s2, s3]
const receiverHash = [1234n, 5678n, 9012n, 3456n];
const noteSecretHash = [9999n, 8888n, 7777n, 6666n];

// Transfers 250 tokens into an on-chain shielded note commitment
await window.psy.sendTransaction(
  account,
  token.privateTransfer(receiverHash, 250n, noteSecretHash)
);
```

#### Scenario E: Reading Token Metadata & Total Supply via RPC
In Psy Protocol's state-partitioned architecture, reading contract state is performed directly via **Edge RPC Storage Slot queries** without executing virtual machines or incurring gas:

| Field | Slot Index | Description |
| :--- | :---: | :--- |
| `balance` | `0` | Caller / user liquid balance |
| `mint_authority` | `1` | Authority User ID authorized to mint |
| `is_mint_renounced` | `2` | Flag indicating whether minting is permanently disabled (`1`) or active (`0`) |
| `total_minted` | `3` | Cumulative tokens minted by the authority |
| `decimals` | `4` | Token decimal precision (e.g. `9`) |
| `symbol` | `5` | Short ASCII symbol packed into Felt (decode with `decodeSymbol`) |

```ts
import { decodeSymbol, readSlotValue, TOKEN_STORAGE_SLOTS } from './lib/token';

// 1. Read cumulative total minted supply (Slot 3 of the mint authority):
const totalMintedHex = await realmRpcProvider
  .getRpcProviderByUserId(authorityUserId)
  .getUserContractStateTreeLeafHash(checkpointId, authorityUserId, contractId, TOKEN_STORAGE_SLOTS.TOTAL_MINTED);
const totalMinted = readSlotValue(totalMintedHex);

// 2. Read token decimal precision (Slot 4):
const decimalsHex = await realmRpcProvider
  .getRpcProviderByUserId(authorityUserId)
  .getUserContractStateTreeLeafHash(checkpointId, authorityUserId, contractId, TOKEN_STORAGE_SLOTS.DECIMALS);
const decimals = Number(readSlotValue(decimalsHex));

// 3. Read token symbol (Slot 5):
const symbolHex = await realmRpcProvider
  .getRpcProviderByUserId(authorityUserId)
  .getUserContractStateTreeLeafHash(checkpointId, authorityUserId, contractId, TOKEN_STORAGE_SLOTS.SYMBOL);
const symbol = decodeSymbol(readSlotValue(symbolHex)); // e.g. "PSY"
```

---

## Testing & Verification

Run native ZK circuit witness generation and proving assertions:

```sh
# Run native unit test suite
dargo test --file tests/token_unit_test.psy
```
