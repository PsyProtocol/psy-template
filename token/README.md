# PSY-20 Standard Token Template

Production-ready PSY-20 fungible token smart contract for Psy Protocol.

## Architecture

This contract implements the **PSY-20** standard tailored for Psy's ZK-native, user-partitioned state architecture:

1. **Authority Model**:
   - `mint`: Mints tokens to the authorized authority.
   - `set_mint_authority`: Transfers minting authority to a new user.
   - `renounce_mint_authority`: Permanently locks supply and disables further minting (fixed-supply / meme / governance tokens).
2. **Outbox / Claim Transfer Pattern**:
   - `transfer`: Deducts caller balance and credits recipient's outbox slot.
   - `claim`: Pulls pending inbound tokens into caller balance.
   - `batch_transfer_2` / `batch_transfer_5`: High-performance batched transfers.
   - `burn`: Burns caller tokens.
3. **Sandboxed Delegation Channels**:
   - `open_delegation_channel`: Allocates a sandboxed spending budget to an AI Agent or automated spender.
   - `spend_delegation`: Allows the authorized spender to spend from the allocated budget to a recipient without accessing the owner's primary balance.
   - `revoke_delegation_channel`: Reclaims unspent funds back to caller balance at any time.
   - Strictly isolates balance reservation into dedicated channel slots.
4. **Shielded Private Transfer**:
   - `private_transfer`: Shields transparent tokens into a Poseidon note commitment and inserts it into a 20-level Incremental Merkle Tree (IMT).
   - Enables confidential payments claimable via zero-knowledge membership proofs and nullifiers without exposing on-chain transfer graphs.

## Build & Deploy

```sh
# Compile contract and generate ABI
psyup build

# Deploy to active network
psyup deploy
```

Generated outputs:
- `target/token.json` — Compiled ZK circuit artifact
- `target/token.abi.json` — Application Binary Interface for SDK / wallets
