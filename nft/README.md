# PSY-721 Standard NFT Template

Production-ready PSY-721 non-fungible token smart contract for Psy Protocol.

## Architecture

This contract implements the **PSY-721** standard tailored for Psy's ZK-native, user-partitioned state architecture:

1. **Unique Token Ownership**:
   - Each user maintains an indexed array of owned token slots (`owned_tokens: [NFTSlot; 128]`).
   - Every slot stores the `token_id` and active presence.
2. **Authority Control**:
   - `mint(slot_idx, token_id)`: Mints a unique token to an available user slot.
   - `set_mint_authority`: Transfers minting authority.
   - `renounce_mint_authority`: Permanently locks collection supply.
3. **Outbox Transfer & Claim Flow**:
   - `transfer(slot_idx, recipient)`: Frees the sender's local slot and logs the outbound token into the recipient's outbox.
   - `claim(slot_idx, sender)`: Recipient claims the inbound NFT from sender into their destination slot.

## Build & Deploy

```sh
# Compile contract and generate ABI
psyup build

# Deploy to active network
psyup deploy
```

Generated outputs:
- `target/nft.json` — Compiled ZK circuit artifact
- `target/nft.abi.json` — Application Binary Interface for SDK / wallets
