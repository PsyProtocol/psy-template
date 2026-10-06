import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { decodeFeltSlot } from './matcherCore.mjs';
import { PSY, PUSDT } from './operationCalls.mjs';
import { retryRead } from '../executor/readRetry.mjs';

const execFile = promisify(execFileCallback);
const TOKEN_OUTBOX_OFFSET = 3;
const TOKEN_OUTBOX_ITEM_SIZE = 2;

export class OrderbookChainReader {
  constructor({ cli, rpcConfig, abi, contractId, escrowId, runCommand = execFile, readRetryOptions }) {
    this.cli = cli;
    this.rpcConfig = rpcConfig;
    this.contractId = contractId;
    this.escrowId = escrowId;
    this.fields = new Map(abi.contract.state.map(field => [field.name, field]));
    this.runCommand = runCommand;
    this.readRetryOptions = readRetryOptions;
    this.leaves = new Map();
    this.activeQueries = 0;
    this.waiters = [];
  }

  async #query(args) {
    if (this.activeQueries >= 4) await new Promise(resolve => this.waiters.push(resolve));
    this.activeQueries++;
    let dir;
    try {
      dir = await mkdtemp(join(tmpdir(), 'psy-orderbook-read-'));
      const resultFile = join(dir, 'result.json');
      await retryRead(async () => {
        try {
          await this.runCommand(this.cli, [...args, '--rpc-config', this.rpcConfig, '--result-file', resultFile], {
            timeout: 120_000, maxBuffer: 2_000_000,
          });
        } catch (error) {
          // This class only invokes get-* commands. Reclassify explicit CLI
          // transport failures so the watch loop can recover without a write.
          if (/Connection error to https?:\/\//.test(error.stderr ?? '')) {
            throw new TypeError('public CLI read connection failed', { cause: error });
          }
          throw error;
        }
      }, this.readRetryOptions);
      return JSON.parse(await readFile(resultFile, 'utf8'));
    } finally {
      try {
        if (dir) await rm(dir, { recursive: true, force: true });
      } finally {
        this.activeQueries--;
        this.waiters.shift()?.();
      }
    }
  }

  async latestCheckpoint() {
    const result = await this.#query(['get-latest-block-state']);
    const checkpoint = result?.block_state?.checkpoint_id;
    if (!Number.isSafeInteger(checkpoint)) throw new Error('invalid latest checkpoint');
    return checkpoint;
  }

  async readSlot(checkpoint, userId, contractId, slot) {
    const leafId = Math.floor(slot / 4);
    const key = `${checkpoint}:${userId}:${contractId}:${leafId}`;
    if (!this.leaves.has(key)) {
      this.leaves.set(key, this.#query([
        'get-user-contract-state-tree-merkle-proof',
        '--checkpoint-id', String(checkpoint), '--user-id', String(userId),
        '--contract-id', String(contractId), '--leaf-id', String(leafId),
      ]).then(result => {
        const proof = result?.merkle_proof;
        if (proof?.index !== leafId || typeof proof.value !== 'string') throw new Error(`invalid Merkle proof for ${key}`);
        return proof.value;
      }));
    }
    return decodeFeltSlot(await this.leaves.get(key), slot);
  }

  #field(name, index = null) {
    const field = this.fields.get(name);
    if (!field) throw new Error(`ABI field missing: ${name}`);
    if (index === null) return field.offset;
    if (!Number.isSafeInteger(index) || index < 0 || index >= field.type.length) throw new RangeError(`invalid ${name} index`);
    return field.offset + index * field.type.item_felt_size;
  }

  async readOrder(checkpoint, sellerId) {
    if (!Number.isSafeInteger(sellerId) || sellerId < 1 || sellerId >= 16_777_216 || sellerId === this.escrowId) {
      throw new RangeError('invalid seller ID');
    }
    const fieldNames = ['order_kind', 'order_pool_user', 'order_sell_asset', 'order_sell_amount',
      'order_min_buy', 'order_deadline', 'order_nonce'];
    const fields = await Promise.all(fieldNames.map(name => this.readSlot(checkpoint, sellerId, this.contractId, this.#field(name))));
    const [kind, poolUser, asset, sellAmount, minBuy, deadline, nonce] = fields;
    const [consumedNonce, settledPsy, settledUsdt, sentPsy, sentUsdt] = await Promise.all([
      this.readSlot(checkpoint, this.escrowId, this.contractId, this.#field('active_consumed_nonce', sellerId)),
      this.readSlot(checkpoint, this.escrowId, this.contractId, this.#field('active_settled_psy_sent', sellerId)),
      this.readSlot(checkpoint, this.escrowId, this.contractId, this.#field('active_settled_usdt_sent', sellerId)),
      this.readSlot(checkpoint, sellerId, PSY, TOKEN_OUTBOX_OFFSET + TOKEN_OUTBOX_ITEM_SIZE * this.escrowId),
      asset === BigInt(PUSDT)
        ? this.readSlot(checkpoint, sellerId, PUSDT, TOKEN_OUTBOX_OFFSET + TOKEN_OUTBOX_ITEM_SIZE * this.escrowId)
        : Promise.resolve(0n),
    ]);
    return { sellerId, kind, poolUser, asset, sellAmount, minBuy, deadline, nonce,
      consumedNonce, settledPsy, settledUsdt, sentPsy, sentUsdt };
  }
}
