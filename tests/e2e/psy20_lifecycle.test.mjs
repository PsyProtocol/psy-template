import test from 'node:test';
import assert from 'node:assert/strict';

// Canonical Issuer Partition index and Deployer Public Key in Psy Protocol
const ISSUER_USER_ID = 5n;
const DEPLOYER_PK = [111n, 222n, 333n, 444n];

// Mathematical & State Transition Model of PSY-20 over Partitioned State Tree
class Psy20VirtualEnvironment {
  constructor(delegationGated = false) {
    this.users = new Map(); // userId -> UserState
    this.userKeys = new Map(); // userId -> pk [Felt; 4]
    this.totalMinted = 0n;
    this.totalBurned = 0n;
    this.totalShieldedNotes = 0n;
    this.currentCheckpoint = 100n;
    this.stateMap = new Map(); // nullifier_key -> boolean
    this.delegation_spends = new Map(); // "spender:owner,channel_idx,version" -> spent_amount (Namespace 2)
    this.delegationGated = delegationGated;

    // Register canonical issuer with deployer pk
    this.userKeys.set(ISSUER_USER_ID, DEPLOYER_PK);
  }

  registerUserKey(userId, pk) {
    this.userKeys.set(userId, pk);
  }

  assertCallerIsDeployer(callerId) {
    const pk = this.userKeys.get(callerId);
    assert.ok(
      pk &&
      pk[0] === DEPLOYER_PK[0] &&
      pk[1] === DEPLOYER_PK[1] &&
      pk[2] === DEPLOYER_PK[2] &&
      pk[3] === DEPLOYER_PK[3],
      'only contract deployer is authorized'
    );
  }

  getOrCreateUser(userId) {
    if (!this.users.has(userId)) {
      this.users.set(userId, {
        balance: 0n,
        mint_authority: 0n,
        is_mint_renounced: 0n,
        total_minted: 0n,
        decimals: 0n,
        symbol: 0n,
        other_user_info: new Map(), // otherUserId -> { sent: 0n, claimed: 0n }
        delegations: Array.from({ length: 16 }, () => ({
          spender: 0n,
          allocated_amount: 0n,
          channel_version: 0n,
          status: 0n, // 0: UNINITIALIZED, 1: ACTIVE, 2: REVOKE_PENDING, 3: CLOSED
          cutoff_checkpoint: 0n
        })),
        note_count: 0n,
        note_root: [0n, 0n, 0n, 0n],
        last_path: Array.from({ length: 20 }, () => [0n, 0n, 0n, 0n])
      });
    }
    return this.users.get(userId);
  }

  getOtherInfo(callerId, otherId) {
    const user = this.getOrCreateUser(callerId);
    if (!user.other_user_info.has(otherId)) {
      user.other_user_info.set(otherId, { sent: 0n, claimed: 0n });
    }
    return user.other_user_info.get(otherId);
  }

  setMetadata(callerId, symbol, decimals) {
    this.assertCallerIsDeployer(callerId);
    assert.equal(callerId, ISSUER_USER_ID, 'caller is not in canonical ISSUER_USER_ID partition');
    const issuer = this.getOrCreateUser(ISSUER_USER_ID);
    assert.equal(issuer.is_mint_renounced, 0n, 'token administration has been renounced');
    const auth = issuer.mint_authority;
    if (auth === 0n) {
      issuer.mint_authority = callerId;
    } else {
      assert.equal(callerId, auth, 'caller is not authorized to set metadata');
    }
    assert(decimals <= 18n, 'decimals exceed max precision');
    issuer.symbol = symbol;
    issuer.decimals = decimals;
  }

  mint(callerId, amount) {
    assert(amount > 0n, 'amount must be positive');
    this.assertCallerIsDeployer(callerId);
    assert.equal(callerId, ISSUER_USER_ID, 'caller is not in canonical ISSUER_USER_ID partition');
    const issuer = this.getOrCreateUser(ISSUER_USER_ID);
    assert.equal(issuer.is_mint_renounced, 0n, 'minting has been renounced');
    const auth = issuer.mint_authority;
    assert.notEqual(auth, 0n, 'mint authority not initialized in issuer partition');
    assert.equal(callerId, auth, 'only authorized mint authority can mint in issuer partition');

    issuer.balance += amount;
    issuer.total_minted += amount;
    this.totalMinted += amount;
    this.verifyInvariants();
  }

  burn(callerId, amount) {
    assert(amount > 0n, 'amount must be positive');
    const user = this.getOrCreateUser(callerId);
    assert.ok(user.balance >= amount, 'insufficient balance to burn');

    user.balance -= amount;
    this.totalBurned += amount;
    this.verifyInvariants();
  }

  setMintAuthority(callerId, newAuthority) {
    this.assertCallerIsDeployer(callerId);
    assert.equal(callerId, ISSUER_USER_ID, 'caller is not in canonical ISSUER_USER_ID partition');
    const issuer = this.getOrCreateUser(ISSUER_USER_ID);
    assert.equal(issuer.is_mint_renounced, 0n, 'minting has been renounced');
    assert.equal(newAuthority, ISSUER_USER_ID, 'cannot transfer authority outside issuer partition in single-source model');

    issuer.mint_authority = newAuthority;
    this.verifyInvariants();
  }

  renounceMintAuthority(callerId) {
    this.assertCallerIsDeployer(callerId);
    assert.equal(callerId, ISSUER_USER_ID, 'caller is not in canonical ISSUER_USER_ID partition');
    const issuer = this.getOrCreateUser(ISSUER_USER_ID);
    assert.notEqual(issuer.mint_authority, 0n, 'mint authority not initialized');

    issuer.is_mint_renounced = 1n;
    issuer.mint_authority = 0n;
    this.verifyInvariants();
  }

  transfer(callerId, recipientId, amount) {
    assert.notEqual(callerId, recipientId, 'cannot transfer to self');
    assert(amount > 0n, 'amount must be positive');
    const user = this.getOrCreateUser(callerId);
    assert.ok(user.balance >= amount, 'insufficient balance for transfer');

    user.balance -= amount;
    const info = this.getOtherInfo(callerId, recipientId);
    info.sent += amount;

    this.verifyInvariants();
  }

  claim(callerId, senderId) {
    assert.notEqual(callerId, senderId, 'cannot claim from self');
    const caller = this.getOrCreateUser(callerId);
    const senderInfo = this.getOtherInfo(senderId, callerId);
    const myInfo = this.getOtherInfo(callerId, senderId);

    assert.ok(senderInfo.sent > myInfo.claimed, 'no pending transfer to claim');
    const claimable = senderInfo.sent - myInfo.claimed;

    caller.balance += claimable;
    myInfo.claimed = senderInfo.sent;

    this.verifyInvariants();
    return claimable;
  }

  batchTransfer2(callerId, recipients, amounts) {
    assert.equal(recipients.length, 2);
    assert.equal(amounts.length, 2);
    for (let i = 0; i < 2; i++) {
      this.transfer(callerId, recipients[i], amounts[i]);
    }
  }

  batchTransfer5(callerId, recipients, amounts) {
    assert.equal(recipients.length, 5);
    assert.equal(amounts.length, 5);
    for (let i = 0; i < 5; i++) {
      this.transfer(callerId, recipients[i], amounts[i]);
    }
  }

  openDelegationChannel(callerId, channelIdx, spenderId, amount) {
    assert(!this.delegationGated, 'delegation channel creation is gated pending protocol-level linearizability');
    assert(channelIdx >= 0 && channelIdx < 16, 'channel idx out of range');
    assert.notEqual(callerId, spenderId, 'cannot delegate to self');
    assert(amount > 0n, 'amount must be positive');
    const user = this.getOrCreateUser(callerId);
    assert.ok(user.balance >= amount, 'insufficient balance for delegation');

    user.balance -= amount;
    user.delegations[channelIdx] = {
      spender: spenderId,
      allocated_amount: amount,
      channel_version: user.delegations[channelIdx].channel_version + 1n,
      status: 1n, // ACTIVE
      cutoff_checkpoint: 0n
    };

    this.verifyInvariants();
  }

  spendDelegation(callerId, ownerId, channelIdx, amount, recipientId) {
    assert(channelIdx >= 0 && channelIdx < 16, 'channel idx out of range');
    assert(amount > 0n, 'amount must be positive');
    const owner = this.getOrCreateUser(ownerId);
    const ch = owner.delegations[channelIdx];
    assert.equal(ch.spender, callerId, 'caller is not channel spender');
    assert.ok(
      ch.status === 1n || (ch.status === 2n && this.currentCheckpoint <= ch.cutoff_checkpoint),
      'channel is not active for spending'
    );

    const recKey = `${callerId}:${ownerId},${channelIdx},${ch.channel_version}`;
    const localSpent = this.delegation_spends.get(recKey) || 0n;
    assert.ok(localSpent <= ch.allocated_amount, 'local spent exceeds allocated amount');
    const remaining = ch.allocated_amount - localSpent;
    assert.ok(amount <= remaining, 'insufficient delegation channel allowance');

    this.delegation_spends.set(recKey, localSpent + amount);

    // Spender routes to recipient Outbox
    const info = this.getOtherInfo(callerId, recipientId);
    info.sent += amount;

    this.verifyInvariants();
  }

  requestRevokeDelegation(callerId, channelIdx) {
    assert(channelIdx >= 0 && channelIdx < 16, 'channel idx out of range');
    const user = this.getOrCreateUser(callerId);
    const ch = user.delegations[channelIdx];
    assert.equal(ch.status, 1n, 'channel must be active to initiate revocation');

    ch.status = 2n; // REVOKE_PENDING
    ch.cutoff_checkpoint = this.currentCheckpoint + 60n;
  }

  finalizeRevokeDelegation(callerId, channelIdx, spenderId) {
    assert(channelIdx >= 0 && channelIdx < 16, 'channel idx out of range');
    const user = this.getOrCreateUser(callerId);
    const ch = user.delegations[channelIdx];
    assert.equal(ch.status, 2n, 'channel must be in REVOKE_PENDING state');
    assert.equal(ch.spender, spenderId, 'spender mismatch');
    assert.ok(this.currentCheckpoint > ch.cutoff_checkpoint, 'cutoff checkpoint has not been reached');

    const recKey = `${spenderId}:${callerId},${channelIdx},${ch.channel_version}`;
    const confirmedSpent = this.delegation_spends.get(recKey) || 0n;
    assert.ok(confirmedSpent <= ch.allocated_amount, 'confirmed spent exceeds allocated');

    const unspent = ch.allocated_amount - confirmedSpent;
    assert.ok(unspent >= 0n, 'confirmed spent exceeds allocated');

    user.balance += unspent;
    ch.status = 3n; // CLOSED
    ch.allocated_amount = 0n;
    ch.spender = 0n;
    ch.cutoff_checkpoint = 0n;

    this.verifyInvariants();
  }

  privateTransfer(callerId, receiver, value, noteSecretHash) {
    assert(value > 0n, 'value must be positive');
    const user = this.getOrCreateUser(callerId);
    assert.ok(user.balance >= value, 'insufficient balance for private transfer');

    user.balance -= value;
    user.note_count += 1n;
    this.totalShieldedNotes += value;

    this.verifyInvariants();
    return { noteIndex: user.note_count - 1n, value };
  }

  privateClaim(callerId, nullifierHash, amount) {
    assert(amount > 0n, 'amount must be positive');
    const nullifierKey = nullifierHash.join(',');
    assert(!this.stateMap.has(nullifierKey), 'nullifier already spent');

    this.stateMap.set(nullifierKey, true);
    const caller = this.getOrCreateUser(callerId);
    caller.balance += amount;
    this.totalShieldedNotes -= amount;

    this.verifyInvariants();
  }

  verifyInvariants() {
    let totalBalances = 0n;
    let totalEscrowInChannels = 0n;

    for (const [userId, state] of this.users.entries()) {
      assert.ok(state.balance >= 0n, `user ${userId} balance cannot be negative`);
      totalBalances += state.balance;

      for (let i = 0; i < 16; i++) {
        const ch = state.delegations[i];
        if (ch.status === 1n || ch.status === 2n) {
          const recKey = `${ch.spender}:${userId},${i},${ch.channel_version}`;
          const spent = this.delegation_spends.get(recKey) || 0n;
          assert.ok(spent <= ch.allocated_amount, 'spent exceeds allocated');
          totalEscrowInChannels += (ch.allocated_amount - spent);
        }
      }
    }

    // In-transit unclaimed tokens: sum of (A.sent_to_B - B.claimed_from_A)
    let totalUnclaimed = 0n;
    for (const [senderId, senderState] of this.users.entries()) {
      for (const [recipientId, info] of senderState.other_user_info.entries()) {
        const recipientInfo = this.getOtherInfo(recipientId, senderId);
        assert.ok(info.sent >= recipientInfo.claimed, 'claimed exceeds sent');
        totalUnclaimed += (info.sent - recipientInfo.claimed);
      }
    }

    const expectedTotal = this.totalMinted - this.totalBurned;
    const actualTotal = totalBalances + totalEscrowInChannels + totalUnclaimed + this.totalShieldedNotes;
    assert.equal(actualTotal, expectedTotal, `Total supply invariant violated: expected ${expectedTotal}, got ${actualTotal}`);
  }
}

test('PSY-20 Lifecycle & Formal Invariants E2E', async (t) => {
  const env = new Psy20VirtualEnvironment();
  const ISSUER = 5n;
  const ISSUER_ALT = 99n;
  const ALICE = 101n;
  const BOB = 202n;
  const CHARLIE = 303n;
  const SPENDER = 999n;

  // Register public keys:
  // ISSUER_ALT has identical DEPLOYER_PK as ISSUER (simulating 1 public key mapped to multiple user_ids in register_user_gatherer)
  env.registerUserKey(ISSUER_ALT, DEPLOYER_PK);
  env.registerUserKey(ALICE, [999n, 888n, 777n, 666n]);
  env.registerUserKey(BOB, [555n, 444n, 333n, 222n]);
  env.registerUserKey(CHARLIE, [123n, 456n, 789n, 101n]);
  env.registerUserKey(SPENDER, [111n, 111n, 111n, 111n]);

  // NOTE: This test runs within the JS formal state-machine model to verify partition transitions
  // and multi-ID rejection logic. It is not a native ZK circuit proof test, as dargo test harness
  // lacks multi-identity simulation capabilities.
  await t.test('1. Minting and authority establishment via Dual-Constraint Single-Source Issuance (JS Simulation)', () => {
    // Non-deployer caller attempting to set metadata or mint fails deployer authorization
    assert.throws(() => env.setMetadata(ALICE, 5264217n, 9n), /only contract deployer is authorized/);
    assert.throws(() => env.mint(ALICE, 1_000_000n), /only contract deployer is authorized/);

    // Multi-ID Attack Simulation:
    // Caller with identical deployer public key but alternate user ID (ISSUER_ALT = 99)
    // passes public key check, but is strictly blocked by canonical partition constraint:
    assert.throws(() => env.setMetadata(ISSUER_ALT, 5264217n, 9n), /caller is not in canonical ISSUER_USER_ID partition/);
    assert.throws(() => env.mint(ISSUER_ALT, 1_000_000n), /caller is not in canonical ISSUER_USER_ID partition/);

    // Canonical Issuer attempting to mint before authority initialization fails
    assert.throws(() => env.mint(ISSUER, 1_000_000n), /mint authority not initialized in issuer partition/);

    // Canonical Issuer (user_id = 5, with deployer key) initializes metadata and appoints ISSUER as mint authority
    env.setMetadata(ISSUER, 5264217n, 9n);
    env.setMintAuthority(ISSUER, ISSUER);

    // Issuer mints 1,000,000 tokens directly into Issuer Partition
    env.mint(ISSUER, 1_000_000n);
    const issuerState = env.getOrCreateUser(ISSUER);
    assert.equal(issuerState.balance, 1_000_000n);
    assert.equal(issuerState.total_minted, 1_000_000n);

    // Issuer distributes tokens to ALICE via Outbox transfer
    env.transfer(ISSUER, ALICE, 1_000_000n);
    env.claim(ALICE, ISSUER);
    const aliceState = env.getOrCreateUser(ALICE);
    assert.equal(aliceState.balance, 1_000_000n);

    // BOB attempting to mint fails because not deployer
    assert.throws(() => env.mint(BOB, 100n), /only contract deployer is authorized/);
  });

  await t.test('2. Direct outbox transfer & recipient claim', () => {
    env.transfer(ALICE, BOB, 250_000n);
    assert.equal(env.getOrCreateUser(ALICE).balance, 750_000n);
    assert.equal(env.getOrCreateUser(BOB).balance, 0n);

    // Bob claims from Alice
    const claimed = env.claim(BOB, ALICE);
    assert.equal(claimed, 250_000n);
    assert.equal(env.getOrCreateUser(BOB).balance, 250_000n);
  });

  await t.test('3. Batch transfers (2-way and 5-way)', () => {
    env.batchTransfer2(ALICE, [BOB, CHARLIE], [50_000n, 100_000n]);
    assert.equal(env.getOrCreateUser(ALICE).balance, 600_000n);

    env.claim(BOB, ALICE);
    env.claim(CHARLIE, ALICE);
    assert.equal(env.getOrCreateUser(BOB).balance, 300_000n);
    assert.equal(env.getOrCreateUser(CHARLIE).balance, 100_000n);
  });

  await t.test('4a. Delegation on-chain entrance gating & drainability', () => {
    // Default build has DELEGATION_GATED = true
    const gatedEnv = new Psy20VirtualEnvironment(true);
    gatedEnv.registerUserKey(ISSUER, DEPLOYER_PK);
    gatedEnv.registerUserKey(ALICE, [999n, 888n, 777n, 666n]);
    gatedEnv.registerUserKey(SPENDER, [111n, 111n, 111n, 111n]);
    gatedEnv.registerUserKey(BOB, [555n, 444n, 333n, 222n]);

    gatedEnv.setMetadata(ISSUER, 5264217n, 9n);
    gatedEnv.setMintAuthority(ISSUER, ISSUER);
    gatedEnv.mint(ISSUER, 100_000n);
    gatedEnv.transfer(ISSUER, ALICE, 100_000n);
    gatedEnv.claim(ALICE, ISSUER);

    // Attempting to open delegation channel fails on-chain gate
    assert.throws(
      () => gatedEnv.openDelegationChannel(ALICE, 0, SPENDER, 10_000n),
      /delegation channel creation is gated pending protocol-level linearizability/
    );

    // Existing channels (e.g. established prior to gating) can still execute spend and revocation to drain funds cleanly
    gatedEnv.delegationGated = false; // temporarily un-gate to create channel
    gatedEnv.openDelegationChannel(ALICE, 0, SPENDER, 10_000n);
    gatedEnv.delegationGated = true; // gate active again

    // Spender can spend from pre-existing channel even when gated
    gatedEnv.spendDelegation(SPENDER, ALICE, 0, 4_000n, BOB);
    assert.equal(gatedEnv.delegation_spends.get(`${SPENDER}:${ALICE},0,1`), 4_000n);

    // Alice can request and finalize revoke even when gated
    gatedEnv.requestRevokeDelegation(ALICE, 0);
    gatedEnv.currentCheckpoint += 65n;
    gatedEnv.finalizeRevokeDelegation(ALICE, 0, SPENDER);
    // Alice receives 6,000 unspent refund
    assert.equal(gatedEnv.getOrCreateUser(ALICE).balance, 96_000n);
  });

  await t.test('4b. True dual-ledger delegation channel lifecycle, multi-key isolation, & two-phase revocation', () => {
    // Alice opens delegation channel 0 to Spender with 80,000 tokens
    env.openDelegationChannel(ALICE, 0, SPENDER, 80_000n);
    assert.equal(env.getOrCreateUser(ALICE).balance, 520_000n);

    // Spender uses 30,000 from Alice's channel 0 directed to Charlie's Outbox
    env.spendDelegation(SPENDER, ALICE, 0, 30_000n, CHARLIE);
    assert.equal(env.delegation_spends.get(`${SPENDER}:${ALICE},0,1`), 30_000n);

    // Charlie claims the spent tokens from Spender's Outbox
    const claimedByCharlie = env.claim(CHARLIE, SPENDER);
    assert.equal(claimedByCharlie, 30_000n);
    assert.equal(env.getOrCreateUser(CHARLIE).balance, 130_000n);

    // Adversarial Multi-Key Collision Test:
    // Charlie also opens channel 0 to SPENDER with 50,000 tokens!
    env.openDelegationChannel(CHARLIE, 0, SPENDER, 50_000n);
    assert.equal(env.getOrCreateUser(CHARLIE).balance, 80_000n);

    // Spender spends 20,000 for Charlie to Bob on channel 0
    env.spendDelegation(SPENDER, CHARLIE, 0, 20_000n, BOB);
    assert.equal(env.delegation_spends.get(`${SPENDER}:${CHARLIE},0,1`), 20_000n);
    const claimedByBob = env.claim(BOB, SPENDER);
    assert.equal(claimedByBob, 20_000n);
    assert.equal(env.getOrCreateUser(BOB).balance, 320_000n);

    // Crucial check: Charlie's spend (20,000) did NOT overwrite Alice's spend (30,000)
    assert.equal(env.delegation_spends.get(`${SPENDER}:${ALICE},0,1`), 30_000n);

    // Alice initiates two-phase revocation: sets status to REVOKE_PENDING with cutoff
    env.requestRevokeDelegation(ALICE, 0);
    const ch = env.getOrCreateUser(ALICE).delegations[0];
    assert.equal(ch.status, 2n);
    assert.equal(ch.cutoff_checkpoint, env.currentCheckpoint + 60n);

    // Finalize before cutoff fails
    assert.throws(() => env.finalizeRevokeDelegation(ALICE, 0, SPENDER), /cutoff checkpoint has not been reached/);

    // Advance past cutoff
    env.currentCheckpoint += 65n;

    // Alice finalizes revocation: Alice receives 80,000 - 30,000 = 50,000 refund!
    // (If overwrite occurred, Alice would have received 80,000 - 0 = 80,000 or 80,000 - 20,000 = 60,000)
    env.finalizeRevokeDelegation(ALICE, 0, SPENDER);
    assert.equal(env.getOrCreateUser(ALICE).balance, 570_000n); // 520,000 + 50,000
    assert.equal(env.getOrCreateUser(ALICE).delegations[0].status, 3n); // CLOSED

    // Charlie's channel 0 is still active and isolated!
    assert.equal(env.getOrCreateUser(CHARLIE).delegations[0].status, 1n); // ACTIVE
    // Charlie revokes channel 0:
    env.requestRevokeDelegation(CHARLIE, 0);
    env.currentCheckpoint += 65n;
    env.finalizeRevokeDelegation(CHARLIE, 0, SPENDER);
    // Charlie receives 50,000 - 20,000 = 30,000 refund
    assert.equal(env.getOrCreateUser(CHARLIE).balance, 110_000n); // 80,000 + 30,000

    // Multi-key version isolation check: Re-opening channel 0 with version 2 has 0 prior spent
    env.openDelegationChannel(ALICE, 0, SPENDER, 10_000n);
    assert.equal(env.getOrCreateUser(ALICE).delegations[0].channel_version, 2n);
    assert.equal(env.getOrCreateUser(ALICE).balance, 560_000n);

    // Spender spends 10,000 without being blocked by old 30,000 spent from version 1
    env.spendDelegation(SPENDER, ALICE, 0, 10_000n, CHARLIE);
    assert.equal(env.delegation_spends.get(`${SPENDER}:${ALICE},0,2`), 10_000n);
    const claimedAgain = env.claim(CHARLIE, SPENDER);
    assert.equal(claimedAgain, 10_000n);
    assert.equal(env.getOrCreateUser(CHARLIE).balance, 120_000n);

    // Close channel 0
    env.requestRevokeDelegation(ALICE, 0);
    env.currentCheckpoint += 65n;
    env.finalizeRevokeDelegation(ALICE, 0, SPENDER);
    assert.equal(env.getOrCreateUser(ALICE).delegations[0].status, 3n);
    assert.equal(env.getOrCreateUser(ALICE).balance, 560_000n); // 0 refund since all 10k was spent
  });

  await t.test('5. Shielded Private Transfer & Canonical Private Claim with Nullifier double-spend prevention', () => {
    const receiverShielded = [1n, 2n, 3n, 4n];
    const secret = [5n, 6n, 7n, 8n];
    const note = env.privateTransfer(ALICE, receiverShielded, 70_000n, secret);
    assert.equal(note.noteIndex, 0n);
    assert.equal(env.getOrCreateUser(ALICE).balance, 490_000n);
    assert.equal(env.getOrCreateUser(ALICE).note_count, 1n);

    // Canonical private claim with nullifier verification
    const nullifierHash = [99n, 88n, 77n, 66n];
    env.privateClaim(BOB, nullifierHash, 70_000n);
    assert.equal(env.getOrCreateUser(BOB).balance, 390_000n); // 320,000 + 70,000

    // Double claim with identical nullifier MUST fail
    assert.throws(() => env.privateClaim(BOB, nullifierHash, 70_000n), /nullifier already spent/);
  });

  await t.test('6. Burn tokens', () => {
    env.burn(ALICE, 50_000n);
    assert.equal(env.getOrCreateUser(ALICE).balance, 440_000n);
  });

  await t.test('7. Single-source issuance and irrevocable renunciation via Issuer Partition', () => {
    // Non-deployer caller attempting authority transfer fails deployer check
    assert.throws(() => env.setMintAuthority(ALICE, BOB), /only contract deployer is authorized/);

    // In single-source model, authority cannot be transferred outside Issuer Partition
    assert.throws(() => env.setMintAuthority(ISSUER, BOB), /cannot transfer authority outside issuer partition/);

    // Non-deployer caller attempting to mint directly fails
    assert.throws(() => env.mint(BOB, 400_000n), /only contract deployer is authorized/);
    assert.throws(() => env.mint(ALICE, 100n), /only contract deployer is authorized/);

    // Alternate user ID with deployer key also fails partition check
    assert.throws(() => env.mint(ISSUER_ALT, 100n), /caller is not in canonical ISSUER_USER_ID partition/);

    // Issuer mints 400,000 tokens directly in Issuer Partition
    env.mint(ISSUER, 400_000n);
    assert.equal(env.getOrCreateUser(ISSUER).balance, 400_000n);
    assert.equal(env.getOrCreateUser(ISSUER).total_minted, 1_400_000n);

    // Issuer distributes tokens to BOB via Outbox transfer
    env.transfer(ISSUER, BOB, 400_000n);
    env.claim(BOB, ISSUER);
    assert.equal(env.getOrCreateUser(BOB).balance, 790_000n); // 390k + 400k = 790k

    // Issuer renounces mint authority permanently
    env.renounceMintAuthority(ISSUER);
    assert.equal(env.getOrCreateUser(ISSUER).is_mint_renounced, 1n);
    assert.equal(env.getOrCreateUser(ISSUER).mint_authority, 0n);

    // Any attempt to mint now must strictly fail
    assert.throws(() => env.mint(ISSUER, 100n), /minting has been renounced/);
    assert.throws(() => env.mint(BOB, 100n), /only contract deployer is authorized/);
    assert.throws(() => env.mint(ALICE, 100n), /only contract deployer is authorized/);
    assert.throws(() => env.mint(ISSUER_ALT, 100n), /caller is not in canonical ISSUER_USER_ID partition/);
  });

  await t.test('8. Token metadata and cumulative total_minted tracking', () => {
    const issuer = env.getOrCreateUser(ISSUER);
    assert.equal(issuer.symbol, 5264217n);
    assert.equal(issuer.decimals, 9n);
    assert.equal(issuer.total_minted, 1_400_000n);
    assert.equal(env.totalMinted, 1_400_000n);

    const alice = env.getOrCreateUser(ALICE);
    assert.equal(alice.balance, 440_000n);

    const bob = env.getOrCreateUser(BOB);
    assert.equal(bob.balance, 790_000n);
    assert.equal(bob.total_minted, 0n);

    const charlie = env.getOrCreateUser(CHARLIE);
    assert.equal(charlie.balance, 120_000n);
  });
});
