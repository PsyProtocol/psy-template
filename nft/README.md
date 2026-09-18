# PSY-721 Standard NFT Template

Production-ready PSY-721 non-fungible token smart contract for Psy Protocol.

## Architecture & Features

This contract implements the **PSY-721** standard tailored for Psy's ZK-native, user-partitioned state architecture:

1. **Unique Token Ownership**:
   - Each user maintains an indexed array of owned token slots (`owned_tokens: [NFTSlot; 128]`).
   - Every slot stores the `token_id` and active presence.
2. **Authority Control**:
   - `mint(slot_idx, token_id)`: Mints a unique token to an available user slot.
   - `set_mint_authority(new_authority)`: Transfers minting authority.
   - `renounce_mint_authority()`: Permanently locks collection supply.
3. **Outbox Transfer & Claim Flow**:
   - `transfer(slot_idx, recipient)`: Frees the sender's local slot and logs the outbound token into the recipient's outbox.
   - `claim(slot_idx, sender)`: Recipient claims the inbound NFT from sender into their destination slot.

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
- `target/nft.json` — Compiled ZK circuit artifact
- `target/nft.abi.json` — Application Binary Interface for SDK / wallets

---

### 2. Standard Operations Walkthrough

#### Scenario A: Minting Unique Tokens
```ts
// Mint token #101 into slot 0 of the collection authority
await window.psy.sendTransaction(account, {
  contract_id: nftContractId,
  method_name: 'mint',
  inputs: [0n, 101n],
});
```

#### Scenario B: Outbox Transfer & Recipient Claim
```ts
// 1. Alice (User 100) transfers token in slot 0 to Bob (User 200)
// Alice's slot 0 is cleared; outbound transfer is registered for Bob
await window.psy.sendTransaction(aliceAccount, {
  contract_id: nftContractId,
  method_name: 'transfer',
  inputs: [0n, 200n],
});

// 2. Bob (User 200) claims the pending token from Alice into his own slot 0
await window.psy.sendTransaction(bobAccount, {
  contract_id: nftContractId,
  method_name: 'claim',
  inputs: [0n, 100n],
});
```

#### Scenario C: Renounce Mint Authority
```ts
// Permanently cap collection supply
await window.psy.sendTransaction(account, {
  contract_id: nftContractId,
  method_name: 'renounce_mint_authority',
  inputs: [],
});
```

---

## Testing & Verification

Run native ZK circuit witness generation and proving assertions:

```sh
# Run native unit test suite
dargo test --file tests/nft_unit_test.psy
```
