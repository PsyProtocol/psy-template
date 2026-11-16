// Opt-in source candidate only. Nothing imports this module in production.
// Host checks and source generation are not VM, SD-key or full-UPS acceptance.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generateBatch, methodSpans} from '../../batching/v2/generate.mjs';

export const NFT_IDENTITY_BUY_PROFILE = 'selected-nft-identity-buy-v1';
export const NFT_IDENTITY_BUY_METHOD = 'open_buy_identity_v1';
export const NFT_IDENTITY_BUY_FELTS = 17;
export const FROZEN_CAPACITY = Object.freeze({
  sdkCommit: '01b8f2b0a077367a7b9879baba1a72aea8ab5510',
  clientCommit: '7058070057c3242b5d8b29e1a31d498aaa4202c0',
  calldataWords: 128,
  files: Object.freeze({
    'client_prover/psy_core/psy_data/src/dpn/sd_key.rs': '7cef058358c19c94fa5dcb0e9179718c3f62d44dfbc3aebfdd08ff5c06dfa4e6',
    'client_prover/psy_compiler/src/abi/mod.rs': 'cb5f4055d66e0b8b50caad8e22d558c7adc29156992abe256a485afe1a7e5db2',
    'client_prover/psy_compiler/src/types/layout.rs': 'fdc4083ebde9d312d4ece45bb6ddd24e840aad5d7576fb2513da1c278bcb40c8',
    'client_prover/psy_vm/src/dpn/vm/exec.rs': '6d3adb4d9e5dc2327d36d4a4523c06744ddc480c4ec97416aaae5133b7217e8d',
  }),
});
const DOMAIN = '1384803358401154921';
const FELT_MAX = 18446744069414584320n;
const LIMB_MAX = (1n << 62n) - 1n;
const CHECKPOINT_MAX = (1n << 32n) - 1n;
const USER_MAX = (1n << 24n) - 1n;
const U124_MAX = (1n << 124n) - 1n;
const LEGACY_SIGNATURE = '#[contract_method]\npub fn open_buy(&mut self, ctx: &mut ChainContext, pool: Felt, seller: Felt, listing_nonce: Felt, price: [Felt; 2], deadline: Felt, nonce: Felt) ';
const sha = text => createHash('sha256').update(text).digest('hex');

function configuration(config) {
  assert.ok(config && typeof config === 'object' && !Array.isArray(config));
  assert.deepEqual(Object.keys(config).sort(), ['networkMagic', 'nftId', 'tokenId', ...(Object.hasOwn(config, 'ordering') ? ['ordering'] : [])].sort(), 'explicit selected NFT configuration');
  assert.equal(config.networkMagic, DOMAIN, 'frozen network domain');
  if (Object.hasOwn(config, 'ordering')) assert.equal(config.ordering, 'deterministic');
  for (const role of ['nftId', 'tokenId'])
    assert.ok(Number.isSafeInteger(config[role]) && config[role] >= 5 && config[role] <= Number(USER_MAX), 'contract identity ' + role);
  assert.notEqual(config.nftId, config.tokenId, 'distinct collection and payment contracts');
}

// Only the exact current generated selected-order source is an eligible base.
// Old deployments and already frozen batches are never transformed in place.
export function transformIdentityBuySource(source, config) {
  configuration(config);
  assert.equal(source, generateBatch('nftmarket', config), 'exact fresh selected-order source required');
  const methods = methodSpans(source);
  const matches = methods.filter(m => m.name === 'open_buy');
  assert.equal(matches.length, 1, 'single legacy buy entry');
  assert.ok(!methods.some(m => m.name === NFT_IDENTITY_BUY_METHOD), 'candidate must not already exist');
  const buy = matches[0]; assert.equal(buy.signature, LEGACY_SIGNATURE, 'reviewed buy signature');
  const write = buy.body.search(/\bself\.[A-Za-z_]\w*\s*=(?!=)/);
  assert.ok(write >= 0, 'ordinary buyer writes required');
  assert.ok(!buy.body.slice(write).includes('ctx.users['), 'foreign reads must precede local writes');
  const identity = [
    '// Bind the approved identity to the same authenticated seller listing',
    '// read by this call. Recipient remains the signing buyer, as before.',
    `require(collection_id == ${config.nftId}, "approved collection mismatch");`,
    'require(recipient == ctx.user_id, "approved NFT recipient must be caller");',
    'require(expected_token_id[0] != 0 || expected_token_id[1] != 0 || expected_token_id[2] != 0 || expected_token_id[3] != 0, "zero approved token identity");',
    ...Array.from({length: 4}, (_, i) => [
      `let identity_buy_token_${i} = ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).token_id_${i};`,
      `let identity_buy_metadata_${i} = ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).metadata_hash_${i};`,
      `require(identity_buy_token_${i} == expected_token_id[${i}], "approved token identity mismatch");`,
      `require(identity_buy_metadata_${i} == expected_metadata_hash[${i}], "approved metadata mismatch");`,
    ]).flat(),
  ].join('\n') + '\n';
  const signature = LEGACY_SIGNATURE.replace('fn open_buy(', `fn ${NFT_IDENTITY_BUY_METHOD}(`)
    .replace('nonce: Felt) ', 'nonce: Felt, collection_id: Felt, recipient: Felt, expected_token_id: Hash, expected_metadata_hash: Hash) ');
  const replacement = signature + '{' + buy.body.slice(0, write) + identity + buy.body.slice(write) + '}';
  const candidate = source.slice(0, buy.start) + replacement + source.slice(buy.end);
  const generated = methodSpans(candidate);
  assert.equal(generated.filter(m => m.name === NFT_IDENTITY_BUY_METHOD).length, 1);
  assert.ok(!generated.some(m => m.name === 'open_buy'), 'unbound buy entry must not survive');
  // All pricing, selected membership, buyer priority, sale, refund, recovery,
  // layout and other methods retain their exact existing generated source.
  assert.equal(candidate.slice(0, buy.start), source.slice(0, buy.start));
  assert.equal(candidate.slice(buy.start + replacement.length), source.slice(buy.end));
  return candidate;
}

export function generateIdentityBuyCandidate(config) {
  configuration(config);
  const original = generateBatch('nftmarket', config);
  const source = transformIdentityBuySource(original, config);
  return {source, manifest: {
    schema: 1, profile: NFT_IDENTITY_BUY_PROFILE, method: NFT_IDENTITY_BUY_METHOD,
    inputFeltCount: NFT_IDENTITY_BUY_FELTS, sdkCapacity: FROZEN_CAPACITY,
    config: structuredClone(config), sourceSha256: sha(source), baseSourceSha256: sha(original),
    executionScope: 'explicit-selected-orders-v1', recipientRule: 'signing-buyer-only',
    newContractRequired: true, newKeyRequired: true, legacyBuyEntryRetained: false,
    sourceOnly: true, compiled: false, vmVerified: false, sdKeyProofVerified: false,
    fullUpsVerified: false, liveAccepted: false, financialOperations: 0,
    wholeMarketCompleteness: false, qualifiedRandomness: false,
  }};
}

function integer(value, max, name, positive = false) {
  assert.ok(typeof value === 'bigint' && value >= (positive ? 1n : 0n) && value <= max, 'canonical ' + name);
}
function hash(value, name, nonzero = false) {
  assert.ok(Array.isArray(value) && value.length === 4, name + ' requires four words');
  let hasNonzero = false; const snapshot = [];
  for (let i = 0; i < 4; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value'), name + ' requires four own data words');
    const word = descriptor.value;
    integer(word, FELT_MAX, name + '[' + i + ']');
    snapshot.push(word); hasNonzero ||= word !== 0n;
  }
  if (nonzero) assert.ok(hasNonzero, 'nonzero ' + name);
  return snapshot;
}

// Unsigned calldata preparation for the new candidate only. This does not
// select an ABI, market address, verifier, key, broadcaster or RPC identity.
// The wallet must approve these exact 17 words in its actual signed call stack.
export function identityBuyInputs(config, approved) {
  configuration(config);
  assert.deepEqual(Object.keys(approved).sort(), ['actor', 'pool', 'seller', 'listingNonce', 'price', 'deadline', 'nonce', 'collectionId', 'recipient', 'tokenId', 'metadataHash'].sort(), 'exact approved buy fields');
  for (const role of ['actor', 'pool', 'seller', 'recipient']) integer(approved[role], USER_MAX, role, true);
  assert.equal(new Set([approved.actor, approved.pool, approved.seller]).size, 3, 'distinct ordinary buyer, seller and vault');
  assert.equal(approved.recipient, approved.actor, 'recipient must be signing buyer');
  integer(approved.collectionId, USER_MAX, 'collectionId', true);
  assert.equal(approved.collectionId, BigInt(config.nftId), 'approved collection');
  integer(approved.listingNonce, LIMB_MAX, 'listingNonce', true);
  integer(approved.nonce, LIMB_MAX, 'nonce', true);
  integer(approved.deadline, CHECKPOINT_MAX, 'deadline', true);
  integer(approved.price, U124_MAX, 'price', true);
  const token = hash(approved.tokenId, 'tokenId', true);
  const metadata = hash(approved.metadataHash, 'metadataHash');
  const words = [approved.pool, approved.seller, approved.listingNonce,
    approved.price & LIMB_MAX, approved.price >> 62n, approved.deadline, approved.nonce,
    approved.collectionId, approved.recipient, ...token, ...metadata];
  assert.equal(words.length, NFT_IDENTITY_BUY_FELTS);
  assert.ok(words.length <= FROZEN_CAPACITY.calldataWords);
  return words;
}
