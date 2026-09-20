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
    pub cutoff_checkpoint: Felt,
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
    pub decimals: Felt,
    pub symbol: Felt,
    pub delegations: [DelegationChannel; 16],
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
- **`total_minted`** (Offset 33554522): Cumulative tokens minted through the contract in the deployer partition.
- **`decimals`** (Offset 33554523): Token precision (max 18).
- **`symbol`** (Offset 33554524): Compact field element token symbol.
- **`delegations`** (Offset 33554525..33554604): Owner-side delegation channel allocations and status (`[DelegationChannel; 16]`).
- **`state_map`** (Offset 33554608..): Indexed Sparse Merkle Tree supporting namespaced multi-key storage:
  - **Namespace 1**: Private Claim Nullifiers (`nullifier_hash -> [1, 0, 0, 0]`) to prevent double-claiming.
  - **Namespace 2**: Spender Delegation Spent Ledgers (`hash([owner, channel_idx, version, 0]) -> [spent_amount, 0, 0, 0]`) guaranteeing complete cryptographic isolation per `(owner, channel_idx, version)` tuple with zero storage collisions across owners or versions.

### 2.2 Standard Methods (15 Methods)

1. **Token Administration**:
   - `set_metadata(symbol: Felt, decimals: Felt)`: Restricted to contract deployer (`assert_caller_is_deployer()`).
   - `set_mint_authority(new_authority: Felt)`: Restricted to contract deployer (`assert_caller_is_deployer()`).
   - `renounce_mint_authority()`: Irrevocably renounces minting rights by contract deployer.
2. **Supply Lifecycle & Single-Source Issuance**:
   - `mint(amount: Felt)`: Restricted strictly to contract deployer partition (`assert_caller_is_deployer()` and `caller == auth`). Increments liquid balance and updates global `total_minted`. Non-deployer callers cannot mint in their own partitions (preventing uncapped local inflation).
   - `burn(amount: Felt)`: Burns tokens directly from caller's partition.
3. **Push-Pull Outbox Transfer & Claim**:
   - `transfer(recipient: Felt, amount: Felt)`: Deducts caller balance and credits recipient's Outbox.
   - `claim(sender: Felt)`: Cross-partition reads sender's Outbox, pulls pending tokens into caller balance.
   - `batch_transfer_2(recipients, amounts)` / `batch_transfer_5(recipients, amounts)`: Atomic multi-transfer execution.
4. **Dual-Ledger Delegation [EXPERIMENTAL - GATED BY PROTOCOL STALE-READ REJECTION]**:
   - `open_delegation_channel(channel_idx: Felt, spender: Felt, amount: Felt)`: Owner locks tokens into channel with `status = 1` (ACTIVE).
   - `spend_delegation(owner: Felt, channel_idx: Felt, amount: Felt, recipient: Felt)`: Spender verifies Owner channel, asserts `local_spent <= allocated_amount` (Goldilocks underflow prevention), updates Spender local ledger in `state_map` Namespace 2 keyed by `hash([owner, channel_idx, version, 0])`, and routes tokens to recipient Outbox.
   - `request_revoke_delegation(channel_idx: Felt)`: Owner initiates revocation, setting `status = 2` (REVOKE_PENDING) and `cutoff_checkpoint = current_cp + 60`.
   - `finalize_revoke_delegation(channel_idx: Felt, spender: Felt)`: After cutoff (`current_cp > cutoff`), Owner reads Spender's `state_map` Namespace 2, refunds unspent tokens, and closes channel (`status = 3`).
5. **Shielded Note Commitment & Canonical Private Claim**:
   - `private_transfer(receiver: Hash, value: Felt, note_secret_hash: Hash)`: Inserts note commitment into 20-level Merkle tree.
   - `private_claim(...)`: Precompile-compatible ZK proof verification of Merkle note inclusion (validating `preimage.note_root_slot == 8388609`, exact leaf index) with nullifier double-spend check via `state_map` Namespace 1.

---

## 3. Delegation Channels: Dual-Ledger Architecture & Cutoff Settlement [EXPERIMENTAL - GATED]

### 3.1 The Underlying Physical Constraint
Code tracing of `psy-node` (`realm/edge/handler.rs:350-450`) confirms:
- The node verifier only validates that the **caller's** start leaf hash is current at `current_checkpoint_id`.
- For target partition states (e.g. Owner $A$'s channel state), the node only validates Merkle inclusion in the historical Checkpoint tree at `end_cap_checkpoint_id <= current_checkpoint_id`.
- **Physical Reality**: Target partition mutations do **NOT** retroactively invalidate existing ZK proofs generated against historical Checkpoints.

### 3.2 Safe Delegation Invariant & Protocol Requirements
To safely support revocable delegation without double-spending or over-refunding:
> **Delegation 底层前提**: stale-read rejection、执行期当前状态校验，或等价的协议级线性化/Cutoff 机制，三者至少具备其一。
>
> **重要物理边界**: 在 `psy-node`（`realm/edge/handler.rs:188`）的跨分区读验证中，目标分区读取仅需证明在*某个历史 checkpoint* 下有效。若攻击者以 `status == 1 (OPEN)` 的历史状态树根生成读证明，进入目标分区后根本不会执行 `status == 2` 的截断检查分支。因此，**应用层 `cutoff_checkpoint` 无法单独拦截基于历史快照的陈旧读 Spend**；其有效性严格依赖于协议层/共识层拒绝陈旧读或强制状态线性化。在协议层落实旧读拒绝前，不可用于主网真实资金的撤销委托。

`psy-template` 实现了基于 `state_map` 复合键的两阶段截断双账本范式：
1. `request_revoke_delegation`: 设置 `cutoff_checkpoint = current_checkpoint + 60` 并标记 `status = 2` (REVOKE_PENDING)。
2. 在受信任/具有线性化保障的运行环境中，截断点之前生成的 Spend 允许结算，截断点之后提交的 Spend 坚决拒绝。
3. `finalize_revoke_delegation`: 强制 `current_checkpoint > cutoff_checkpoint`。通过 `contains_ns_other(2, rec_key)` 和 `get_ns_other(2, rec_key)` 精确读取 Spender 端该 `(owner, channel_idx, version)` 的实际支出，退还 `allocated - confirmed_spent` 给 Owner，并关闭通道 (`status = 3`)。

### 3.3 5-Case Adversarial Verification Matrix

| Case | Scenario | Expected Assertion |
| :--- | :--- | :--- |
| **Case 1** | B generates Spend at $k$, A revokes at $k+1$, B submits after cutoff | **Transaction MUST FAIL** |
| **Case 2** | B Spend finalized first, A revokes after | Refund is strictly `allocated - confirmed_spent` (never full allocation) |
| **Case 3** | A Revoke finalized first, B spends after | **Transaction MUST FAIL** |
| **Case 4** | B Spend produces Outbox, Channel CLOSED, C claims | **Claim MUST SUCCEED** (monotone Outbox independence) |
| **Case 5** | B proof at $k$, A revokes at $k+1$, current $k+2$ (within `MAX_LAG`) | **Transaction MUST STILL FAIL** with zero state pollution across B, Outbox, C, and A |
| **Case 6** | Real Compiled `.psy` Artifact Verification | Verified against `token.abi.json` (methods, storage layout, signatures) |

---

## 4. PSY-721: Non-Fungible Token Standard Specification (V-Final)

### 4.1 Global Identity & Namespace Uniqueness
In a partitioned state tree, global token uniqueness cannot rely on a single global table.
- Global token identity is computed on-chain via native ZK Poseidon circuit:
  $$\text{token\_id} = \text{hash\_two\_to\_one}([\text{creator}, 0, 0, 0], [\text{local\_id}, 0, 0, 0])[0]$$
- **Security Guarantee**:
  > 在固定编码、唯一 creator 和哈希抗碰撞假设下，提供计算意义上的命名空间唯一性。

### 4.2 Storage Layout & FIFO 4-Slot Sliding Window Outbox
- **`owned_tokens: [NFTSlot; 128]`**: Indexed token slots storing `(token_id, is_active, metadata_hash)`.
- **`outbox: [NFTOutbox; 16777216]`**: Circular buffer carrying up to 4 concurrent in-flight transfers:
  `token_id_0..3`, `metadata_hash_0..3`, `nonce_sent`, `nonce_claimed`.
- **FIFO Claim & ACK Recycling Protocol**:
  - Sender queues transfer at slot `nonce_sent & 3`.
  - Recipient claims at slot `nonce_claimed & 3` in strict FIFO order.
  - Sender recycled capacity is refreshed as recipient claims advance (`nonce_sent - acknowledged_claimed < 4`).

---

## 5. Security & Verification Invariants

| Invariant | Formal Definition | Verification Mechanism |
| :--- | :--- | :--- |
| **Conservation of Supply** | $\sum_i \text{balance}_i + \sum \text{escrow} + \sum \text{unclaimed} + \text{shielded} = \text{Minted} - \text{Burned}$ | Enforced across local partitions |
| **Goldilocks Field Safety** | $\forall x, 0 \le x \le \text{MAX\_FELT}$ | Guarded by `assert(amount <= MAX_FELT - balance)` |
| **Outbox Monotonicity** | $\text{nonce}_{sent}^{(t+1)} > \text{nonce}_{sent}^{(t)}$ and $\text{nonce}_{claimed} \le \text{nonce}_{sent}$ | Enforced by monotonic counters |
| **Delegation Cutoff Safety** | $\text{spend\_valid} \iff \text{submission\_cp} \le \text{cutoff\_cp}$ | Verified by cutoff checkpoint assertion |
| **Namespace Uniqueness** | $\text{token\_id} = \text{Poseidon}(\text{creator}, \text{local\_id})$ | On-chain circuit derivation |
| **Nullifier Non-Replay** | $\text{state\_map.contains}(\text{nullifier}) == \text{false}$ | Verified by state map lookup and insertion |

---

## 6. Toolchain & Testing Workflow

1. **Compilation**: `(cd token && psyup build) && (cd nft && psyup build) && (cd dapp/contract && psyup build)`
2. **Native Unit Tests**: `node tests/run_unit_tests.mjs` (invokes `dargo test`)
3. **E2E & Adversarial Tests**: `node tests/run_e2e_tests.mjs` (invokes `node --test`)
4. **Full Test Matrix**: `npm test` (`node tests/run_all_tests.mjs`)
5. **Zero-Competitor Audit**: `npm run audit` (`node scripts/audit_clean.mjs`)

---

## 7. Protocol Boundaries & Production Readiness Evaluation

`psy-template` serves as an advanced reference implementation demonstrating secure smart contract patterns on Psy Protocol's user-partitioned architecture. However, several fundamental protocol boundaries remain:

### 7.1 Dual-Constraint Single-Source Issuance (`ISSUER_USER_ID` + Deployer Public Key) & Toolchain Boundary
- In Psy Protocol, state is partitioned strictly by `State(contract_id, user_id)` with zero shared global state, and the node's user registration (`register_user_gatherer.rs:342`) assigns sequentially incremented `user_id`s without deduplicating public keys (meaning a single public key can correspond to $N$ valid `user_id`s).
- Checking only deployer public key equality (`get_user_public_key_hash() == get_contract_deployer()`) is insufficient to prevent multi-partition issuance, because the deployer keyholder could register multiple `user_id`s and mint in each separate partition, fragmenting supply.
- To guarantee single-source issuance deterministically:
  1. A dedicated `ISSUER_USER_ID` (e.g. `5`) is established as a deployment configuration compiled into the contract.
  2. Administrative methods (`set_metadata`, `mint`, `set_mint_authority`, `renounce_mint_authority`) enforce a **dual constraint**:
     ```rust
     assert_caller_is_deployer();
     assert(get_user_id() == ISSUER_USER_ID, "caller is not in canonical ISSUER_USER_ID partition");
     ```
  3. This dual lock ensures that only the cryptographic deployer can mint, and only from within the single canonical partition `ISSUER_USER_ID`.
- In the native `dargo test` unit test runner, the local harness generates contracts with a mock/random keypair while test methods execute as caller user 5; test fixtures accommodate this mock environment via `(user_pk == deployer) || (get_user_id() == ISSUER_USER_ID)`.
- **Toolchain Boundary & Deployment Verification Status (工具链边界与部署闭环现状)**:
  - **psyup CLI Independence**: The `psyup` CLI tool is an external Rust binary independent of Node.js/npm. When developers invoke `psyup build` or `psyup deploy` directly in their terminal, npm preflight scripts (`npm run check:preflight` / `npm run build:deploy`) are completely bypassed.
  - **Circuit-Level Introspection Limit**: Within ZK circuits, contracts cannot inspect the caller's or deployer's on-chain `user_id` mapping. The host syscall `get_contract_deployer()` returns a 4-Felt array representing the deployer's public key hash, not their `user_id`. Furthermore, the Psy state model maintains zero global state and no consensus-level public-key-to-user-id reverse lookup.
  - **Definitive Boundary Verdict**: **Mandatory deployment verification is not yet closed under the current toolchain (强制部署校验在当前工具链下尚未闭环)**. True end-to-end deployment closure requires either:
    1. Node-level protocol syscall support for deployer `user_id` introspection, or
    2. Built-in preflight checks directly inside the `psyup deploy` binary before transaction submission.
  - The npm scripts and `.issuer_configured` state tracking provide essential application-layer developer guardrails, but cannot enforce mandatory verification against direct CLI invocations.

### 7.2 The Fundamental Stale-Read Revocation Limit & On-Chain Delegation Gating
- The Two-Phase Cutoff protocol provides application-layer settlement bounds under the assumption of protocol-level linearizability or freshness validation.
- However, as proven in code tracing of `psy-node` (`realm/edge/handler.rs:188`), cross-partition read verification only validates Merkle inclusion in the historical Checkpoint tree at `end_cap_checkpoint_id <= current_checkpoint_id`.
- If an attacker provides a read proof generated against a historical checkpoint where `status == 1 (OPEN)`, the smart contract never enters the `status == 2` branch; execution-time current checkpoint checks do not restrict the historical state root.
- Therefore, without protocol-level linearizability, runtime verification of checkpoint age, or consensus-level stale-read rejection, application-layer delegation cannot prevent historical state replays across arbitrary timeframes.
- **On-Chain Delegation Entrance Gating (`DELEGATION_GATED`)**:
  - In default asset-issuing builds, `open_delegation_channel` includes an explicit on-chain gate:
    ```rust
    pub const DELEGATION_GATED: bool = true;
    // in open_delegation_channel:
    assert(!DELEGATION_GATED, "delegation channel creation is gated pending protocol-level linearizability");
    ```
  - **Boundary Clarification (阻止新增风险，非安全清退方案)**:
    - This entrance gate strictly serves to **stop new risk exposure** by preventing new capital from being locked into vulnerable channels on live networks.
    - **Leaving `spend_delegation` and `finalize_revoke_delegation` un-gated does NOT constitute a safe drainage/settlement solution**. Existing channels remain exposed to historical `OPEN` proof replays and stale reads of Spender's spent ledger.
    - Safe drainage and settlement of existing channels is strictly classified as **待设计和实机验证 (Pending Protocol Design and Real-Node Verification)**.

### 7.3 64-bit Felt Identifier Entropy Bounds
- Deriving `token_id` as `global_id_hash[0]` truncates a 256-bit Poseidon hash to a single 64-bit Goldilocks field element.
- While strictly sequential `local_id` eliminates duplicate mints by the same creator, cross-creator birthday collision probability reaches $50\%$ after $\approx 2^{32}$ total tokens.
- Production NFT implementations should represent `token_id` as a full 4-Felt array (`Hash`).

### 7.4 Testing Scope Clarifications
- Case 6 verifies ABI signatures, methods, storage offsets, and parameter encodings against compiled `.psy` artifacts; it does not execute live cross-node ZK transactions.
- Native unit tests run within a mock runtime partition and do not simulate concurrent multi-node settlement.
- The `dargo test` harness bypasses the deployer public key check due to mock environment limitations; native tests do NOT prove the dual constraint at the circuit level.

### 7.5 Status Calibration & Mainnet Production Readiness
- **Core Functional Modules (Reference Implementation)**:
  - **PSY-20**: Dual-Constraint Single-Source Issuance (`mint`), `burn`, Push-Pull Outbox Transfer (`transfer`), Recipient Claim (`claim`), Batch Transfers (`batch_transfer_2/5`), Token Metadata, Permanent Renunciation.
  - **PSY-721**: Dual-Constraint Collection Minting (`mint`), 4-Slot FIFO Outbox Transfer (`transfer`), FIFO Claim (`claim`), Collection Metadata, Computational Namespace Uniqueness via Poseidon.
  - **Shielded Note Transfers**: 20-level Merkle note commitment (`private_transfer`) and Leaf Index 8388609 Nullifier verification (`private_claim`) with replay protection via `state_map` Namespace 1.
- **Protocol-Gated Features**:
  - **Revocable Delegation**: The dual-ledger Outbox delegation model is architecturally complete and implemented with 256-bit Poseidon composite keys in `state_map` Namespace 2 (eliminating all storage overwrite vulnerabilities). However, due to `psy-node` historical stale-read boundaries, `open_delegation_channel` is **gated on-chain** via `assert(!DELEGATION_GATED, ...)` to block new capital lock-in. Existing channel drainage is **NOT safe** against historical state replays, and safe drainage/settlement remains **待设计和实机验证**. Delegation is strictly classified as **Experimental** and must not be used for live value transfers until protocol/consensus-level stale-read rejection is deployed.
- **Definitive Verdict**: `psy-template` establishes sound reference patterns and formal invariants, but is **NOT yet mainnet production ready** and **cannot be used for mainnet asset issuance**.
