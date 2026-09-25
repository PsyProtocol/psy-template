# Psy Protocol Smart Contract Asset Standards Design Specification (V-Final)

> **Document Status**: Complete Architectural Specification for `psy-template` (V-Final).
> **`psy-template` 整体生产状态定论**: 纯 JS 虚拟模型不能作为最终安全证据，但仍可保留作为快速单元测试；最终结论必须由真实编译产物、真实状态树和真实 ZK E2E 测试确认。目前已按 V-Final 基准方案全面落地完整架构，但整个 `psy-template` 仍未达到主网生产就绪（Not Mainnet Production Ready）。
> **Core Principle**: ZK-native client-side recursive proving with user-partitioned state trees. Zero shared global state contention.

---

## 1. Architectural Foundations & Physical Invariants

Psy Protocol is a zero-knowledge native (ZK-native) blockchain built upon client-side recursive proving and strict state partitioning. The architecture is governed by the following core axioms:

### 1.1 Goldilocks Prime Field Arithmetic
All contract execution, memory representations, and state values exist within the Plonky2 Goldilocks field $\mathbb{F}_p$, where the prime modulus is:
$$p = 2^{64} - 2^{32} + 1 = 18446744069414584321$$
- The primitive data type in Psy-lang is `Felt` (Field Element).
- The maximum safe value before modular wrap-around is:
  $$\text{MAX\_FELT} = p - 1 = 18446744069414584320$$
- All additions, balance updates, and counter increments must enforce explicit field upper-bound checks:
  $$\text{assert}(\text{amount} \le \text{MAX\_FELT} - \text{balance}, \text{"balance overflow"})$$

### 1.2 User-Partitioned State Tree
State in Psy is structured as a hierarchical Sparse Merkle Tree partitioned by user identity:
- **No Shared Global State**: Contracts do not maintain a single shared global state table. Instead, state is isolated per user partition:
  $$\text{State}(\text{contract\_id}, \text{user\_id})$$
- **Local Write Exclusivity**: A transaction executed by `caller = get_user_id()` can only mutate the caller's own state partition (`ContractMetadata::current()`). Cross-partition writes are physically and cryptographically prohibited by the ZK execution circuit.
- **Cross-Partition Read Verification**: A contract can read the state of any arbitrary user partition via:
  ```rust
  let other_contract = ContractRef::new(ContractMetadata::new(get_contract_id(), target_user_id));
  ```
  The client prover supplies an inclusion proof verifying the target user's state root against the consensus state root at a given Checkpoint.
- **Checkpoint State Commitment Aggregation**: Checkpoint-level state aggregation must be understood as **状态承诺/证明聚合 (State Commitment / Proof Aggregation)**, not as shared global mutable state.

### 1.3 Asynchronous Asset Flow: The Outbox/Claim Pattern
Because cross-user writes are prohibited, asset transfers between users utilize an asynchronous **Outbox/Claim (Push-Pull)** protocol:
1. **Transfer Phase (Push)**: User $A$ updates their local state partition, deducting their balance and recording the sent amount into an Outbox table indexed by recipient $B$.
2. **Claim Phase (Pull)**: User $B$ reads User $A$'s Outbox, asserts the pending transfer, records the claimed amount in their own state to synchronize nonces, and credits their local balance.
3. **Monotonicity & Stale-Proof Immunity**: Because `amount_sent` and `amount_claimed` are strictly monotonically non-decreasing, Outbox claims are **immune to stale-read double-spending**. A stale read merely results in claiming an older increment; subsequent claims collect the remainder.

---

## 2. PSY-20: Fungible Token Standard Specification (V-Final Complete)

The PSY-20 standard defines the protocol for divisible, fungible assets within user-partitioned state trees.

```rust
#[derive(Storage)]
pub struct OtherUserInfo {
    pub amount_sent: Felt,
    pub amount_claimed: Felt,
}

#[derive(Storage)]
pub struct DelegationChannel {
    pub spender: Felt,
    pub allocated_amount: Felt,
    pub channel_version: Felt,
    pub status: Felt, // 1: ACTIVE, 2: REVOKE_PENDING, 3: CLOSED
}

```rust
#[contract]
#[derive(Storage)]
pub struct PsyTokenContract {
    pub balance: Felt,
    pub last_claimed_pow_rewards_checkpoint_id: Felt,
    pub claimed_rewards: Felt,
    pub other_user_info: [OtherUserInfo; 16777216],
    pub note_count: Felt,
    pub note_root: Hash,
    pub last_path: [Hash; 20],
    pub mint_authority: Felt,
    pub is_mint_renounced: Felt,
    pub total_minted: Felt,
    pub total_supply: Felt,
    pub max_supply: Felt,
    pub burn_requested: Felt,
    pub burn_settled: [Felt; 16777216],
    pub decimals: Felt,
    pub symbol: Felt,
    pub name: [Felt; 2],
    pub token_uri: [Felt; 5],
    pub delegations: [DelegationChannel; 16],
    pub delegation_spends: [DelegationSpend; 268435456],
    pub state_map: Map<Hash, Hash, 1048576u32>,
}
```

- **`balance`** (Offset 0): Liquid token balance held in caller partition.
- **`last_claimed_pow_rewards_checkpoint_id`** (Offset 1): Protocol PoW reward tracking.
- **`claimed_rewards`** (Offset 2): Cumulative claimed mining rewards.
- **`other_user_info`** (Offset 3..33554434): Canonical Push-Pull Outbox mapping ($16,777,216 \times 2$ Felts).
- **`note_count`** (Offset 33554435): Total shielded commitments in the incremental Merkle tree (Leaf 8388608, element 3).
- **`note_root`** (Offset 33554436 / Leaf Index 8388609): 4-Felt Merkle tree root of private note commitments ($33554436 / 4 = 8388609$).
- **`last_path`** (Offset 33554440..33554519): Frontier path for incremental Merkle tree updates (Leaves 8388610..8388629).
- **`mint_authority`** (Offset 33554520): Canonical mint authority address configured and managed by the contract deployer (verified via `assert_caller_is_deployer()`, using `get_contract_deployer(get_contract_id())` and `get_user_public_key_hash()`). Separated from 0 (`ADDRESS_ZERO` / uninitialized / renounced sentinel).
- **`is_mint_renounced`** (Offset 33554521): Irrevocable mint renunciation flag (1 if permanently renounced).
- **`total_minted`** (Offset 33554522): Lifetime issuance in the issuer partition.
- **`total_supply`** (Offset 33554523): Issuance less settled burns; pending burn requests still count.
- **`max_supply`** (Offset 33554524): Optional immutable lifetime issuance cap (zero means unset).
- **`burn_requested`** (Offset 33554525): Per-user monotonic burn counter.
- **`burn_settled`** (Offset 33554526..50331741): Issuer's last settled counter for each user.
- **`decimals`** (Offset 50331742): Token precision (max 18).
- **`symbol`** (Offset 50331743): Compact field element token symbol.
- **`name`** (Offset 50331744..50331745): Name encoded as two Felts.
- **`token_uri`** (Offset 50331746..50331750): URI encoded as five Felts.
- **`delegations`** (Offset 50331751..50331814): Owner-side allocation and status.
- **`delegation_spends`** (Offset 50331815..855638182): Spender-local cumulative spend, close bit, and channel version.
- **`state_map`** (Offset 855638184..): Indexed sparse Merkle tree for private-claim nullifiers (Namespace 1).

### 2.2 Contract Methods (20 Methods)

1. **Token Administration**:
   - `set_metadata(symbol: Felt, decimals: Felt)`: Restricted to contract deployer (`assert_caller_is_deployer()`).
   - `set_extended_metadata(name: [Felt; 2], token_uri: [Felt; 5])`: Sets name and URI in the issuer partition.
   - `set_max_supply(cap: Felt)`: Sets the lifetime issuance cap once, before the first mint.
   - `set_mint_authority(new_authority: Felt)`: Restricted to contract deployer (`assert_caller_is_deployer()`).
   - `renounce_mint_authority()`: Irrevocably renounces minting rights by contract deployer.
2. **Supply Lifecycle & Single-Source Issuance**:
   - `mint(amount: Felt)`: Restricted strictly to contract deployer partition (`assert_caller_is_deployer()` and `caller == auth`). Increments liquid balance and updates global `total_minted`. Non-deployer callers cannot mint in their own partitions (preventing uncapped local inflation).
   - `mint_to(recipient: Felt, amount: Felt)`: Adds newly issued tokens to the issuer's Outbox for recipient claim.
   - `burn(amount: Felt)`: Removes liquid balance and increments the caller's burn counter.
   - `settle_burn(sender: Felt)`: Issuer settles a holder's cumulative burn counter, reducing `total_supply` once per increment.
3. **Push-Pull Outbox Transfer & Claim**:
   - `transfer(recipient: Felt, amount: Felt)`: Deducts caller balance and credits recipient's Outbox.
   - `claim(sender: Felt)`: Cross-partition reads sender's Outbox, pulls pending tokens into caller balance.
   - `batch_transfer_2(recipients, amounts)` / `batch_transfer_5(recipients, amounts)`: Atomic multi-transfer execution.
4. **Dual-Ledger Delegation [EXPERIMENTAL, COOPERATIVE REVOCATION]**:
   - `open_delegation_channel(channel_idx: Felt, spender: Felt, amount: Felt)`: Owner locks tokens into channel with `status = 1` (ACTIVE).
   - `spend_delegation(owner: Felt, channel_idx: Felt, amount: Felt, recipient: Felt)`: Spender verifies Owner channel, updates a spender-local versioned `delegation_spends` ledger, and routes tokens to recipient Outbox.
   - `request_revoke_delegation(channel_idx: Felt)`: Owner marks the slot REVOKE_PENDING. This is a request, not an enforced spending cutoff.
   - `close_delegation_channel(owner: Felt, channel_idx: Felt, version: Felt)`: Spender commits a terminal close in its own ledger.
   - `finalize_revoke_delegation(channel_idx: Felt, spender: Felt)`: Owner reads the exact closed ledger, refunds unspent tokens, and closes the slot.
5. **Shielded Note Commitment & Canonical Private Claim**:
   - `private_transfer(receiver: Hash, value: Felt, note_secret_hash: Hash)`: Inserts note commitment into 20-level Merkle tree.
   - `private_claim(...)`: Precompile-compatible ZK proof verification of Merkle note inclusion (validating `preimage.note_root_slot == 8388609`, exact leaf index) with nullifier double-spend check via `state_map` Namespace 1.

---

## 3. Delegation Channels: Cooperative Settlement [EXPERIMENTAL]

Each owner has 16 escrow slots. `open_delegation_channel` locks liquid balance and records a spender, allocation, and increasing slot version. `spend_delegation` reads that authorization and increments a versioned, owner-and-slot-indexed spent ledger in the spender's own partition. The ledger bounds total spend to the allocation, even when the remote authorization proof is historical.

`request_revoke_delegation` records the owner's request. The latest local source requires ACTIVE status to spend, so a fresh read of REVOKE_PENDING is rejected, but the request is not an effective spending cutoff: the spender can still present a historical ACTIVE proof. A separate `close_delegation_channel` writes an irreversible `closed` bit to the spender's **local** ledger; `finalize_revoke_delegation` requires a proof of that exact version and closed ledger, then refunds `allocated - spent`. A historical proof of CLOSED remains sufficient only because the same spender cannot increase `spent` after closure when its current local leaf is enforced. There is no 60-checkpoint timer in the current source.

This design provides **cooperative** settlement. If the spender refuses to close, the remaining escrow stays locked. A unilateral `approve(spender, 0)` plus immediate refund needs protocol-level validation that the spender reads the owner's latest state at commit, or an equivalent atomic cross-partition transition. A nullifier or zero allowance in the owner's partition alone cannot stop a remote spender from proving an earlier owner state. Staging contract 47, an earlier revision that accepted REVOKE_PENDING spends, completed the ordinary close, post-close rejection, immediate refund, and historical-spend path. Current contract 48 completed the ordinary close/refund path and rejected a newly initiated spend after the request, but accepted an earlier ACTIVE proof submitted after the request. This directly disproves unilateral revocation on the current artifact.

The older five-case linearizable-cutoff model in `tests/e2e/delegation_adversarial.test.mjs` is a protocol target, not evidence that staging implements fresh remote reads. The separate cooperative model documents the contract's narrower invariant.

---

## 4. PSY-721: Non-Fungible Token Reference Specification

### 4.1 Global Identity & Namespace Uniqueness
In a partitioned state tree, global token uniqueness cannot rely on a single global table.
- Global token identity is computed on-chain via native ZK Poseidon circuit:
  $$\text{token\_id} = \text{Poseidon}([\text{creator}, 0, 0, 0], [\text{local\_id}, 0, 0, 0]) \in \mathbb{F}^{4}$$
- **Security Guarantee**:
  > 在固定编码、唯一 creator 和哈希抗碰撞假设下，提供计算意义上的命名空间唯一性。

### 4.2 Storage Layout & FIFO 4-Slot Sliding Window Outbox
- **`owned_tokens: ContractStateArray<128, NFTSlot>`**: Indexed token slots storing `(token_id, is_active, metadata_hash)`.
- **`outbox: ContractStateArray<16777216, NFTOutbox>`**: Circular buffer carrying up to 4 concurrent in-flight transfers:
  `token_id_0..3`, `metadata_hash_0..3`, `nonce_sent`, `nonce_claimed`, and `nonce_acked`.
- **FIFO Claim & ACK Recycling Protocol**:
  - Sender queues transfer at slot `nonce_sent & 3`.
  - Recipient claims at slot `nonce_claimed & 3` in strict FIFO order.
  - The sender calls `acknowledge(recipient)` after a claim. It reads the recipient's inbound `nonce_claimed` and advances the sender's separate `nonce_acked`. Capacity requires `nonce_sent - nonce_acked < 4`.

---

## 5. Security & Verification Invariants

| Invariant | Formal Definition | Verification Mechanism |
| :--- | :--- | :--- |
| **Conservation of Supply** | $\sum_i \text{balance}_i + \sum \text{escrow} + \sum \text{unclaimed} + \text{shielded} = \text{Minted} - \text{Burned}$ | Enforced across local partitions |
| **Goldilocks Field Safety** | $\forall x, 0 \le x \le \text{MAX\_FELT}$ | Guarded by `assert(amount <= MAX_FELT - balance)` |
| **Outbox Monotonicity** | $\text{nonce}_{sent}^{(t+1)} > \text{nonce}_{sent}^{(t)}$ and $\text{nonce}_{claimed} \le \text{nonce}_{sent}$ | Enforced by monotonic counters |
| **Cooperative Delegation Settlement** | Refund requires spender `closed = 1` for the exact channel version; `spent` is then terminal | Versioned spender-local ledger and remote CLOSED proof |
| **Namespace Uniqueness** | $\text{token\_id} = \text{Poseidon}(\text{creator}, \text{local\_id})$ | On-chain circuit derivation |
| **Nullifier Non-Replay** | $\text{state\_map.contains}(\text{nullifier}) == \text{false}$ | Verified by state map lookup and insertion |

---

## 6. Toolchain & Testing Workflow

1. **Compilation**: `npm run build` uses legacy `dargo` for token/dApp and the 0.1.1 `psy_user_cli compile` for NFT v3.
2. **Native Unit Tests**: `node tests/run_unit_tests.mjs` (invokes `dargo test`)
3. **E2E & Adversarial Tests**: `node tests/run_e2e_tests.mjs` (invokes `node --test`)
4. **Full Test Matrix**: `npm test` (`node tests/run_all_tests.mjs`)
5. **Zero-Competitor Audit**: `npm run audit` (`node scripts/audit_clean.mjs`)

---

## 7. Protocol Boundaries & Production Readiness Evaluation

`psy-template` serves as an advanced reference implementation demonstrating secure smart contract patterns on Psy Protocol's user-partitioned architecture. However, several fundamental protocol boundaries remain:

### 7.1 Single-Source Issuance and Toolchain Boundary
- In Psy Protocol, state is partitioned strictly by `State(contract_id, user_id)` with zero shared global state, and the node's user registration (`register_user_gatherer.rs:342`) assigns sequentially incremented `user_id`s without deduplicating public keys (meaning a single public key can correspond to $N$ valid `user_id`s).
- Checking only deployer public key equality (`get_user_public_key_hash() == get_contract_deployer()`) is insufficient to prevent multi-partition issuance, because the deployer keyholder could register multiple `user_id`s and mint in each separate partition, fragmenting supply.
- To guarantee single-source issuance deterministically:
  1. A dedicated `ISSUER_USER_ID` (e.g. `5`) is established as a deployment configuration compiled into the contract.
  2. Legacy token and NFT administrative methods enforce a **dual constraint**:
     ```rust
     assert_caller_is_deployer();
     assert(get_user_id() == ISSUER_USER_ID, "caller is not in canonical ISSUER_USER_ID partition");
     ```
  3. The staging-compatible NFT v3 compiler does not expose `get_contract_deployer()`. Its NFT methods enforce `ctx.user_id == ISSUER_USER_ID` on chain. The checked deploy script verifies that the selected wallet owns that registered ID before submission.
- The native `dargo test` runner uses caller user 5 and a mock deployer key for the legacy source. It does not execute the NFT v3 source.
- **Toolchain Boundary & Deployment Verification Status (工具链边界与部署闭环现状)**:
  - **psyup CLI Independence**: The `psyup` CLI tool is an external Rust binary independent of Node.js/npm. When developers invoke `psyup build` or `psyup deploy` directly in their terminal, npm preflight scripts (`npm run check:preflight` / `npm run build:deploy`) are completely bypassed.
  - **Circuit-Level Introspection Limit**: Within ZK circuits, contracts cannot inspect the caller's or deployer's on-chain `user_id` mapping. The host syscall `get_contract_deployer()` returns a 4-Felt array representing the deployer's public key hash, not their `user_id`. Furthermore, the Psy state model maintains zero global state and no consensus-level public-key-to-user-id reverse lookup.
  - **Definitive Boundary Verdict**: **Mandatory deployment verification is not yet closed under the current toolchain (强制部署校验在当前工具链下尚未闭环)**. True end-to-end deployment closure requires either:
    1. Node-level protocol syscall support for deployer `user_id` introspection, or
    2. Built-in preflight checks directly inside the `psyup deploy` binary before transaction submission.
  - The standalone templates' `deploy:checked` command now requires an explicit `RPC_CONFIG`, checks the selected wallet's first registered user ID against the configured issuer on that network, then builds and deploys with the same configuration. The `.issuer_configured` marker alone proves only local source configuration. Direct `psyup deploy` still bypasses the checked wrapper, so mandatory verification remains a toolchain-level gap.

### 7.2 Historical Remote Reads and Delegation
- Staging accepted a cross-partition transaction anchored to a historical sender state after the sender had changed that state. The remote read is proven against a historical checkpoint root, not the latest state at submission.
- The current token contract therefore treats an owner revocation request as a signal. Spender spending remains possible until the spender writes a terminal close in its own partition.
- The owner refunds only against a CLOSED ledger with the exact channel version. This avoids reusing an old `spent` total after a later spender-local spend, assuming current caller leaves are enforced at settlement. It does not give the owner unilateral cancellation.
- To support unilateral cancellation, the protocol must disclose and validate the remote read set at inclusion against current user leaves, or provide an atomic cross-partition transaction. A bounded historical window or a 60-checkpoint timer alone does not provide this guarantee.
- In the node source, `client_prover/psy_circuit/psy_dpn_circuit/src/vm/gadgets/state_readers.rs` binds a remote user leaf to the transaction's checkpoint `user_tree_root`; `psy_node_common/src/guta_planner/coordinator_guta_planner.rs` checks the writer's input leaf against current global state. A protocol fix must also validate each authorization-sensitive remote read against current state at the serialized commit point, with the read-set committed by the proof. Reject on any remote-leaf change and force reproving; commit the caller update and these checks atomically. The acceptance test is: Bob's proof anchored before Alice's revoke must fail when submitted after her revoke confirms, while a spend committed before the revoke remains accounted for in Alice's refund.

### 7.3 Full-Hash NFT Identifiers
- NFT v3 stores the full four-Felt Poseidon output as `token_id: Hash` in slots and Outbox records. This removes the version 1 single-Felt truncation and separates inbound claims from outbound ACKs.
- Uniqueness remains computational under Poseidon collision resistance and fixed `(creator, local_id)` encoding; it is not a mathematical proof of collision impossibility.
- The change is storage and event ABI incompatible with version 1. Existing deployments require a separately designed migration rather than an in-place ABI swap.

### 7.4 Testing Scope Clarifications
- The ABI check compiles the NFT `.psy.rs` artifact and verifies methods, storage layout, and parameter encodings. The staging report separately records live cross-realm ZK transactions.
- Native unit tests run within a mock runtime partition and do not simulate concurrent multi-node settlement.
- The legacy `dargo test` harness bypasses the deployer public key check and cannot register a second user for NFT ACK reads. Its assertions do not validate the NFT v3 circuit. The staging test covers ordinary cross-partition claims and ACK, while adversarial historical-proof cases remain open.

### 7.5 Status Calibration & Mainnet Production Readiness
- **Core Functional Modules (Reference Implementation)**:
  - **PSY-20**: Dual-Constraint Single-Source Issuance (`mint`), `burn`, Push-Pull Outbox Transfer (`transfer`), Recipient Claim (`claim`), Batch Transfers (`batch_transfer_2/5`), Token Metadata, Permanent Renunciation.
  - **PSY-721 v3**: Canonical issuer collection minting (`mint`), 4-Slot FIFO Outbox Transfer (`transfer`), FIFO Claim (`claim`), explicit `acknowledge`, Collection Metadata, Computational Namespace Uniqueness via Poseidon.
  - **Private note transfers**: The legacy `.psy` source and the separate private-enabled v3 profile have 20-level Merkle note commitment (`private_transfer`) and Leaf Index 8388609 nullifier verification (`private_claim`) via `state_map` Namespace 1. The private v3 profile completed two cross-realm staging round trips on contract 53, including Merkle index 1, and rejected a replay of the first note. State proofs at checkpoint 48805 show balances 850/150 and supply 1000. The default `.psy.rs` profile remains public-only; building private v3 requires the matching isolated compiler and verifier fingerprint.
- **Experimental Delegation**: The source permits escrowed, cooperative spending through 16 owner slots and spender-local versioned ledgers. A spender must close before the owner can refund. Staging contract 47 verified the ordinary close/refund path, rejected a fresh post-close spend, and accepted a pre-request proof submitted after the request. Its earlier code also accepted a new spend after the request. Contract 48 uses the current active-only guard and rejected a new spend after the request, but accepted an old ACTIVE proof submitted after the request. It then closed and refunded correctly in both cases. Concurrency and mainnet security remain unverified.
- **Definitive Verdict**: `psy-template` establishes sound reference patterns and formal invariants, but is **NOT yet mainnet production ready** and **cannot be used for mainnet asset issuance**.
