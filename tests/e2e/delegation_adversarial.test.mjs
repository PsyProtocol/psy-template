import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * PSY PROTOCOL DELEGATION ADVERSARIAL VERIFICATION SUITE
 * 
 * Models the linearizable protocol assumption used by the original cutoff
 * design. These five cases do not prove that the current staging node rejects
 * historical remote proofs. The cooperative-close model below covers the
 * revised contract's behavior when historical owner reads are accepted.
 * 
 * Invariants:
 * 1. Historical proofs against OPEN state cannot spend after Revocation.
 * 2. Finalized spend cannot be refunded to Owner.
 * 3. Freshness window (MAX_LAG) cannot bypass revocation cutoff.
 * 4. Stale/failed spend attempts cause zero state pollution across all parties.
 * 5. Outbox claims remain independent and succeed even after Channel closure.
 */

class DelegationAdversarialEnvironment {
  constructor() {
    this.currentCheckpoint = 100n;
    this.finalizedCheckpoint = 95n;
    this.MAX_LAG = 5n; // UX Freshness window

    // State Partitions
    this.owner = {
      id: 101n,
      balance: 1000n,
      channel: {
        id: 1n,
        spender: 202n,
        allocated: 0n,
        version: 0n,
        status: 'NONE', // NONE | OPEN | REVOKE_PENDING | CLOSED
        cutoffCheckpoint: 0n,
        refunded: 0n,
      }
    };

    this.spender = {
      id: 202n,
      balance: 0n,
      delegation_spent: new Map(), // channel_id -> spent_amount
      outbox: new Map(), // recipient_id -> { amount_sent: 0n, amount_claimed: 0n }
    };

    this.recipient = {
      id: 303n,
      balance: 0n,
      outbox: new Map(), // sender_id -> { amount_sent: 0n, amount_claimed: 0n }
    };
  }

  advanceCheckpoint(count = 1n) {
    this.currentCheckpoint += count;
  }

  finalizeUpToCheckpoint(cp) {
    assert(cp <= this.currentCheckpoint, 'Cannot finalize beyond current checkpoint');
    this.finalizedCheckpoint = cp;
  }

  openChannel(amount) {
    assert(this.owner.balance >= amount, 'Insufficient owner balance');
    this.owner.balance -= amount;
    this.owner.channel.allocated = amount;
    this.owner.channel.status = 'OPEN';
    this.owner.channel.cutoffCheckpoint = 0n;
    this.owner.channel.version += 1n;
  }

  /**
   * Request channel revocation. Sets cutoff checkpoint to ensure in-flight spends
   * either finalize or expire before refund settlement.
   */
  requestRevoke(settlementWindow = 2n) {
    assert.equal(this.owner.channel.status, 'OPEN', 'Channel must be OPEN to revoke');
    this.owner.channel.status = 'REVOKE_PENDING';
    this.owner.channel.cutoffCheckpoint = this.currentCheckpoint + settlementWindow;
  }

  /**
   * Finalize revocation and refund unspent tokens.
   * Can only execute once cutoff checkpoint is finalized.
   */
  finalizeRevoke(confirmedSpent) {
    assert.equal(this.owner.channel.status, 'REVOKE_PENDING', 'Revoke must be pending');
    assert(
      this.finalizedCheckpoint >= this.owner.channel.cutoffCheckpoint,
      `Cannot finalize revoke before cutoff checkpoint ${this.owner.channel.cutoffCheckpoint} is finalized (current finalized: ${this.finalizedCheckpoint})`
    );

    const refund = this.owner.channel.allocated - confirmedSpent;
    assert(refund >= 0n, 'Confirmed spent exceeds allocated');
    this.owner.balance += refund;
    this.owner.channel.refunded += refund;
    this.owner.channel.status = 'CLOSED';
    return refund;
  }

  /**
   * Spender generates a spend proof at proofCheckpoint and submits at submissionCheckpoint.
   */
  executeSpend({ proofCheckpoint, submissionCheckpoint, amount, recipientId }) {
    // 1. Availability check: proof cannot be older than MAX_LAG from submission
    if (proofCheckpoint < submissionCheckpoint - this.MAX_LAG) {
      throw new Error(`Stale proof: proof checkpoint ${proofCheckpoint} exceeds MAX_LAG (${this.MAX_LAG}) from submission ${submissionCheckpoint}`);
    }

    // 2. Cutoff / Stale-read check:
    // If owner initiated revocation before or at submission, proof must not reference pre-revocation state after cutoff
    if (this.owner.channel.status === 'REVOKE_PENDING' || this.owner.channel.status === 'CLOSED') {
      if (proofCheckpoint >= this.owner.channel.cutoffCheckpoint) {
        throw new Error('Spend rejected: channel is undergoing revocation / closed at this checkpoint');
      }
      // If proof was generated against historical OPEN state but owner already revoked
      if (submissionCheckpoint > this.owner.channel.cutoffCheckpoint) {
        throw new Error('Spend rejected: submission after revocation cutoff checkpoint');
      }
    }

    if (this.owner.channel.status === 'CLOSED') {
      throw new Error('Spend rejected: channel is CLOSED');
    }

    // Check spending capacity
    const channelId = this.owner.channel.id;
    const currentSpent = this.spender.delegation_spent.get(channelId) || 0n;
    if (currentSpent + amount > this.owner.channel.allocated) {
      throw new Error('Spend rejected: exceeds allocated channel allowance');
    }

    // State Mutation: Spender partition records spent
    this.spender.delegation_spent.set(channelId, currentSpent + amount);

    // Spender partition creates Outbox to recipient
    if (!this.spender.outbox.has(recipientId)) {
      this.spender.outbox.set(recipientId, { amount_sent: 0n, amount_claimed: 0n });
    }
    const ob = this.spender.outbox.get(recipientId);
    ob.amount_sent += amount;

    return { channelId, amount, recipientId };
  }

  claim(recipientId, senderId) {
    assert.equal(recipientId, this.recipient.id);
    assert.equal(senderId, this.spender.id);

    const senderOb = this.spender.outbox.get(recipientId);
    assert.ok(senderOb, 'No outbox found for recipient');

    if (!this.recipient.outbox.has(senderId)) {
      this.recipient.outbox.set(senderId, { amount_sent: 0n, amount_claimed: 0n });
    }
    const myOb = this.recipient.outbox.get(senderId);
    const claimable = senderOb.amount_sent - myOb.amount_claimed;
    assert(claimable > 0n, 'Nothing to claim');

    this.recipient.balance += claimable;
    myOb.amount_claimed = senderOb.amount_sent;
    return claimable;
  }
}

test('Delegation 5-Case Adversarial Verification Suite', async (t) => {

  /**
   * Case 1: B generates spend proof at k, A revokes at k+1, B submits after cutoff.
   * NOTE: This adversarial test verifies application-layer cutoff behavior assuming
   * protocol-level linearizability/freshness check is in place (or stale reads are rejected).
   * In psy-node without protocol-level stale-read rejection, historical OPEN proofs could
   * bypass application-layer status==2 cutoffs.
   */
  await t.test('Case 1: B generates spend proof at k, A revokes at k+1, B submits after cutoff -> MUST FAIL (under linearizability)', () => {
    const env = new DelegationAdversarialEnvironment();
    env.openChannel(100n); // A allocates 100 to B
    assert.equal(env.owner.balance, 900n);

    const k = env.currentCheckpoint; // 100n
    // A revokes at k+1, cutoff set to k+1 + 2 = 103n
    env.advanceCheckpoint(1n);
    env.requestRevoke(2n);
    assert.equal(env.owner.channel.cutoffCheckpoint, 103n);

    // B attempts to submit historical spend proof (generated at k) after cutoff at 104n
    env.advanceCheckpoint(3n); // current is 104n
    assert.throws(
      () => env.executeSpend({
        proofCheckpoint: k,
        submissionCheckpoint: 104n,
        amount: 30n,
        recipientId: env.recipient.id
      }),
      /Spend rejected: submission after revocation cutoff checkpoint/
    );

    // Verify zero state pollution
    assert.equal(env.spender.delegation_spent.get(1n) || 0n, 0n);
    assert.equal(env.spender.outbox.get(env.recipient.id), undefined);
    assert.equal(env.recipient.balance, 0n);
  });

  await t.test('Case 2: B Spend included & finalized first, A revokes after -> Confirmed spent CANNOT be refunded', () => {
    const env = new DelegationAdversarialEnvironment();
    env.openChannel(100n);

    // B spends 40 at checkpoint 100
    env.executeSpend({
      proofCheckpoint: 100n,
      submissionCheckpoint: 100n,
      amount: 40n,
      recipientId: env.recipient.id
    });
    assert.equal(env.spender.delegation_spent.get(1n), 40n);

    // Spend is finalized at checkpoint 101
    env.advanceCheckpoint(1n);
    env.finalizeUpToCheckpoint(101n);

    // A requests revoke at 102 with cutoff 104
    env.advanceCheckpoint(1n);
    env.requestRevoke(2n);

    // Advance and finalize past cutoff
    env.advanceCheckpoint(3n);
    env.finalizeUpToCheckpoint(105n);

    // A finalizes revoke: must refund exactly 100 - 40 = 60, never the full 100
    const refund = env.finalizeRevoke(40n);
    assert.equal(refund, 60n);
    assert.equal(env.owner.balance, 960n); // 900 + 60
    assert.equal(env.owner.channel.status, 'CLOSED');
  });

  await t.test('Case 3: A Revoke finalized first, B spends after -> MUST FAIL', () => {
    const env = new DelegationAdversarialEnvironment();
    env.openChannel(100n);

    env.requestRevoke(1n); // cutoff 101
    env.advanceCheckpoint(2n);
    env.finalizeUpToCheckpoint(102n);
    env.finalizeRevoke(0n); // Full refund 100
    assert.equal(env.owner.channel.status, 'CLOSED');
    assert.equal(env.owner.balance, 1000n);

    // B tries to spend after channel is CLOSED
    assert.throws(
      () => env.executeSpend({
        proofCheckpoint: 102n,
        submissionCheckpoint: 102n,
        amount: 50n,
        recipientId: env.recipient.id
      }),
      /Spend rejected: channel is undergoing revocation \/ closed/
    );
  });

  await t.test('Case 4: B Spend produces Outbox, Channel CLOSED, Recipient Claims -> MUST SUCCEED', () => {
    const env = new DelegationAdversarialEnvironment();
    env.openChannel(100n);

    // B spends 50 to C, creating Outbox
    env.executeSpend({
      proofCheckpoint: 100n,
      submissionCheckpoint: 100n,
      amount: 50n,
      recipientId: env.recipient.id
    });

    // A revokes and closes channel
    env.advanceCheckpoint(1n);
    env.requestRevoke(1n);
    env.advanceCheckpoint(2n);
    env.finalizeUpToCheckpoint(103n);
    env.finalizeRevoke(50n);
    assert.equal(env.owner.channel.status, 'CLOSED');

    // C claims the 50 tokens from B's Outbox after channel is closed
    const claimed = env.claim(env.recipient.id, env.spender.id);
    assert.equal(claimed, 50n);
    assert.equal(env.recipient.balance, 50n);
  });

  /**
   * Case 5: B generates at k, A revokes at k+1, current is k+2 (within MAX_LAG).
   * Verifies that under protocol-level freshness / linearizability, MAX_LAG cannot bypass cutoff.
   */
  await t.test('Case 5: B generates at k, A revokes at k+1, current is k+2 (within MAX_LAG) -> MUST STILL FAIL with zero pollution', () => {
    const env = new DelegationAdversarialEnvironment();
    env.openChannel(100n);

    const k = env.currentCheckpoint; // 100n
    // A revokes at 101 with cutoff 101 (immediate cutoff)
    env.advanceCheckpoint(1n);
    env.requestRevoke(0n); // cutoff = 101n

    // Current is 102n. Proof is from 100n.
    // Notice: 100n >= 102n - 5n (MAX_LAG=5 is satisfied for UX availability!)
    // BUT revocation safety MUST NOT rely on MAX_LAG. Cutoff MUST reject it!
    env.advanceCheckpoint(1n); // current is 102n
    assert.ok(k >= env.currentCheckpoint - env.MAX_LAG, 'Proof is within MAX_LAG window');

    assert.throws(
      () => env.executeSpend({
        proofCheckpoint: k,
        submissionCheckpoint: 102n,
        amount: 25n,
        recipientId: env.recipient.id
      }),
      /Spend rejected: submission after revocation cutoff checkpoint/
    );

    // Strict assertion: Zero state pollution across all 4 boundaries
    assert.equal(env.spender.delegation_spent.get(1n) || 0n, 0n, 'B.delegation_spent must NOT increase');
    assert.equal(env.spender.outbox.get(env.recipient.id), undefined, 'B.outbox must NOT increase');
    assert.equal(env.recipient.balance, 0n, 'C.balance must NOT increase');
    assert.equal(env.owner.channel.refunded, 0n, 'A.refund must NOT duplicate');
  });

  await t.test('Case 6: Real .psy Compiled Contract Artifacts & Dual-Ledger Delegation ABI Verification', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(fileURLToPath(new URL('.', import.meta.url)), '../..');

    const tokenAbiPath = join(root, 'token/target/token.abi.json');
    assert.ok(existsSync(tokenAbiPath), 'Compiled token.abi.json must exist');
    const tokenAbi = JSON.parse(readFileSync(tokenAbiPath, 'utf-8'));

    // Verify that the compiled artifact has a terminal spender ledger and
    // retains the separate map used by private-claim nullifiers.
    const stateNames = tokenAbi.contract.state.map(s => s.name);
    assert.equal(tokenAbi.contract.state.length, 21, 'Contract state must have exactly 21 fields');
    assert.ok(stateNames.includes('delegations'), 'Storage must include delegations');
    assert.ok(stateNames.includes('delegation_spends'), 'Storage must include spender-side close and spent ledger');
    assert.ok(stateNames.includes('state_map'), 'Storage must include state_map for private-claim nullifiers');

    // 2. Verify Spend Delegation inputs match dual-ledger signature: (owner, channel_idx, amount, recipient)
    const spendMethod = tokenAbi.contract.methods.find(m => m.name === 'spend_delegation');
    assert.ok(spendMethod, 'spend_delegation method must be compiled');
    assert.deepEqual(spendMethod.inputs.map(i => i.name), ['owner', 'channel_idx', 'amount', 'recipient']);

    // 3. Verify cooperative close and refund method signatures.
    const reqRevoke = tokenAbi.contract.methods.find(m => m.name === 'request_revoke_delegation');
    assert.ok(reqRevoke, 'request_revoke_delegation method must be compiled');
    assert.deepEqual(reqRevoke.inputs.map(i => i.name), ['channel_idx']);

    const finRevoke = tokenAbi.contract.methods.find(m => m.name === 'finalize_revoke_delegation');
    assert.ok(finRevoke, 'finalize_revoke_delegation method must be compiled');
    assert.deepEqual(finRevoke.inputs.map(i => i.name), ['channel_idx', 'spender']);
    const close = tokenAbi.contract.methods.find(m => m.name === 'close_delegation_channel');
    assert.ok(close, 'close_delegation_channel must be compiled');
    assert.deepEqual(close.inputs.map(i => i.name), ['owner', 'channel_idx', 'channel_version']);

    // 4. Verify DApp contract has identical dual-ledger ABI
    const dappAbiPath = join(root, 'dapp/contract/target/token.abi.json');
    assert.ok(existsSync(dappAbiPath), 'Compiled dapp contract token.abi.json must exist');
    const dappAbi = JSON.parse(readFileSync(dappAbiPath, 'utf-8'));
    assert.equal(dappAbi.contract.methods.length, tokenAbi.contract.methods.length);

    // The deployable v3 source has no checkpoint cutoff in the channel layout.
    const v3AbiPath = join(root, 'token/target/v3/abi.json');
    assert.ok(existsSync(v3AbiPath), 'v3 token ABI must be compiled in the test gate');
    const v3Abi = JSON.parse(readFileSync(v3AbiPath, 'utf-8'));
    const v3Channel = v3Abi.types.find(type => type.name === 'DelegationChannel');
    assert.deepEqual(v3Channel.fields.map(field => field.name),
      ['spender', 'allocated_amount', 'channel_version', 'status']);
    assert.equal(v3Abi.contract.state.find(field => field.name === 'delegations').type.length, 16);
    for (const method of ['open_delegation_channel', 'spend_delegation',
      'request_revoke_delegation', 'close_delegation_channel', 'finalize_revoke_delegation']) {
      assert.ok(v3Abi.contract.methods.some(item => item.name === method), `${method} missing from v3 ABI`);
    }
  });
});

test('Cooperative delegation preserves supply with historical owner reads', async (t) => {
  class HistoricalReadModel {
    constructor() {
      this.ownerBalance = 100n;
      this.recipientBalance = 0n;
      this.allocated = 0n;
      this.spent = 0n;
      this.version = 0n;
      this.closed = false;
      this.status = 'INACTIVE';
    }
    open(amount) {
      assert.equal(this.status === 'INACTIVE' || this.status === 'CLOSED', true);
      assert.ok(this.ownerBalance >= amount);
      this.ownerBalance -= amount;
      this.allocated = amount;
      this.spent = 0n;
      this.version += 1n;
      this.closed = false;
      this.status = 'OPEN';
    }
    spend(amount, historicalOwnerStatus = 'OPEN', proofVersion = this.version) {
      assert.equal(historicalOwnerStatus, 'OPEN'); // A historical owner proof may remain valid.
      assert.equal(proofVersion, this.version, 'historical delegation version cannot be reused');
      assert.equal(this.closed, false, 'spender-side close is terminal');
      assert.ok(this.spent + amount <= this.allocated);
      this.spent += amount;
      this.recipientBalance += amount;
    }
    requestRevoke() { this.status = 'REVOKE_PENDING'; }
    close() { this.closed = true; }
    finalize() {
      assert.equal(this.status, 'REVOKE_PENDING');
      assert.equal(this.closed, true, 'spender has not closed delegation channel');
      this.ownerBalance += this.allocated - this.spent;
      this.allocated = 0n;
      this.status = 'CLOSED';
    }
    assertSupply() {
      const escrow = this.status === 'OPEN' || this.status === 'REVOKE_PENDING'
        ? this.allocated - this.spent : 0n;
      assert.equal(this.ownerBalance + this.recipientBalance + escrow, 100n);
    }
  }

  await t.test('old OPEN proof can spend after owner requests revocation, before spender closes', () => {
    const m = new HistoricalReadModel();
    m.open(70n);
    m.requestRevoke();
    m.spend(20n, 'OPEN');
    m.assertSupply();
    assert.throws(() => m.finalize(), /spender has not closed/);
    m.close();
    assert.throws(() => m.spend(1n, 'OPEN'), /spender-side close is terminal/);
    m.finalize();
    m.assertSupply();
    assert.equal(m.ownerBalance, 80n);
    assert.equal(m.recipientBalance, 20n);
  });

  await t.test('noncooperation locks escrow; a past version cannot spend after reopening', () => {
    const m = new HistoricalReadModel();
    m.open(40n);
    m.requestRevoke();
    assert.throws(() => m.finalize(), /spender has not closed/);
    m.assertSupply();
    m.close();
    m.finalize();
    m.open(10n);
    assert.throws(() => m.spend(1n, 'OPEN', 1n), /historical delegation version cannot be reused/);
    m.assertSupply();
  });
});
