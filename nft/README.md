# PSY-721 Standard NFT Template

Production-ready PSY-721 non-fungible token smart contract for Psy Protocol.

## Architecture & Features

This contract implements the **PSY-721** standard tailored for Psy's ZK-native, user-partitioned state architecture:

1. **Unique Token Ownership & Metadata**:
   - Each user maintains an indexed array of owned token slots (`owned_tokens: [NFTSlot; 128]`).
   - Every slot stores `token_id`, `is_active`, and a 32-byte `metadata_hash: Hash` pointing directly to decentralized storage (e.g. IPFS / Arweave CID).
2. **Collection-Level Metadata & Authority**:
   - `set_collection_metadata(symbol, base_uri_hash)`: Configures collection symbol and root IPFS folder hash.
   - `mint(slot_idx, token_id, metadata_hash)`: Mints a unique token with metadata hash into an available slot, updating `total_minted`.
   - `set_mint_authority(new_authority)`: Transfers minting authority.
   - `renounce_mint_authority()`: Permanently locks collection supply.
3. **Outbox Transfer & Claim Flow**:
   - `transfer(slot_idx, recipient)`: Frees the sender's local slot and logs the outbound token and its `metadata_hash` into the recipient's outbox.
   - `claim(slot_idx, sender)`: Recipient claims the inbound NFT from sender into their destination slot with complete metadata retention.

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

#### Scenario A: Configure Collection Metadata & Minting
```ts
// 1. Set Collection Symbol & IPFS Base Folder Hash
const baseUriHash = [10n, 20n, 30n, 40n]; // 32-byte IPFS root folder hash
await window.psy.sendTransaction(account, {
  contract_id: nftContractId,
  method_name: 'set_collection_metadata',
  inputs: [5264217n, ...baseUriHash],
});

// 2. Mint token #101 into slot 0 with its content metadata hash
const tokenMetadataHash = [1n, 2n, 3n, 4n]; // 32-byte IPFS JSON CID
await window.psy.sendTransaction(account, {
  contract_id: nftContractId,
  method_name: 'mint',
  inputs: [0n, 101n, ...tokenMetadataHash],
});
```

#### Scenario B: Resolving What the NFT Is (Token URI & Metadata)
Wallets, marketplaces, and explorer frontends resolve the NFT's media and attributes using either **Token-Level Metadata Hash** or **Collection Base URI**:

```ts
// How client applications resolve the NFT's display attributes:
// Pattern 1: Token has dedicated metadata_hash -> fetch directly from IPFS:
// https://ipfs.io/ipfs/<converted_cid>

// Pattern 2: Collection has base_uri_hash -> resolve by token_id:
// https://ipfs.io/ipfs/<base_cid>/101.json

// Standard JSON returned from IPFS:
// {
//   "name": "Psy Genesis Cyberpunk #101",
//   "description": "Native ZK digital asset on Psy Protocol",
//   "image": "ipfs://bafybeig.../101.png",
//   "attributes": [
//     { "trait_type": "Faction", "value": "Cypherpunk" },
//     { "trait_type": "Generation", "value": 1 }
//   ]
// }
```

#### Scenario C: Outbox Transfer & Recipient Claim
```ts
// 1. Alice (User 100) transfers token in slot 0 to Bob (User 200)
// Alice's slot 0 is cleared; token_id and metadata_hash are queued in outbox for Bob
await window.psy.sendTransaction(aliceAccount, {
  contract_id: nftContractId,
  method_name: 'transfer',
  inputs: [0n, 200n],
});

// 2. Bob (User 200) claims the pending token from Alice into his own slot 0
// Bob receives both token_id and the immutable metadata_hash
await window.psy.sendTransaction(bobAccount, {
  contract_id: nftContractId,
  method_name: 'claim',
  inputs: [0n, 100n],
});
```

#### Scenario D: Renounce Mint Authority
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
