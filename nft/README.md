# PSY-721 Standard NFT Template

PSY-721 non-fungible token smart contract template for Psy Protocol.

## Architecture & Features

This contract implements the **PSY-721** standard tailored for Psy's ZK-native, user-partitioned state architecture:

1. **Unique Token Ownership & Metadata**:
   - Each user maintains an indexed array of owned token slots (`owned_tokens: [NFTSlot; 128]`).
   - Every slot stores a four-Felt `token_id: Hash`, `is_active`, and a four-Felt `metadata_hash: Hash` pointing to decentralized storage (e.g. IPFS CID).

2. **Computational Namespace Uniqueness**:
   - In a partitioned state tree without shared global tables, token identity is defined via:
     $$\text{token\_id} = \text{Poseidon}(\text{creator}, \text{local\_id})$$
   - Under fixed encoding, unique creator, and cryptographic hash collision-resistance assumptions, this provides computational namespace uniqueness.

3. **FIFO 4-Slot Ring Buffer Outbox & Explicit ACK Protocol**:
   - **Sender Partition**: Outbox maintains a 4-slot circular buffer (`ContractStateArray<16777216, NFTOutbox>`) carrying `token_id_0..3`, `metadata_hash_0..3`, `nonce_sent`, `nonce_claimed`, and `nonce_acked`.
   - **Circular Placement**: Transfers map to slot `nonce_sent & 3`.
   - **Capacity & ACK Protection**:
     - Enforces max 4 in-flight transfers: `in_flight = nonce_sent - nonce_acked < 4`.
     - The sender calls `acknowledge(recipient)` after the recipient claims. This reads the recipient's `nonce_claimed` and advances the sender's separate `nonce_acked`.
     - Attempting a 5th uncollected transfer triggers immediate assertion failure (`FIFO outbox queue full: recipient has 4 uncollected transfers`).
   - **Recipient Partition (Claim & ACK)**:
     - Recipient asserts `sender_outbox.nonce_sent > my_outbox.nonce_claimed` upon claiming.
     - Claims in strict FIFO sequence at `my_outbox.nonce_claimed & 3` and increment the inbound `nonce_claimed`. Separate inbound and outbound counters allow two users to transfer NFTs in both directions.
   - **Array Bounds Checks**: All transfers and claims strictly assert `recipient < 16777216` and `sender < 16777216`.

**ABI migration:** The staging v3 source is `src/main.psy.rs`. Its storage layout and method ABI differ from the legacy `src/main.psy`; an existing deployment cannot be upgraded in place. Wallets and indexers must read all four limbs of each token ID. The legacy source remains solely for the older `dargo test` harness and is not the staging deployment target.

---

## Step-by-Step Operational Guide

### 1. Configure, Build, and Deploy

```sh
# Install the staging-compatible CLI (the legacy dargo unit tests still use 0.1.0)
psyup install 0.1.1
export PSY_USER_CLI="$HOME/.psy/toolchains/psy-0.1.1/bin/psy_user_cli"

# 1. Configure your canonical on-chain user ID as ISSUER_USER_ID (Mandatory)
npm run configure -- --issuer <YOUR_USER_ID>

# 2. Strict preflight verification (verifies explicit configuration record via .issuer_configured)
npm run check:preflight

# 3. Verify the selected wallet's issuer user ID on this network
npm run check:deployer

# 4. Build and deploy with the same wallet and network configuration
npm run deploy:checked
```

> [!NOTE]
> **Staging toolchain:** Install Psy toolchain 0.1.1 and set `PSY_USER_CLI` to its `psy_user_cli` binary (typically `$HOME/.psy/toolchains/psy-0.1.1/bin/psy_user_cli`). Its compiler produced a byte-identical v3 artifact to the CLI used for the staging test. `npm run build` compiles `src/main.psy.rs`; `npm run deploy:checked` checks the selected wallet and uses `deploy-contract --is-deploy`. The checked script records the transaction hash and contract ID in `.psy-deploy-v3.json`. Direct `psyup deploy` still uses the legacy source; the IDE's v3 deployment workflow has not been verified.

> [!NOTE]
> **Deployment credentials:** Set exactly one of `PRIVATE_KEY` or `KEYSTORE_PATH` (plus `WALLET_PASSWORD` for a keystore), and point `RPC_CONFIG` at the intended network. The checked command queries the selected wallet's first registered user ID and rejects an issuer mismatch. The v3 compiler does not expose a deployer-public-key intrinsic, so the contract enforces the canonical `ISSUER_USER_ID` on chain.

Generated build outputs:
- `target/v3/compilation_artifact.json` — staging deployment artifact
- `target/v3/abi.json` — Application Binary Interface for SDK / wallets

---

### 2. Standard Operations Walkthrough

#### Scenario A: Configure Collection Metadata & Minting
```ts
// 1. Deployer (in canonical ISSUER_USER_ID partition) sets Collection Symbol & Base Metadata Hash
// Bound on chain by ctx.user_id == ISSUER_USER_ID.
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
> `set_collection_metadata` initializes mint authority in the canonical `ISSUER_USER_ID` partition. Version 3 has no `set_mint_authority` API; authority cannot be transferred to another partition. Use `renounce_mint_authority()` to revoke minting permanently.

#### Scenario B: Outbox Transfer, Recipient Claim, and ACK
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

// 3. Alice acknowledges Bob's claim to free one position in the four-slot window.
await window.psy.sendTransaction(aliceAccount, {
  contract_id: nftContractId,
  method_name: 'acknowledge',
  inputs: [200n],
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

The native test runner compiles `src/main.psy.rs`, then composes legacy `src/main.psy` with its single-user cases. The live multi-user staging evidence is recorded in `tests/live/STAGING_REPORT_2026-09-23.md`; the legacy assertions alone do not validate v3 behavior:

```sh
# Run native unit test suite
npm test
npm run build
```
