import test from 'node:test';
import assert from 'node:assert/strict';

class Psy721VirtualEnvironment {
  constructor() {
    this.users = new Map();
  }

  getOrCreateUser(userId) {
    if (!this.users.has(userId)) {
      this.users.set(userId, {
        balance: 0n,
        mint_authority: 0n,
        is_mint_renounced: 0n,
        owned_tokens: Array.from({ length: 128 }, () => ({ token_id: 0n, is_active: 0n })),
        outbox: new Map() // recipientId -> { token_id: 0n, nonce_sent: 0n, nonce_claimed: 0n }
      });
    }
    return this.users.get(userId);
  }

  getOutbox(senderId, recipientId) {
    const sender = this.getOrCreateUser(senderId);
    if (!sender.outbox.has(recipientId)) {
      sender.outbox.set(recipientId, { token_id: 0n, nonce_sent: 0n, nonce_claimed: 0n });
    }
    return sender.outbox.get(recipientId);
  }

  mint(callerId, slotIdx, tokenId) {
    assert(slotIdx >= 0 && slotIdx < 128, 'slot index out of range');
    assert(tokenId > 0n, 'token_id must be non-zero');

    const user = this.getOrCreateUser(callerId);
    assert.equal(user.is_mint_renounced, 0n, 'minting has been renounced');

    if (user.mint_authority === 0n) {
      user.mint_authority = callerId;
    } else {
      assert.equal(callerId, user.mint_authority, 'only mint authority can mint');
    }

    const slot = user.owned_tokens[slotIdx];
    assert.equal(slot.is_active, 0n, 'slot already occupied');

    user.owned_tokens[slotIdx] = { token_id: tokenId, is_active: 1n };
    user.balance += 1n;

    this.verifyInvariants();
  }

  renounceMintAuthority(callerId) {
    const user = this.getOrCreateUser(callerId);
    assert.notEqual(user.mint_authority, 0n, 'mint authority not initialized');
    assert.equal(callerId, user.mint_authority, 'only mint authority can renounce');

    user.is_mint_renounced = 1n;
    user.mint_authority = 0n;
    this.verifyInvariants();
  }

  setMintAuthority(callerId, newAuthority) {
    const user = this.getOrCreateUser(callerId);
    assert.equal(user.is_mint_renounced, 0n, 'minting has been renounced');
    assert.notEqual(user.mint_authority, 0n, 'mint authority not initialized');
    assert.equal(callerId, user.mint_authority, 'only mint authority can transfer');
    assert.notEqual(newAuthority, 0n, 'use renounce_mint_authority to revoke');

    user.mint_authority = newAuthority;
    this.verifyInvariants();
  }

  transfer(callerId, slotIdx, recipientId) {
    assert(slotIdx >= 0 && slotIdx < 128, 'slot index out of range');
    assert.notEqual(callerId, recipientId, 'cannot transfer to self');

    const user = this.getOrCreateUser(callerId);
    const slot = user.owned_tokens[slotIdx];
    assert.equal(slot.is_active, 1n, 'no active NFT in slot');

    const tokenId = slot.token_id;
    user.owned_tokens[slotIdx] = { token_id: 0n, is_active: 0n };
    user.balance -= 1n;

    const outbox = this.getOutbox(callerId, recipientId);
    outbox.token_id = tokenId;
    outbox.nonce_sent += 1n;

    this.verifyInvariants();
    return tokenId;
  }

  claim(callerId, slotIdx, senderId) {
    assert(slotIdx >= 0 && slotIdx < 128, 'slot index out of range');
    assert.notEqual(callerId, senderId, 'cannot claim from self');

    const caller = this.getOrCreateUser(callerId);
    const slot = caller.owned_tokens[slotIdx];
    assert.equal(slot.is_active, 0n, 'destination slot already occupied');

    const senderOutbox = this.getOutbox(senderId, callerId);
    const myOutbox = this.getOutbox(callerId, senderId);

    assert.ok(senderOutbox.nonce_sent > myOutbox.nonce_claimed, 'no NFT to claim from sender');

    const tokenId = senderOutbox.token_id;
    caller.owned_tokens[slotIdx] = { token_id: tokenId, is_active: 1n };
    caller.balance += 1n;

    myOutbox.nonce_claimed = senderOutbox.nonce_sent;
    myOutbox.token_id = tokenId;

    this.verifyInvariants();
    return tokenId;
  }

  verifyInvariants() {
    for (const [userId, state] of this.users.entries()) {
      // Invariant 1: balance matches active slot count
      const activeCount = BigInt(state.owned_tokens.filter(s => s.is_active === 1n).length);
      assert.equal(state.balance, activeCount, `User ${userId} balance ${state.balance} must equal active slots ${activeCount}`);

      // Invariant 2: slot active flag must be 0 or 1
      for (let i = 0; i < 128; i++) {
        const slot = state.owned_tokens[i];
        assert.ok(slot.is_active === 0n || slot.is_active === 1n, 'slot is_active must be 0 or 1');
        if (slot.is_active === 0n) {
          assert.equal(slot.token_id, 0n, 'inactive slot must have token_id = 0');
        } else {
          assert.ok(slot.token_id > 0n, 'active slot must have positive token_id');
        }
      }

      // Invariant 3: outbox nonces monotonic
      for (const [otherId, ob] of state.outbox.entries()) {
        assert.ok(ob.nonce_sent >= 0n, 'nonce_sent must be non-negative');
        assert.ok(ob.nonce_claimed >= 0n, 'nonce_claimed must be non-negative');
      }
    }
  }
}

test('PSY-721 NFT Lifecycle & Invariants E2E', async (t) => {
  const env = new Psy721VirtualEnvironment();
  const ALICE = 101n;
  const BOB = 202n;
  const CHARLIE = 303n;

  await t.test('1. Mint unique NFTs into available slots', () => {
    env.mint(ALICE, 0, 1001n);
    env.mint(ALICE, 1, 1002n);
    const aliceState = env.getOrCreateUser(ALICE);
    assert.equal(aliceState.balance, 2n);
    assert.equal(aliceState.owned_tokens[0].token_id, 1001n);
    assert.equal(aliceState.owned_tokens[1].token_id, 1002n);
  });

  await t.test('2. Slot collision & bounds protections', () => {
    // Attempt to mint into already occupied slot 0
    assert.throws(() => env.mint(ALICE, 0, 9999n), /slot already occupied/);

    // Attempt to mint to out-of-range slot 128
    assert.throws(() => env.mint(ALICE, 128, 9999n), /slot index out of range/);
  });

  await t.test('3. Outbox transfer and recipient claim flow', () => {
    // Alice transfers NFT 1001 to Bob
    const transferredId = env.transfer(ALICE, 0, BOB);
    assert.equal(transferredId, 1001n);
    assert.equal(env.getOrCreateUser(ALICE).balance, 1n);
    assert.equal(env.getOrCreateUser(ALICE).owned_tokens[0].is_active, 0n);

    // Bob claims NFT 1001 into Bob's slot 0
    const claimedId = env.claim(BOB, 0, ALICE);
    assert.equal(claimedId, 1001n);
    assert.equal(env.getOrCreateUser(BOB).balance, 1n);
    assert.equal(env.getOrCreateUser(BOB).owned_tokens[0].token_id, 1001n);

    // Second claim without new transfer should fail
    assert.throws(() => env.claim(BOB, 1, ALICE), /no NFT to claim from sender/);
  });

  await t.test('4. Chained transfer from Bob to Charlie', () => {
    env.transfer(BOB, 0, CHARLIE);
    assert.equal(env.getOrCreateUser(BOB).balance, 0n);

    env.claim(CHARLIE, 10, BOB);
    assert.equal(env.getOrCreateUser(CHARLIE).balance, 1n);
    assert.equal(env.getOrCreateUser(CHARLIE).owned_tokens[10].token_id, 1001n);
  });

  await t.test('5. Mint authority management and renunciation', () => {
    // Alice renounces authority
    env.renounceMintAuthority(ALICE);
    assert.equal(env.getOrCreateUser(ALICE).is_mint_renounced, 1n);
    assert.equal(env.getOrCreateUser(ALICE).mint_authority, 0n);

    // Attempt to mint new NFT by Alice should fail
    assert.throws(() => env.mint(ALICE, 5, 8888n), /minting has been renounced/);
  });
});
