import test from 'node:test';
import assert from 'node:assert/strict';

// Canonical Issuer Partition index in Psy Protocol
const ISSUER_PARTITION = 1n;

// Simulated Poseidon hash function over Goldilocks field elements
// In fixed encoding, unique creator and collision resistance assumption,
// guarantees computational namespace uniqueness.
function simulatePoseidon(creator, localId) {
  const p = 18446744069414584321n; // Goldilocks prime
  let state0 = (creator + 0x12345678n) % p;
  let state1 = (localId + 0x87654321n) % p;
  for (let r = 0; r < 8; r++) {
    state0 = (state0 * state0 * state0 * state0 * state0 + state1 + 0xdeadbeefn) % p;
    state1 = (state1 * state1 * state1 * state1 * state1 + state0 + 0xcafebaben) % p;
  }
  return (state0 ^ state1) % p;
}

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
        total_minted: 0n,
        symbol: 0n,
        base_uri_hash: [0n, 0n, 0n, 0n],
        owned_tokens: Array.from({ length: 128 }, () => ({ token_id: 0n, is_active: 0n, metadata_hash: [0n, 0n, 0n, 0n] })),
        outbox: new Map() // recipientId -> { token_id_0..3, metadata_hash_0..3, nonce_sent, nonce_claimed }
      });
    }
    return this.users.get(userId);
  }

  getOutbox(senderId, recipientId) {
    const sender = this.getOrCreateUser(senderId);
    if (!sender.outbox.has(recipientId)) {
      sender.outbox.set(recipientId, {
        token_id_0: 0n, metadata_hash_0: [0n, 0n, 0n, 0n],
        token_id_1: 0n, metadata_hash_1: [0n, 0n, 0n, 0n],
        token_id_2: 0n, metadata_hash_2: [0n, 0n, 0n, 0n],
        token_id_3: 0n, metadata_hash_3: [0n, 0n, 0n, 0n],
        nonce_sent: 0n,
        nonce_claimed: 0n
      });
    }
    return sender.outbox.get(recipientId);
  }

  setCollectionMetadata(callerId, symbol, baseUriHash) {
    assert.equal(callerId, ISSUER_PARTITION, 'only issuer partition can set collection metadata');
    const issuer = this.getOrCreateUser(ISSUER_PARTITION);
    assert.equal(issuer.is_mint_renounced, 0n, 'contract administration has been renounced');
    issuer.symbol = symbol;
    issuer.base_uri_hash = baseUriHash;
  }

  setMintAuthority(callerId, newAuthority) {
    assert.equal(callerId, ISSUER_PARTITION, 'only issuer partition can set mint authority');
    const issuer = this.getOrCreateUser(ISSUER_PARTITION);
    assert.equal(issuer.is_mint_renounced, 0n, 'minting has been renounced');
    assert.notEqual(newAuthority, 0n, 'use renounce_mint_authority to revoke');
    issuer.mint_authority = newAuthority;
  }

  renounceMintAuthority(callerId) {
    assert.equal(callerId, ISSUER_PARTITION, 'only issuer partition can renounce mint authority');
    const issuer = this.getOrCreateUser(ISSUER_PARTITION);
    assert.notEqual(issuer.mint_authority, 0n, 'mint authority not initialized');

    issuer.is_mint_renounced = 1n;
    issuer.mint_authority = 0n;
  }

  mint(callerId, slotIdx, localId, metadataHash = [0n, 0n, 0n, 0n]) {
    assert(slotIdx >= 0 && slotIdx < 128, 'slot index out of range');
    assert(localId > 0n, 'local_id must be non-zero');
    assert.equal(callerId, ISSUER_PARTITION, 'only issuer partition can mint');

    const issuer = this.getOrCreateUser(ISSUER_PARTITION);
    assert.equal(issuer.is_mint_renounced, 0n, 'minting has been renounced');
    assert.notEqual(issuer.mint_authority, 0n, 'mint authority not initialized in issuer partition');
    assert.equal(callerId, issuer.mint_authority, 'only authorized mint authority can mint');

    // Enforce strictly sequential local_id to guarantee no duplicate token_ids can ever be minted
    assert.equal(localId, issuer.total_minted + 1n, 'local_id must match next sequential mint index');

    const slot = issuer.owned_tokens[slotIdx];
    assert.equal(slot.is_active, 0n, 'slot already occupied');

    // Derive globally unique token_id via Poseidon hash: Poseidon(creator, local_id)
    const tokenId = simulatePoseidon(callerId, localId);
    assert.ok(tokenId > 0n, 'derived token_id must be non-zero');

    issuer.total_minted += 1n;
    issuer.owned_tokens[slotIdx] = { token_id: tokenId, is_active: 1n, metadata_hash: metadataHash };
    issuer.balance += 1n;

    this.verifyInvariants();
    return tokenId;
  }

  transfer(callerId, slotIdx, recipientId) {
    assert(slotIdx >= 0 && slotIdx < 128, 'slot index out of range');
    assert(recipientId > 0n, 'recipient cannot be zero address');
    assert.notEqual(callerId, recipientId, 'cannot transfer to self');
    assert(recipientId < 16777216n, 'recipient user_id exceeds outbox bounds');
    assert(callerId < 16777216n, 'caller user_id exceeds outbox bounds');

    const user = this.getOrCreateUser(callerId);
    const slot = user.owned_tokens[slotIdx];
    assert.equal(slot.is_active, 1n, 'no active NFT in slot');

    const outbox = this.getOutbox(callerId, recipientId);
    let acknowledgedClaimed = outbox.nonce_claimed;
    const localInFlight = outbox.nonce_sent - outbox.nonce_claimed;
    if (localInFlight >= 4n) {
      const recipientOutbox = this.getOutbox(recipientId, callerId);
      acknowledgedClaimed = recipientOutbox.nonce_claimed;
    }
    const inFlight = outbox.nonce_sent - acknowledgedClaimed;
    assert.ok(inFlight < 4n, 'FIFO outbox queue full: recipient has 4 uncollected transfers');

    const tokenId = slot.token_id;
    const metadataHash = slot.metadata_hash;
    user.owned_tokens[slotIdx] = { token_id: 0n, is_active: 0n, metadata_hash: [0n, 0n, 0n, 0n] };
    user.balance -= 1n;

    const queueSlot = Number(outbox.nonce_sent & 3n);
    outbox[`token_id_${queueSlot}`] = tokenId;
    outbox[`metadata_hash_${queueSlot}`] = metadataHash;
    outbox.nonce_sent += 1n;
    outbox.nonce_claimed = acknowledgedClaimed;

    this.verifyInvariants();
    return tokenId;
  }

  claim(callerId, slotIdx, senderId) {
    assert(slotIdx >= 0 && slotIdx < 128, 'slot index out of range');
    assert(senderId > 0n, 'sender cannot be zero address');
    assert.notEqual(callerId, senderId, 'cannot claim from self');
    assert(senderId < 16777216n, 'sender user_id exceeds inbox bounds');
    assert(callerId < 16777216n, 'caller user_id exceeds inbox bounds');

    const caller = this.getOrCreateUser(callerId);
    const slot = caller.owned_tokens[slotIdx];
    assert.equal(slot.is_active, 0n, 'destination slot already occupied');

    const senderOutbox = this.getOutbox(senderId, callerId);
    const myOutbox = this.getOutbox(callerId, senderId);

    assert.ok(senderOutbox.nonce_sent > myOutbox.nonce_claimed, 'no NFT to claim from sender');

    const queueSlot = Number(myOutbox.nonce_claimed & 3n);
    const tokenId = senderOutbox[`token_id_${queueSlot}`];
    const metadataHash = senderOutbox[`metadata_hash_${queueSlot}`];

    caller.owned_tokens[slotIdx] = { token_id: tokenId, is_active: 1n, metadata_hash: metadataHash };
    caller.balance += 1n;

    myOutbox.nonce_claimed += 1n;

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
  const ISSUER = 1n;
  const ALICE = 101n;
  const BOB = 202n;
  const CHARLIE = 303n;

  await t.test('1. Mint unique NFTs into available slots via Issuer Partition & on-chain Poseidon derivation', () => {
    // Non-issuer attempting to set collection metadata fails
    assert.throws(() => env.setCollectionMetadata(ALICE, 5264217n, [10n, 20n, 30n, 40n]), /only issuer partition/);

    // Non-issuer attempting to mint fails
    assert.throws(() => env.mint(ALICE, 0, 1n), /only issuer partition/);

    // Issuer (partition 0) initializes metadata and sets ISSUER as mint authority
    env.setCollectionMetadata(ISSUER, 5264217n, [10n, 20n, 30n, 40n]);
    env.setMintAuthority(ISSUER, ISSUER);

    // Issuer mints with strictly sequential local_id 1n and 2n; token_id is derived on-chain via Poseidon(ISSUER, local_id)
    const expectedId0 = simulatePoseidon(ISSUER, 1n);
    const expectedId1 = simulatePoseidon(ISSUER, 2n);

    const id0 = env.mint(ISSUER, 0, 1n);
    const id1 = env.mint(ISSUER, 1, 2n);

    assert.equal(id0, expectedId0);
    assert.equal(id1, expectedId1);

    const issuerState = env.getOrCreateUser(ISSUER);
    assert.equal(issuerState.balance, 2n);
    assert.equal(issuerState.owned_tokens[0].token_id, expectedId0);
    assert.equal(issuerState.owned_tokens[1].token_id, expectedId1);

    // Attempting to mint with non-sequential local_id fails
    assert.throws(() => env.mint(ISSUER, 2, 99n), /local_id must match next sequential mint index/);

    // Non-authorized Bob attempting to mint fails
    assert.throws(() => env.mint(BOB, 0, 3n), /only issuer partition/);
  });

  await t.test('2. Slot collision & bounds protections', () => {
    // Attempt to mint into already occupied slot 0 in Issuer partition
    assert.throws(() => env.mint(ISSUER, 0, 3n), /slot already occupied/);

    // Attempt to mint to out-of-range slot 128
    assert.throws(() => env.mint(ISSUER, 128, 3n), /slot index out of range/);

    // Attempt to transfer to user_id >= 16777216
    assert.throws(() => env.transfer(ISSUER, 0, 16777216n), /recipient user_id exceeds outbox bounds/);

    // Attempt to claim from user_id >= 16777216
    assert.throws(() => env.claim(ALICE, 0, 16777216n), /sender user_id exceeds inbox bounds/);
  });

  await t.test('3. Outbox transfer and recipient claim flow', () => {
    const expectedId0 = simulatePoseidon(ISSUER, 1n);

    // Issuer transfers NFT from slot 0 to Alice
    const transferredId = env.transfer(ISSUER, 0, ALICE);
    assert.equal(transferredId, expectedId0);
    assert.equal(env.getOrCreateUser(ISSUER).balance, 1n);
    assert.equal(env.getOrCreateUser(ISSUER).owned_tokens[0].is_active, 0n);

    // Alice claims NFT into Alice's slot 0
    const claimedId = env.claim(ALICE, 0, ISSUER);
    assert.equal(claimedId, expectedId0);
    assert.equal(env.getOrCreateUser(ALICE).balance, 1n);
    assert.equal(env.getOrCreateUser(ALICE).owned_tokens[0].token_id, expectedId0);

    // Alice transfers NFT from slot 0 to Bob
    env.transfer(ALICE, 0, BOB);
    env.claim(BOB, 0, ALICE);
    assert.equal(env.getOrCreateUser(BOB).balance, 1n);
    assert.equal(env.getOrCreateUser(BOB).owned_tokens[0].token_id, expectedId0);

    // Second claim without new transfer should fail
    assert.throws(() => env.claim(BOB, 1, ALICE), /no NFT to claim from sender/);
  });

  await t.test('3.1 True FIFO 4-slot sliding window: multi-transfer queueing, FIFO claim order, capacity limit at 4, and ACK recycling', () => {
    // Issuer mints 4 distinct NFTs in slots 2, 3, 4, 5 with sequential local_id 3n..6n
    const id3 = env.mint(ISSUER, 2, 3n);
    const id4 = env.mint(ISSUER, 3, 4n);
    const id5 = env.mint(ISSUER, 4, 5n);
    const id6 = env.mint(ISSUER, 5, 6n);

    // Issuer transfers all 4 NFTs to Bob sequentially without waiting for Bob to claim (multi-item in-flight)
    env.transfer(ISSUER, 2, BOB);
    env.transfer(ISSUER, 3, BOB);
    env.transfer(ISSUER, 4, BOB);
    env.transfer(ISSUER, 5, BOB);

    // 4 uncollected transfers in-flight: attempt to send a 5th NFT must fail due to FIFO queue capacity limit
    const id7 = env.mint(ISSUER, 6, 7n);
    assert.throws(() => env.transfer(ISSUER, 6, BOB), /FIFO outbox queue full: recipient has 4 uncollected transfers/);

    // Bob claims the first NFT -> must receive id3 (strict FIFO order)
    const claimedFirst = env.claim(BOB, 2, ISSUER);
    assert.equal(claimedFirst, id3);

    // Now that Bob claimed 1 NFT, Issuer's 5th transfer succeeds because slot was freed by Bob's claim
    env.transfer(ISSUER, 6, BOB);

    // Bob claims remaining NFTs in exact FIFO order: id4, id5, id6, and then the 5th (id7)
    assert.equal(env.claim(BOB, 3, ISSUER), id4);
    assert.equal(env.claim(BOB, 4, ISSUER), id5);
    assert.equal(env.claim(BOB, 5, ISSUER), id6);
    assert.equal(env.claim(BOB, 6, ISSUER), id7);

    // No more NFTs to claim
    assert.throws(() => env.claim(BOB, 7, ISSUER), /no NFT to claim from sender/);
  });

  await t.test('4. Chained transfer from Bob to Charlie', () => {
    const expectedId0 = simulatePoseidon(ISSUER, 1n);

    env.transfer(BOB, 0, CHARLIE);
    assert.equal(env.getOrCreateUser(BOB).balance, 5n);

    env.claim(CHARLIE, 10, BOB);
    assert.equal(env.getOrCreateUser(CHARLIE).balance, 1n);
    assert.equal(env.getOrCreateUser(CHARLIE).owned_tokens[10].token_id, expectedId0);
  });

  await t.test('5. Mint authority management and renunciation via Issuer Partition', () => {
    // Non-issuer renunciation fails
    assert.throws(() => env.renounceMintAuthority(ALICE), /only issuer partition/);

    // Issuer renounces authority
    env.renounceMintAuthority(ISSUER);
    assert.equal(env.getOrCreateUser(ISSUER).is_mint_renounced, 1n);
    assert.equal(env.getOrCreateUser(ISSUER).mint_authority, 0n);

    // Attempt to mint new NFT should now fail
    assert.throws(() => env.mint(ISSUER, 7, 8n), /minting has been renounced/);
  });

  await t.test('6. Collection metadata and per-token metadata_hash retention across transfer and claim', () => {
    const ERIN = 505n;
    const tokenHash = [11n, 22n, 33n, 44n];

    // In a new fresh environment
    const env2 = new Psy721VirtualEnvironment();
    env2.setCollectionMetadata(ISSUER, 5264217n, [100n, 200n, 300n, 400n]);
    env2.setMintAuthority(ISSUER, ISSUER);

    const mintedTokenId = env2.mint(ISSUER, 0, 1n, tokenHash);
    const issuerState = env2.getOrCreateUser(ISSUER);
    assert.equal(issuerState.total_minted, 1n);
    assert.deepEqual(issuerState.owned_tokens[0].metadata_hash, tokenHash);

    // Transfer from Issuer to Erin
    env2.transfer(ISSUER, 0, ERIN);
    assert.deepEqual(issuerState.owned_tokens[0].metadata_hash, [0n, 0n, 0n, 0n]);
    assert.deepEqual(env2.getOutbox(ISSUER, ERIN).metadata_hash_0, tokenHash);

    // Erin claims NFT
    env2.claim(ERIN, 0, ISSUER);
    const erinState = env2.getOrCreateUser(ERIN);
    assert.deepEqual(erinState.owned_tokens[0].metadata_hash, tokenHash);
    assert.equal(erinState.owned_tokens[0].token_id, mintedTokenId);
  });

  await t.test('7. Namespace uniqueness via Poseidon(creator, local_id) under collision resistance', () => {
    // Under fixed encoding, unique creator and collision resistance assumption:
    const CREATOR_A = 0xaaaa1111n;
    const CREATOR_B = 0xbbbb2222n;
    const LOCAL_ID = 42n;

    const globalIdA = simulatePoseidon(CREATOR_A, LOCAL_ID);
    const globalIdB = simulatePoseidon(CREATOR_B, LOCAL_ID);

    assert.notEqual(globalIdA, globalIdB, 'Distinct creators with identical local_id must yield distinct global token_ids');
    assert.ok(globalIdA > 0n && globalIdA < 18446744069414584321n, 'globalIdA must be within field bounds');
    assert.ok(globalIdB > 0n && globalIdB < 18446744069414584321n, 'globalIdB must be within field bounds');
  });
});
