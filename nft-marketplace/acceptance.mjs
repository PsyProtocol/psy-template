// Read-only acceptance. Re-read chain receipts and delivery cursors; never retry
// a transaction or treat a submitted response as a completed settlement.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadOptions} from '../executor/config.mjs';
import {createPublicWalletAdapter} from '../executor/publicWalletAdapter.mjs';
import {publicState} from '../executor/publicState.mjs';
import {receiptReader} from '../executor/chainReceipts.mjs';
import {publishFile} from '../executor/durableFile.mjs';
import {inspectU124Submission} from '../executor/u124Submission.mjs';
import {MAX} from '../amm/u124/math.mjs';
import {decodeAmount} from '../amm/u124/client.mjs';
import {bindRequest} from '../executor/requestBinding.mjs';
import {makePolicy} from './policy.mjs';
import {readOrderStatus} from './status.mjs';
import {NFT} from './generate.mjs';
import {MAX_FELT} from './client.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const natural = x => {
 assert.match(String(x), /^(0|[1-9][0-9]*)$/, 'decimal amount');
 const value = BigInt(x);assert.ok(value <= MAX, 'U124 amount');return value;
};

// A verification run observes one transaction-list snapshot per URL. Included
// receipts and historical checkpoint leaves are immutable. This avoids reading
// the same history O(n²) times while checking many distinct transaction leaves.
export async function acceptanceReceiptReader(rpcConfig, {maxPages, fetchImpl = fetch} = {}) {
 const cache = new Map();
 const cachedFetch = async (url, options) => {
  const key = `${url}:${options?.body ?? ''}`;
  if (cache.has(key)) return new Response(cache.get(key), {status: 200, headers: {'content-type': 'application/json'}});
  const response = await fetchImpl(url, options);
  if (!response.ok) return response;
  const text = await response.clone().text();let value;
  try {value = JSON.parse(text);} catch {return response;}
  const list = !options?.body && String(url).includes('/api/v1/get/user/transactions?') && value.success === true && Array.isArray(value.data?.items);
  const included = !options?.body && String(url).includes('/api/v1/transaction/hash/') && value.success === true && value.data?.status === 'included';
  let historical = false;
  if (options?.body) {const body = JSON.parse(options.body);historical = body.method === 'psy_get_user_tree_leaf_hash' && Number.isSafeInteger(body.params?.checkpoint_id) && body.params.checkpoint_id > 0 && !value.error && typeof value.result === 'string';}
  if ((list || included || historical) && cache.size < 5000) cache.set(key, text);
  return response;
 };
 return receiptReader(rpcConfig, {maxPages, fetchImpl: cachedFetch});
}

export async function verifyAcceptance(options, evidence, {
 readState = publicState, readReceipts = acceptanceReceiptReader,
 createAdapter = createPublicWalletAdapter, driverDependencies,
 read = path => readFile(path), onProgress = () => {},
} = {}) {
 assert.equal(options.kind, 'nftmarket');assert.equal(evidence.version, 2, 'request-bound acceptance evidence version 2 required');
 const participants = evidence.users;
 assert.ok(Array.isArray(participants) && participants.length >= 3, 'three real participants required');
 const ids = participants.map(u => u.userId);
 assert.equal(new Set(ids).size, ids.length, 'duplicate participant');
 for (const id of ids) assert.ok(Number.isSafeInteger(id) && id > 0 && id < 16777216 && id !== options.vaultId, 'participant ID');
 assert.ok(ids.every(id => options.users.includes(id)), 'participant missing from executor configuration');
 assert.ok(ids.includes(evidence.issuerId), 'issuer required');
 const totalFT = natural(evidence.totalFT), totalNFT = natural(evidence.totalNFT);
 assert.ok(totalFT > 0n && totalNFT > 0n, 'positive test supply');
 assert.equal(participants.reduce((sum, u) => sum + natural(u.ft), 0n), totalFT, 'expected FT conservation');
 assert.equal(participants.reduce((sum, u) => sum + natural(u.nft), 0n), totalNFT, 'expected NFT conservation');

 const release = evidence.release;
 assert.ok(Array.isArray(release) && release.length, 'frozen release hashes required');
 assert.equal(new Set(release.map(f => resolve(f.path))).size, release.length, 'duplicate release file');
 for (const file of [options.wallet, options.rpcConfig, options.policy, options.abi, options.driverConfig, options.collection.abi, options.paymentToken.abi])
  assert.ok(release.some(f => resolve(f.path) === resolve(file)), 'missing release binding: ' + file);
 async function verifyRelease() {
  for (const file of release) {assert.match(file.sha256, /^[0-9a-f]{64}$/);assert.equal(hash(await read(file.path)), file.sha256, 'release changed: ' + file.path);}
 }
 await verifyRelease();
 assert.match(options.walletSha256??'',/^[0-9a-f]{64}$/,'reviewed driver digest required');
 assert.equal(hash(await read(options.wallet)),options.walletSha256,'unreviewed acceptance driver');
 const boundPolicy=JSON.parse(await read(options.policy));
 const boundConfig=JSON.parse(await read(options.driverConfig));
 assert.deepEqual(boundPolicy,makePolicy(options.contractId,boundConfig,JSON.parse(await read(options.abi)),JSON.parse(await read(options.collection.abi)),JSON.parse(await read(options.paymentToken.abi))),'acceptance policy differs from bound ABIs');
 // This verifies roots, ABI/policy shape, registered fingerprint and the
 // public key derived from the deliberately public SD-key.
 await createAdapter(options, driverDependencies);

 const reader = await readReceipts(options.rpcConfig, {maxPages: options.receiptMaxPages ?? 20});
 assert.ok(Array.isArray(evidence.receipts) && evidence.receipts.length, 'receipts required');
 const receipts = [], seen = new Set();
 for (const identity of evidence.receipts) {
  assert.ok(ids.includes(identity.userId) || identity.userId === options.vaultId, 'receipt participant');
  const key = `${identity.userId}:${identity.endUserLeafHash}`;assert.ok(!seen.has(key), 'duplicate receipt');seen.add(key);
  const receipt = await reader(identity);
  assert.equal(receipt.status, 'included', 'unconfirmed transaction');
  assert.equal(receipt.userId, identity.userId);assert.equal(receipt.endUserLeafHash, identity.endUserLeafHash);
  assert.equal(receipt.contentHash, identity.contentHash);assert.equal(receipt.checkpoint, identity.checkpoint);
  receipts.push({userId: receipt.userId, endUserLeafHash: receipt.endUserLeafHash, contentHash: receipt.contentHash, checkpoint: receipt.checkpoint});
  await onProgress({phase: 'receipt-verified', confirmed: receipts.length, total: evidence.receipts.length});
 }
 const operations = evidence.sdkOperations;
 assert.ok(Array.isArray(operations), 'SDK operation evidence required');
 const coverage = {}, operationLeaves = new Set();
 for (const operation of operations) {
  assert.ok(['activate', 'settle_sale', 'refund_listing', 'refund_buy'].includes(operation.kind), 'acceptance operation');
  const callsText = String(await read(operation.callsFile));
  const bound=bindRequest(callsText,boundPolicy,operation.kind);
  assert.ok(operation.callsFile.endsWith('/' + bound.callsSha256 + '.json'), 'content-addressed calls');
  assert.ok(operation.submissionLog.startsWith(operation.callsFile + '.submission-'), 'calls/log binding');
  assert.equal(typeof operation.guardFile,'string','submission guard evidence required');
  for (const path of [operation.callsFile, operation.submissionLog, operation.guardFile]) assert.ok(release.some(f => resolve(f.path) === resolve(path)), 'unsealed operation evidence');
  const guardBytes=await read(operation.guardFile),guardDocument=JSON.parse(guardBytes);
  assert.equal(guardDocument.version,1);assert.equal(guardDocument.network,options.network);assert.equal(guardDocument.marketId,options.contractId);
  assert.equal(guardDocument.vaultId,options.vaultId);assert.equal(guardDocument.fingerprint,options.fingerprint);assert.equal(guardDocument.publicKeyHash,options.publicKeyHash);
  assert.ok(Array.isArray(guardDocument.contracts),'guard contracts required');
  const required=[...new Set(boundPolicy.branches.flatMap(b=>b.calls.map(c=>c.contract_id)))].sort((a,b)=>a-b);
  assert.deepEqual(guardDocument.contracts.map(c=>c.contractId).sort((a,b)=>a-b),required,'acceptance guard dependency coverage');
  for(const [id,codeRoot,layoutRoot,height] of [[options.contractId,options.codeRoot,options.layoutRoot,31],[options.collection.contractId,options.collection.codeRoot,options.collection.layoutRoot,30],[options.paymentToken.contractId,options.paymentToken.codeRoot,options.paymentToken.layoutRoot,31]]){
   const c=guardDocument.contracts.find(c=>c.contractId===id);assert.equal(c.codeRoot,codeRoot);assert.equal(c.layoutRoot,layoutRoot);assert.equal(c.stateTreeHeight,height);
  }
  const inspected = inspectU124Submission(String(await read(operation.submissionLog)), {...options,requireGuard:true,callsSha256:bound.callsSha256,guardSha256:hash(guardBytes)});
  assert.ok(inspected.endUserLeafHash && !inspected.rejected, 'verified broadcast required');
  assert.ok(!operationLeaves.has(inspected.endUserLeafHash), 'duplicate SDK broadcast');operationLeaves.add(inspected.endUserLeafHash);
  assert.ok(receipts.some(r => r.userId === options.vaultId && r.endUserLeafHash === inspected.endUserLeafHash), 'SDK receipt/log binding');
  assert.ok(!operations.slice(0, operations.indexOf(operation)).some(o => o.submissionLog === operation.submissionLog), 'duplicate SDK operation');
  coverage[operation.kind] = (coverage[operation.kind] ?? 0) + 1;
 }
 for (const [kind, minimum] of Object.entries({activate: 1, settle_sale: 2, refund_listing: 1, refund_buy: 2}))
  assert.ok(coverage[kind] >= minimum, 'missing live coverage: ' + kind);

 const state = await readState(options.rpcConfig);
 assert.equal(state.networkName, options.network);
 assert.ok(state.checkpoint >= Math.max(...receipts.map(r => r.checkpoint)), 'state precedes receipts');
 const abi = JSON.parse(await read(options.abi)), config = JSON.parse(await read(options.driverConfig));
 const tokenAbi = JSON.parse(await read(options.paymentToken.abi));
 const ft = u => Promise.all([state.slot(u, config.tokenId, 0), state.slot(u, config.tokenId, 1)]).then(decodeAmount);
 const balances = [], statuses = [], tokenIds = new Set();
 for (const participant of participants) {
  const [balanceFT, balanceNFT] = await Promise.all([ft(participant.userId), state.slot(participant.userId, config.nftId, 0)]);
  assert.equal(balanceFT, natural(participant.ft), 'actual FT balance');assert.equal(balanceNFT, natural(participant.nft), 'actual NFT balance');
  assert.ok(Array.isArray(participant.owned), 'expected NFT ownership required');
  assert.equal(BigInt(participant.owned.length), balanceNFT, 'NFT inventory/count mismatch');
  const ownedSlots = new Set();
  for (const item of participant.owned) {
   assert.ok(Number.isSafeInteger(item.slot) && item.slot >= 0 && item.slot < 128 && !ownedSlots.has(item.slot), 'NFT slot');ownedSlots.add(item.slot);
   assert.ok(Array.isArray(item.tokenId) && item.tokenId.length === 4, 'NFT identity shape');
   const tokenId = item.tokenId.map(x => String(natural(x))).join(':');assert.ok(!tokenIds.has(tokenId), 'duplicate owned NFT identity');tokenIds.add(tokenId);
   const offset = NFT.owned + 9 * item.slot;
   assert.equal(await state.slot(participant.userId, config.nftId, offset + 4), 1n, 'NFT slot inactive');
   for (const [name, start] of [['tokenId', 0], ['metadataHash', 5]]) {
    assert.ok(Array.isArray(item[name]) && item[name].length === 4, 'NFT identity shape');
    for (let limb = 0; limb < 4; limb++) {
     const expected = natural(item[name][limb]);assert.ok(expected <= MAX_FELT, 'NFT identity limb');
     assert.equal(await state.slot(participant.userId, config.nftId, offset + start + limb), expected, 'NFT identity/metadata changed');
    }
   }
  }
  balances.push({userId: participant.userId, ft: String(balanceFT), nft: String(balanceNFT)});
  const status = await readOrderStatus(state, {contractId: options.contractId, vaultId: options.vaultId, userId: participant.userId, abi, config});
  assert.equal(status.status, participant.status, 'terminal order status');assert.equal(status.nonce, natural(participant.nonce));
  assert.equal(status.final, true);assert.equal(status.deliveryComplete, true, 'recipient has not claimed all outputs');statuses.push(status);
 }
 assert.equal(await ft(options.vaultId), 0n, 'vault retains FT');assert.equal(await state.slot(options.vaultId, config.nftId, 0), 0n, 'vault retains NFT');
 const supply = tokenAbi.contract.state.find(f => f.name === 'total_supply').offset;
 assert.equal(decodeAmount(await Promise.all([state.slot(evidence.issuerId, config.tokenId, supply), state.slot(evidence.issuerId, config.tokenId, supply + 1)])), totalFT, 'minted FT supply');
 assert.equal(await state.slot(evidence.issuerId, config.nftId, 4), totalNFT, 'minted NFT supply');
 await verifyRelease();
 return {version: 2, verifiedAt: new Date().toISOString(), network: options.network, contractId: options.contractId, vaultId: options.vaultId,
  checkpoint: state.checkpoint, engineeringAcceptanceVerified: true, productionReady: false,
  remainingGates: ['independent-security-audit', 'upgrade-authority-and-on-chain-root-binding-review', 'sustained-availability-and-chain-capacity-acceptance'],
  coverage, receipts, balances, statuses, release};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const args = process.argv.slice(2);assert.equal(args.length, 6, '--config file --evidence file --out fresh-file');
 const flags = new Map();for (let i = 0; i < args.length; i += 2) {assert.ok(['--config', '--evidence', '--out'].includes(args[i]) && !flags.has(args[i]));flags.set(args[i], args[i + 1]);}
 const options = await loadOptions(flags.get('--config'));
 const {execFile} = await import('node:child_process');const {promisify} = await import('node:util');
 const result = await verifyAcceptance(options, JSON.parse(await readFile(flags.get('--evidence'), 'utf8')), {driverDependencies: {runDriver: promisify(execFile)}, onProgress: status => console.error(JSON.stringify(status))});
 await publishFile(resolve(flags.get('--out')), JSON.stringify(result, (_k, v) => typeof v === 'bigint' ? String(v) : v, 2) + '\n');
 console.log(JSON.stringify({engineeringAcceptanceVerified: result.engineeringAcceptanceVerified, productionReady: result.productionReady, checkpoint: result.checkpoint}));
}
