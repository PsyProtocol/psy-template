# PSY-721 Standard NFT Template

PSY-721 non-fungible token smart contract template for Psy Protocol.

## Architecture & Features

This contract implements the **PSY-721** standard tailored for Psy's ZK-native, user-partitioned state architecture:

1. **Unique Token Ownership & Metadata**:
   - Each user maintains an indexed array of owned token slots (`owned_tokens: [NFTSlot; 128]`).
   - Every slot stores `token_id`, `is_active`, and a 32-byte `metadata_hash: Hash` pointing to decentralized storage (e.g. IPFS CID).

2. **Computational Namespace Uniqueness**:
   - In a partitioned state tree without shared global tables, token identity is defined via:
     $$\text{token\_id} = \text{Poseidon}(\text{creator}, \text{local\_id})$$
   - Under fixed encoding, unique creator, and cryptographic hash collision-resistance assumptions, this provides computational namespace uniqueness.

3. **FIFO 4-Slot Ring Buffer Outbox & Explicit ACK Protocol**:
   - **Sender Partition**: Outbox maintains a 4-slot circular buffer (`[NFTOutbox; 16777216]`) carrying `token_id_0..3`, `metadata_hash_0..3`, `nonce_sent`, and `nonce_claimed`.
   - **Circular Placement**: Transfers map to slot `nonce_sent & 3`.
   - **Capacity & ACK Protection**:
     - Enforces max 4 in-flight transfers: `in_flight = (nonce_sent - acknowledged_claimed) < 4`.
     - If local in-flight reaches 4, contract reads recipient's partition (`recipient_outbox.nonce_claimed`) to acknowledge claimed tokens.
     - Attempting a 5th uncollected transfer triggers immediate assertion failure (`FIFO outbox queue full: recipient has 4 uncollected transfers`).
   - **Recipient Partition (Claim & ACK)**:
     - Recipient asserts `sender_outbox.nonce_sent > my_outbox.nonce_claimed` upon claiming.
     - Claims in strict FIFO sequence at `my_outbox.nonce_claimed & 3` and increments `nonce_claimed`, serving as an on-chain acknowledgement.
   - **Array Bounds Checks**: All transfers and claims strictly assert `recipient < 16777216` and `sender < 16777216`.

---

## Step-by-Step Operational Guide

### 1. Configure, Build, and Deploy

```sh
# 1. Configure your canonical on-chain user ID as ISSUER_USER_ID (Mandatory)
npm run configure -- --issuer <YOUR_USER_ID>

# 2. Strict preflight verification (verifies explicit configuration record via .issuer_configured)
npm run check:preflight

# 3. Compile contract with preflight check
npm run build:deploy

# 4. Deploy to active network
psyup deploy
```

> [!NOTE]
> **Toolchain Boundary**: `npm run check:preflight` and `npm run build:deploy` provide application-layer preflight verification. Running `psyup deploy` directly in terminal bypasses npm scripts. Mandatory deployment verification is not yet closed under the current toolchain.

Generated build outputs:
- `target/nft.json` — Compiled ZK circuit artifact
- `target/nft.abi.json` — Application Binary Interface for SDK / wallets

---

### 2. Standard Operations Walkthrough

#### Scenario A: Configure Collection Metadata & Minting (Dual-Constraint Single-Source)
```ts
// 1. Deployer (in canonical ISSUER_USER_ID partition) sets Collection Symbol & Base Metadata Hash
// Bound by dual constraint: get_user_id() == ISSUER_USER_ID && assert_caller_is_deployer()
// Automatically initializes mint_authority to caller if uninitialized.
const baseUriHash = [10n, 20n, 30n, 40n];
await window.psy.sendTransaction(deployerAccount, {
  contract_id: nftContractId,
  method_name: 'set_collection_metadata',
  inputs: [5264217n, ...baseUriHash],
});

// 2. Mint first token (local_id = 1n) into slot 0 with its content metadata hash in the deployer partition
// Strictly sequential: local_id must equal total_minted + 1 (1n for first mint, 2n for second, etc.)
const tokenMetadataHash = [1n, 2n, 3n, 4n];
await window.psy.sendTransaction(deployerAccount, {
  contract_id: nftContractId,
  method_name: 'mint',
  inputs: [0n, 1n, ...tokenMetadataHash],
});
```

> [!NOTE]
> **Single-Source Authority Restriction**:
> `set_mint_authority(new_authority)` enforces `assert(new_authority == caller)`. In Psy Protocol's partitioned state model, minting is structurally tied to the canonical `ISSUER_USER_ID` partition. Delegating authority to another partition would create an un-mintable deadlock because non-issuer partitions cannot satisfy the partition constraint in `mint()`. Authority revocation is handled exclusively via `renounce_mint_authority()`.

#### Scenario B: Outbox Transfer & Recipient Claim with ACK
```ts
// 1. Alice (User 100) transfers token in slot 0 to Bob (User 200)
// Alice's slot 0 is cleared; token_id and metadata_hash are queued in outbox for Bob
await window.psy.sendTransaction(aliceAccount, {
  contract_id: nftContractId,
  method_name: 'transfer',
  inputs: [0n, 200n],
});

// 2. Bob (User 200) claims the pending token from Alice into his own slot 0
// Bob records the claimed nonce in his inbox, acknowledging the transfer
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
