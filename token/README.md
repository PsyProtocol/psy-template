# PSY-20 Standard Token Template (V-Final)

High-determinism, formally verified PSY-20 fungible token smart contract template for Psy Protocol.

## Architecture & Features

This contract implements the **PSY-20** standard tailored for Psy's ZK-native, user-partitioned state architecture:

1. **User Partitioned State (14 Storage Fields)**:
   - `balance` (Offset 0): Liquid balance held directly in caller partition.
   - `last_claimed_pow_rewards_checkpoint_id` (Offset 1): Mining rewards tracking checkpoint.
   - `claimed_rewards` (Offset 2): Cumulative claimed mining rewards.
   - `other_user_info` (Offset 3..33554434): Push-pull Outbox mapping storing outbound transfers and inbound claimed records (`[OtherUserInfo; 16777216]`).
   - `note_count` (Offset 33554435): Total shielded commitments in the incremental Merkle tree.
   - `note_root` (Offset 33554436 / Leaf 8388609): 4-Felt Merkle tree root of private note commitments.
   - `last_path` (Offset 33554440..33554519): Frontier path for incremental Merkle tree updates (`[Hash; 20]`).
   - `mint_authority` (Offset 33554520): Mint authority address initialized and managed by the contract deployer.
   - `is_mint_renounced` (Offset 33554521): Permanent renunciation flag (1 if permanently renounced).
   - `total_minted` (Offset 33554522): Cumulative minted token counter (tracked exclusively in deployer partition).
   - `decimals` (Offset 33554523): Token precision (max 18).
   - `symbol` (Offset 33554524): Compact token symbol field element.
   - `delegations` (Offset 33554525..33554604): Owner-side delegation channel allocations and status (`[DelegationChannel; 16]`).
   - `state_map` (Offset 33554608..): Composite-key sparse map (Namespace 1 for Nullifiers; Namespace 2 for Spender-side local delegation spend ledgers).

2. **Core Methods (15 Methods)**:
   - **Dual-Constraint Deployer Authority & Metadata**: `set_metadata`, `set_mint_authority`, `renounce_mint_authority` (restricted strictly to contract deployer key and canonical `ISSUER_USER_ID` partition).
   - **Dual-Constraint Single-Source Issuance**: `mint`, `burn` with strict Goldilocks field upper-bound checks. `mint` is restricted simultaneously to the cryptographic deployer and the canonical `ISSUER_USER_ID` partition (`assert(get_user_id() == ISSUER_USER_ID)` and `assert_caller_is_deployer()`), preventing multi-partition issuance if a single key possesses multiple user IDs.
   - **Outbox Transfer & Claim (Phase 1 Safe Subset)**: `transfer`, `claim`, `batch_transfer_2`, `batch_transfer_5`.
   - **Dual-Ledger Delegation [EXPERIMENTAL - GATED ON-CHAIN]**:
     - `open_delegation_channel(channel_idx, spender, amount)`: Gated on-chain by `assert(!DELEGATION_GATED, ...)`. In default asset builds (`DELEGATION_GATED = true`), prevents locking new capital into channels to stop new risk exposure.
     - `spend_delegation(owner, channel_idx, amount, recipient)`: Spender verifies Owner channel, updates local `state_map` (Namespace 2) with composite key `hash([owner, channel_idx, version, 0])`, and routes to recipient Outbox.
     - `request_revoke_delegation(channel_idx)`: Owner initiates revocation with a 60-checkpoint cutoff window.
     - `finalize_revoke_delegation(channel_idx, spender)`: Owner finalizes after cutoff, refunds unspent balance, and closes channel.
     - *Note on Protocol Limitation & Drainage Boundary*: Reading Owner's channel across partitions allows historical OPEN proofs unless `psy-node` enforces linearizability / stale-read rejection. Leaving `spend` and `finalize_revoke` open does NOT guarantee safe drainage of existing channels against historical replays; safe drainage remains **pending protocol design and real-node verification**.
   - **Shielded Privacy**:
     - `private_transfer(receiver, value, note_secret_hash)`: Inserts note commitment into 20-level Merkle tree.
     - `private_claim(...)`: Verifies Merkle inclusion proof and nullifier uniqueness via `state_map` (Namespace 1).

3. **Strict Goldilocks Prime Field Arithmetic**:
   - Field modulus: $p = 2^{64} - 2^{32} + 1 = 18446744069414584321$.
   - Maximum safe value: `MAX_FELT = 18446744069414584320` ($p - 1$).
   - All balance updates verify `assert(amount <= MAX_FELT - balance)` to prevent modular wrap-around.

4. **Monotonic Outbox/Claim Pattern**:
   - Outbox cumulative totals (`amount_sent`, `amount_claimed`) are strictly monotonically non-decreasing.
   - Immune to stale-read double-spending: reading a historical Checkpoint only claims older amounts without over-issuing or double-crediting.

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
- `target/token.json` — Compiled ZK circuit artifact
- `target/token.abi.json` — Application Binary Interface for SDK / wallets

---

### 2. Standard Operations Walkthrough

#### Scenario A: Initialize Metadata & Mint Tokens (Single-Source Issuance)
```ts
// 1. Deployer sets metadata and appoints mint authority
await window.psy.sendTransaction(deployerAccount, token.setMetadata(5264217n, 9n));
await window.psy.sendTransaction(deployerAccount, token.setMintAuthority(deployerAccount.userId));

// 2. Deployer mints tokens in Deployer Partition, then distributes via Outbox transfer
await window.psy.sendTransaction(deployerAccount, token.mint(1_000_000n));
await window.psy.sendTransaction(deployerAccount, token.transfer(aliceAccount.userId, 1_000_000n));
await window.psy.sendTransaction(aliceAccount, token.claim(deployerAccount.userId));
```

#### Scenario B: Outbox Transfer & Recipient Claim
```ts
// 1. Alice transfers 500 tokens to Bob (User 200)
await window.psy.sendTransaction(aliceAccount, token.transfer(200n, 500n));

// 2. Bob claims the pending tokens from Alice
await window.psy.sendTransaction(bobAccount, token.claim(100n));
```

#### Scenario C: Dual-Ledger Delegation & Two-Phase Revocation [EXPERIMENTAL]
```ts
// 1. Alice opens delegation channel 0 to Spender (User 999) with 80,000 tokens
await window.psy.sendTransaction(aliceAccount, token.openDelegationChannel(0n, 999n, 80_000n));

// 2. Spender spends 30,000 tokens from Alice's channel directed to Charlie (User 300)
await window.psy.sendTransaction(spenderAccount, token.spendDelegation(100n, 0n, 30_000n, 300n));

// 3. Alice initiates revocation (enters REVOKE_PENDING with 60-checkpoint cutoff)
await window.psy.sendTransaction(aliceAccount, token.requestRevokeDelegation(0n));

// 4. After cutoff checkpoint passes, Alice finalizes revocation and receives unspent refund (50,000 tokens)
await window.psy.sendTransaction(aliceAccount, token.finalizeRevokeDelegation(0n, 999n));
```

#### Scenario D: Shielded Private Transfer & Canonical Private Claim
```ts
// 1. Alice creates shielded note commitment for Receiver
const note = await token.privateTransfer(receiverShielded, 50_000n, noteSecret);

// 2. Receiver claims note with ZK inclusion proof and nullifier
await token.privateClaim({
  nullifierHash,
  receiver: receiverShielded,
  amount: 50_000n,
  userTreeRoot,
  checkpointId,
  noteRootSlot: 8388609n,
  random0,
  random1,
  proof
});
```

---

## Testing & Verification

```sh
# Run native unit test suite (dargo test)
dargo test --file tests/token_unit_test.psy

# Run all test suites
npm test
```
