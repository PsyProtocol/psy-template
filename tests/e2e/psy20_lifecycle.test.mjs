import test from 'node:test';
import assert from 'node:assert/strict';

// Mathematical & State Transition Model of PSY-20 over Partitioned State Tree
class Psy20VirtualEnvironment {
  constructor() {
    this.users = new Map(); // userId -> UserState
    this.totalMinted = 0n;
    this.totalBurned = 0n;
    this.totalShieldedNotes = 0n;
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
        delegations: Array.from({ length: 16 }, () => ({ spender: 0n, allocated_amount: 0n, spent_amount: 0n })),
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
    const user = this.getOrCreateUser(callerId);
    assert.equal(user.is_mint_renounced, 0n, 'token administration has been renounced');
    if (user.mint_authority === 0n) {
      user.mint_authority = callerId;
    } else {
      assert.equal(callerId, user.mint_authority, 'only authority can set metadata');
    }
    assert(decimals <= 18n, 'decimals exceed max precision');
    user.symbol = symbol;
    user.decimals = decimals;
  }

  mint(callerId, amount) {
    assert(amount > 0n, 'amount must be positive');
    const user = this.getOrCreateUser(callerId);
    assert.equal(user.is_mint_renounced, 0n, 'minting has been renounced');

    if (user.mint_authority === 0n) {
      user.mint_authority = callerId;
    } else {
      assert.equal(callerId, user.mint_authority, 'only mint authority can mint');
    }

    user.balance += amount;
    user.total_minted += amount;
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
    const user = this.getOrCreateUser(callerId);
    assert.equal(user.is_mint_renounced, 0n, 'minting has been renounced');
    assert.notEqual(user.mint_authority, 0n, 'mint authority not initialized');
    assert.equal(callerId, user.mint_authority, 'only mint authority can transfer');
    assert.notEqual(newAuthority, 0n, 'new authority cannot be zero');

    user.mint_authority = newAuthority;
    this.verifyInvariants();
  }

  renounceMintAuthority(callerId) {
    const user = this.getOrCreateUser(callerId);
    assert.equal(callerId, user.mint_authority, 'only mint authority can renounce');

    user.is_mint_renounced = 1n;
    user.mint_authority = 0n;
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
    assert(channelIdx >= 0 && channelIdx < 16, 'channel idx out of range');
    assert.notEqual(callerId, spenderId, 'cannot delegate to self');
    assert(amount > 0n, 'amount must be positive');
    const user = this.getOrCreateUser(callerId);
    assert.ok(user.balance >= amount, 'insufficient balance for delegation');

    user.balance -= amount;
    user.delegations[channelIdx] = {
      spender: spenderId,
      allocated_amount: amount,
      spent_amount: 0n
    };

    this.verifyInvariants();
  }

  spendDelegation(callerId, ownerId, channelIdx, amount) {
    const owner = this.getOrCreateUser(ownerId);
    const ch = owner.delegations[channelIdx];
    assert.equal(ch.spender, callerId, 'caller is not channel spender');
    assert.ok(ch.allocated_amount - ch.spent_amount >= amount, 'exceeds delegation allowance');

    ch.spent_amount += amount;
    const spender = this.getOrCreateUser(callerId);
    spender.balance += amount;

    this.verifyInvariants();
  }

  revokeDelegationChannel(callerId, channelIdx) {
    assert(channelIdx >= 0 && channelIdx < 16, 'channel idx out of range');
    const user = this.getOrCreateUser(callerId);
    const ch = user.delegations[channelIdx];
    assert.notEqual(ch.spender, 0n, 'channel not active');

    const unspent = ch.allocated_amount - ch.spent_amount;
    user.balance += unspent;
    user.delegations[channelIdx] = { spender: 0n, allocated_amount: 0n, spent_amount: 0n };

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

  verifyInvariants() {
    let totalBalances = 0n;
    let totalEscrowInChannels = 0n;

    for (const [userId, state] of this.users.entries()) {
      assert.ok(state.balance >= 0n, `user ${userId} balance cannot be negative`);
      totalBalances += state.balance;

      for (let i = 0; i < 16; i++) {
        const ch = state.delegations[i];
        assert.ok(ch.spent_amount <= ch.allocated_amount, 'spent exceeds allocated');
        totalEscrowInChannels += (ch.allocated_amount - ch.spent_amount);
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
  const ALICE = 101n;
  const BOB = 202n;
  const CHARLIE = 303n;
  const SPENDER = 999n;

  await t.test('1. Minting and authority establishment', () => {
    env.mint(ALICE, 1_000_000n);
    const aliceState = env.getOrCreateUser(ALICE);
    assert.equal(aliceState.balance, 1_000_000n);
    assert.equal(aliceState.mint_authority, ALICE);
    assert.equal(aliceState.is_mint_renounced, 0n);
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

  await t.test('4. Sandboxed delegation channel lifecycle', () => {
    // Alice delegates 80,000 to Spender on channel 0
    env.openDelegationChannel(ALICE, 0, SPENDER, 80_000n);
    assert.equal(env.getOrCreateUser(ALICE).balance, 520_000n);

    // Spender uses 30,000 from channel 0
    env.spendDelegation(SPENDER, ALICE, 0, 30_000n);
    assert.equal(env.getOrCreateUser(SPENDER).balance, 30_000n);

    // Alice revokes channel 0; unspent 50,000 refunded
    env.revokeDelegationChannel(ALICE, 0);
    assert.equal(env.getOrCreateUser(ALICE).balance, 570_000n);
  });

  await t.test('5. Shielded Private Transfer into Note Commitment Tree', () => {
    const receiverShielded = [1n, 2n, 3n, 4n];
    const secret = [5n, 6n, 7n, 8n];
    const note = env.privateTransfer(ALICE, receiverShielded, 70_000n, secret);
    assert.equal(note.noteIndex, 0n);
    assert.equal(env.getOrCreateUser(ALICE).balance, 500_000n);
    assert.equal(env.getOrCreateUser(ALICE).note_count, 1n);
  });

  await t.test('6. Burn tokens', () => {
    env.burn(ALICE, 50_000n);
    assert.equal(env.getOrCreateUser(ALICE).balance, 450_000n);
  });

  await t.test('7. Authority transfer, subsequent mint, and irrevocable renunciation', () => {
    // Alice transfers mint authority to Bob
    env.setMintAuthority(ALICE, BOB);
    assert.equal(env.getOrCreateUser(ALICE).mint_authority, BOB);

    // Bob mints 400,000 tokens
    env.mint(BOB, 400_000n);
    assert.equal(env.getOrCreateUser(BOB).balance, 700_000n);

    // Bob renounces mint authority permanently
    env.renounceMintAuthority(BOB);
    assert.equal(env.getOrCreateUser(BOB).is_mint_renounced, 1n);
    assert.equal(env.getOrCreateUser(BOB).mint_authority, 0n);

    // Any attempt to mint now must strictly fail
    assert.throws(() => env.mint(BOB, 100n), /minting has been renounced/);
    assert.throws(() => env.mint(ALICE, 100n), /only mint authority can mint/);
  });

  await t.test('8. Token metadata and cumulative total_minted tracking', () => {
    const CHARLIE = 300n;
    env.setMetadata(CHARLIE, 5264217n, 9n);
    const charlie = env.getOrCreateUser(CHARLIE);
    assert.equal(charlie.symbol, 5264217n);
    assert.equal(charlie.decimals, 9n);

    env.mint(CHARLIE, 10_000n);
    assert.equal(charlie.total_minted, 10_000n);
    env.mint(CHARLIE, 5_000n);
    assert.equal(charlie.total_minted, 15_000n);
    env.burn(CHARLIE, 2_000n);
    assert.equal(charlie.balance, 13_000n);
    // Cumulative minted remains 15_000n regardless of burns
    assert.equal(charlie.total_minted, 15_000n);
  });
});
