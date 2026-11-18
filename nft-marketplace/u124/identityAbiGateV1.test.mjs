// Host/synthetic evidence only. ABI doubles use the frozen SDK ABI shape, but
// every method_id is a SYNTHETIC index placeholder, never a compiled selector.
// The reviewed real-shape fixture keeps its historical state/types/layout and
// its reviewed method ids; only its identity buy declaration is SYNTHETIC.
// Nothing here proves bytecode, function-root, SD-key or on-chain acceptance.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {methodSpans} from '../../batching/v2/generate.mjs';
import {readReviewedAbis} from '../../tests/fixtures/reviewedAbis.mjs';
import {generateIdentityBuyCandidate, FROZEN_CAPACITY, NFT_IDENTITY_BUY_METHOD} from './identity-buy-candidate.mjs';
import {
  inspectIdentityBuyAbiV1,
  ABI_GATE_MAX_ABI_BYTES,
  ABI_GATE_MAX_CONFIG_BYTES,
} from './identityAbiGateV1.mjs';

const CONFIG = {networkMagic: '1384803358401154921', nftId: 5, tokenId: 6};
const CONFIG_JSON = JSON.stringify(CONFIG);
const SOURCE_PIN = generateIdentityBuyCandidate(CONFIG).manifest.sourceSha256;
const NAMES = methodSpans(generateIdentityBuyCandidate(CONFIG).source).map(span => span.name).sort();
const sha = text => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
// Typed ASTs copied from the frozen SDK ABI schema projection.
const FELT = {kind: 'primitive', name: 'Felt'};
const HASH = {kind: 'primitive', name: 'Hash'};
const PRICE = {kind: 'array', item: FELT, length: 2, item_felt_size: 1};
const param = (name, type, felt_size) => ({name, type, felt_size});
const LEGACY_BUY_INPUTS = [
  param('pool', FELT, 1), param('seller', FELT, 1), param('listing_nonce', FELT, 1),
  param('price', PRICE, 2), param('deadline', FELT, 1), param('nonce', FELT, 1),
];
const IDENTITY_INPUTS = [
  ...LEGACY_BUY_INPUTS, param('collection_id', FELT, 1), param('recipient', FELT, 1),
  param('expected_token_id', HASH, 4), param('expected_metadata_hash', HASH, 4),
];
const LISTING_STRUCT = {
  kind: 'struct', name: 'Listing', felt_size: 3,
  fields: [
    {name: 'seller', type: FELT, offset_within_parent: 0, felt_size: 1},
    {name: 'price', type: PRICE, offset_within_parent: 1, felt_size: 2},
  ],
};
const MAP_PLACEHOLDER = {
  kind: 'map', map_kind: 'placeholder_kind', key: FELT, value: FELT,
  capacity: 8, value_felt_size: 1, alignment_felts: 1,
};
const text = methods => JSON.stringify(abiObject(methods));

function abiObject(methods) {
  return {
    schema_version: '1',
    contract: {
      name: 'NftMarket',
      state_tree_height: 16,
      state: [
        {name: 'next_listing_nonce', type: FELT, offset: 0, felt_size: 1},
        {name: 'metadata_hash', type: HASH, offset: 1, felt_size: 4},
      ],
      methods,
    },
    types: [],
  };
}

// Synthetic host placeholder manifest; the gate carries it through unchanged.
function layoutFor(state) {
  return {
    layout_version: 1, encoding_version: 1, field_count: state.length,
    slot_count: state.reduce((total, field) => total + field.felt_size, 0),
    fields: state.map((field, index) => ({
      field_id: index + 1, name: field.name, type: field.type,
      start_slot: field.offset, payload_offset: 0, slot_count: field.felt_size,
    })),
    type_proof_plan: {protocol_version: 1, nodes: [], field_nodes: state.map(() => 0)},
  };
}

// SYNTHETIC method_id placeholders: index + 1, never compiled selectors.
function doubles() {
  return NAMES.map((name, index) => ({
    name,
    method_id: index + 1,
    state_mutability: 'external',
    inputs: name === NFT_IDENTITY_BUY_METHOD ? structuredClone(IDENTITY_INPUTS) : [],
    outputs: [],
    input_felt_count: name === NFT_IDENTITY_BUY_METHOD ? 17 : 0,
    output_felt_count: 0,
  }));
}
const identityOf = methods => methods.find(method => method.name === NFT_IDENTITY_BUY_METHOD);
function call(methods, options = {}) {
  const abi = options.abi ?? text(methods);
  return inspectIdentityBuyAbiV1(abi, options.config ?? CONFIG_JSON, options.abiPin ?? sha(abi), options.sourcePin ?? SOURCE_PIN);
}
const callAbi = abi => call(null, {abi: JSON.stringify(abi)});

// Historical real-shape SDK ABI. State, types and the layout manifest stay
// exactly as reviewed; only the method list is filtered to the candidate spans
// and the legacy buy entry is replaced by a SYNTHETIC placeholder declaration.
const REAL_ABI = readReviewedAbis().admission.markets.nftmarket.artifact.abi;
const SYNTHETIC_IDENTITY_METHOD_ID = 1;
function realShapeAbi() {
  const abi = structuredClone(REAL_ABI);
  const methods = abi.contract.methods.filter(method => NAMES.includes(method.name) || method.name === 'open_buy');
  const legacy = methods.find(method => method.name === 'open_buy');
  assert.ok(legacy, 'reviewed fixture must carry the legacy buy entry');
  methods[methods.indexOf(legacy)] = {
    name: NFT_IDENTITY_BUY_METHOD,
    method_id: SYNTHETIC_IDENTITY_METHOD_ID,
    state_mutability: 'external',
    inputs: structuredClone(IDENTITY_INPUTS),
    outputs: [],
    input_felt_count: 17,
    output_felt_count: 0,
  };
  abi.contract.methods = methods;
  assert.deepEqual(methods.map(method => method.name).sort(), NAMES, 'reviewed fixture must cover the candidate method names');
  return abi;
}
function callReal(abi, options = {}) {
  const json = JSON.stringify(abi);
  return inspectIdentityBuyAbiV1(json, options.config ?? CONFIG_JSON,
    options.abiPin ?? sha(json), options.sourcePin ?? SOURCE_PIN);
}
const realIdentity = abi => abi.contract.methods.find(method => method.name === NFT_IDENTITY_BUY_METHOD);

test('synthetic compatible ABI returns frozen closed-gate metadata', () => {
  const methods = doubles();
  const result = call(methods);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.methodNames) && Object.isFrozen(result.unverified));
  assert.deepEqual(result.methodNames, NAMES);
  assert.equal(result.identityMethod, NFT_IDENTITY_BUY_METHOD);
  assert.equal(result.identityMethodId, identityOf(methods).method_id);
  assert.equal(result.identityInputFelts, 17);
  assert.equal(result.identityOutputFelts, 0);
  assert.equal(result.identityMutability, 'external');
  assert.equal(result.abiSha256, sha(text(methods)));
  assert.equal(result.sourceSha256, SOURCE_PIN);
  for (const flag of ['sourceOnly', 'prepareOnly', 'newContractRequired', 'newKeyRequired']) assert.equal(result[flag], true, flag);
  for (const flag of ['compiled', 'vmVerified', 'fullUpsVerified', 'sdKeyProofVerified', 'liveAccepted', 'nftPurchaseWritesEnabled'])
    assert.equal(result[flag], false, flag);
  assert.equal(result.financialOperations, 0);
  assert.equal(result.feeBudget, 0);
  assert.ok(result.unverified.includes('abi-to-source-correspondence'));
});

test('wrong ABI pin and wrong source pin are refused', () => {
  const abi = text(doubles());
  const pin = sha(abi);
  assert.throws(() => inspectIdentityBuyAbiV1(abi, CONFIG_JSON, 'a'.repeat(64), SOURCE_PIN), /ABI pin/);
  assert.throws(() => inspectIdentityBuyAbiV1(abi, CONFIG_JSON, pin, 'b'.repeat(64)), /source pin/);
  // Mutated raw bytes against the independently supplied, unchanged pin.
  assert.throws(() => inspectIdentityBuyAbiV1(abi + ' ', CONFIG_JSON, pin, SOURCE_PIN), /ABI pin/);
  assert.throws(() => inspectIdentityBuyAbiV1(abi.replace('"schema_version":"1"', '"schema_version":"2"'),
    CONFIG_JSON, pin, SOURCE_PIN), /ABI pin/);
  // Pins bind bytes only: re-pinning the same whitespace variant is accepted.
  assert.equal(inspectIdentityBuyAbiV1(abi + ' ', CONFIG_JSON, sha(abi + ' '), SOURCE_PIN).abiSha256, sha(abi + ' '));
});

test('wrong or malformed config is refused', () => {
  const methods = doubles();
  assert.throws(() => call(methods, {config: JSON.stringify({...CONFIG, nftId: 6, tokenId: 5})}), /source pin/);
  assert.throws(() => call(methods, {config: JSON.stringify({...CONFIG, tokenId: 5})}), /distinct/);
  assert.throws(() => call(methods, {config: '{'}), /well-formed JSON/);
  assert.throws(() => call(methods, {config: '[]'}), /JSON object/);
});

test('duplicate method name and duplicate method_id are refused', () => {
  const named = doubles();
  named.push({...named[0], method_id: 999});
  assert.throws(() => call(named), /duplicate method name/);
  const selected = doubles();
  identityOf(selected).method_id = selected[0].name === NFT_IDENTITY_BUY_METHOD ? selected[1].method_id : selected[0].method_id;
  assert.throws(() => call(selected), /duplicate method_id/);
});

test('legacy entry, missing entry and extra method are refused', () => {
  const legacy = doubles();
  identityOf(legacy).name = 'open_buy';
  assert.throws(() => call(legacy), /method name set/);
  assert.throws(() => call(doubles().filter(method => method.name !== NFT_IDENTITY_BUY_METHOD)), /method name set/);
  const extra = doubles();
  extra.push({name: 'extra_method', method_id: 4000, state_mutability: 'view',
    inputs: [], outputs: [], input_felt_count: 0, output_felt_count: 0});
  assert.throws(() => call(extra), /method name set/);
});

test('identity arity, outputs and mutability bounds are enforced', () => {
  const short = doubles();
  identityOf(short).inputs[3] = param('price', FELT, 1);
  identityOf(short).input_felt_count = 16;
  assert.throws(() => call(short), /17 input felts/);
  const long = doubles();
  identityOf(long).inputs.push(param('spare', FELT, 1));
  identityOf(long).input_felt_count = 18;
  assert.throws(() => call(long), /17 input felts/);
  const outputs = doubles();
  identityOf(outputs).outputs = [param('ok', FELT, 1)];
  identityOf(outputs).output_felt_count = 1;
  assert.throws(() => call(outputs), /zero output felts/);
  const view = doubles();
  identityOf(view).state_mutability = 'view';
  assert.throws(() => call(view), /must be external/);
  // 17 felts with the wrong typed identity words is still refused.
  const widened = doubles();
  identityOf(widened).inputs[8] = param('expected_token_id', {kind: 'array', item: FELT, length: 4, item_felt_size: 1}, 4);
  assert.throws(() => call(widened), /typed candidate signature/);
});

test('method ids must be canonical nonzero uint32 numbers', () => {
  for (const methodId of [0, -1, 4294967296, 1.5, '1', null, 18446744073709551616]) {
    const methods = doubles();
    identityOf(methods).method_id = methodId;
    assert.throws(() => call(methods), /uint32 method_id/);
  }
});

test('artifact envelopes, invented DSL fields, unknown types and bounded lists are refused', () => {
  const methods = doubles();
  const abi = abiObject(methods);
  assert.throws(() => callAbi({...abi, bytecode: '00'}), /raw ABI fields/);
  assert.throws(() => callAbi({...abi, full_u64_constants: [1]}), /raw ABI fields/);
  assert.throws(() => call(methods, {abi: JSON.stringify({contract: {methods}})}), /raw ABI fields/);
  // The previously invented selector/mutability/string-type DSL is refused.
  const invented = methods.map(method => ({
    name: method.name, selector: method.method_id, mutability: 'external',
    inputs: method.inputs.map(input => ({name: input.name, type: 'Felt'})), outputs: [],
  }));
  assert.throws(() => call(invented), /raw ABI fields/);
  const constant = doubles();
  identityOf(constant).inputs[0].full_u64_constant = 1;
  assert.throws(() => call(constant), /raw ABI fields/);
  const unknownPrimitive = doubles();
  identityOf(unknownPrimitive).inputs[0].type = {kind: 'primitive', name: 'U64'};
  assert.throws(() => call(unknownPrimitive), /frozen SDK primitive/);
  const unknownKind = doubles();
  identityOf(unknownKind).inputs[0].type = {kind: 'u64', name: 'Felt'};
  assert.throws(() => call(unknownKind), /frozen SDK kind/);
  assert.throws(() => call([]), /bounded nonempty method list/);
  assert.throws(() => call(Array.from({length: 65}, (_, i) => ({...methods[0], name: 'm' + i, method_id: i + 1}))), /bounded nonempty method list/);
  assert.throws(() => call(methods, {abi: '{bad'}), /well-formed JSON/);
});

test('input strings, byte bounds and digest shapes are enforced before parsing', () => {
  const methods = doubles();
  const abi = text(methods);
  for (const bad of [null, 1, {}, Buffer.from(abi), new String(abi)])
    assert.throws(() => inspectIdentityBuyAbiV1(bad, CONFIG_JSON, sha(abi), SOURCE_PIN), /primitive string/);
  assert.throws(() => inspectIdentityBuyAbiV1(abi, 5, sha(abi), SOURCE_PIN), /primitive string/);
  const bigAbi = abi + ' '.repeat(ABI_GATE_MAX_ABI_BYTES);
  assert.throws(() => inspectIdentityBuyAbiV1(bigAbi, CONFIG_JSON, sha(bigAbi), SOURCE_PIN), /byte bound/);
  const bigConfig = CONFIG_JSON + ' '.repeat(ABI_GATE_MAX_CONFIG_BYTES);
  assert.throws(() => call(methods, {config: bigConfig}), /byte bound/);
  for (const digest of ['0'.repeat(64), 'A'.repeat(64), 'abc', 'z'.repeat(64), 7, null]) {
    assert.throws(() => inspectIdentityBuyAbiV1(abi, CONFIG_JSON, digest, SOURCE_PIN), /digest|primitive string/);
    assert.throws(() => inspectIdentityBuyAbiV1(abi, CONFIG_JSON, sha(abi), digest), /digest|primitive string/);
  }
});

test('typed AST widths and declared felt totals must agree', () => {
  const paramWidth = doubles();
  identityOf(paramWidth).inputs[9].felt_size = 3;
  assert.throws(() => call(paramWidth), /parameter felt_size must match its type/);
  const itemWidth = doubles();
  identityOf(itemWidth).inputs[3].type.item_felt_size = 2;
  assert.throws(() => call(itemWidth), /item_felt_size must match the item type/);
  const arrayLength = doubles();
  identityOf(arrayLength).inputs[3].type.length = 3;
  assert.throws(() => call(arrayLength), /parameter felt_size must match its type/);
  const inputTotal = doubles();
  identityOf(inputTotal).input_felt_count = 16;
  assert.throws(() => call(inputTotal), /input_felt_count must match its typed inputs/);
  const outputTotal = doubles();
  identityOf(outputTotal).output_felt_count = 1;
  assert.throws(() => call(outputTotal), /output_felt_count must match its typed outputs/);
  const stateWidth = abiObject(doubles());
  stateWidth.contract.state[1].felt_size = 3;
  assert.throws(() => callAbi(stateWidth), /state field felt_size must match its type/);
  const mapValue = abiObject(doubles());
  mapValue.contract.state[0].type = {...MAP_PLACEHOLDER, value: HASH};
  assert.throws(() => callAbi(mapValue), /value_felt_size must match the value type/);
});

test('real contract state, layout manifest and declared struct types are carried through', () => {
  const abi = abiObject(doubles());
  abi.contract.state_layout = layoutFor(abi.contract.state);
  abi.types = [structuredClone(LISTING_STRUCT)];
  const other = abi.contract.methods.find(method => method.name !== NFT_IDENTITY_BUY_METHOD);
  other.inputs = [param('listing', {kind: 'struct', name: 'Listing'}, 3)];
  other.input_felt_count = 3;
  const result = callAbi(abi);
  assert.equal(result.identityInputFelts, 17);
  assert.equal(result.nftPurchaseWritesEnabled, false);
  assert.ok(result.unverified.includes('abi-to-source-correspondence'));

  const undeclared = structuredClone(abi);
  undeclared.types = [];
  assert.throws(() => callAbi(undeclared), /must be declared in abi.types/);
  const wrongTotal = structuredClone(abi);
  wrongTotal.types[0].felt_size = 4;
  assert.throws(() => callAbi(wrongTotal), /struct felt_size must match its fields/);
  const recursive = structuredClone(abi);
  recursive.types[0].fields[0].type = {kind: 'struct', name: 'Listing'};
  assert.throws(() => callAbi(recursive), /recursive struct type/);
  const wrongLayout = structuredClone(abi);
  wrongLayout.contract.state_layout.field_count = 3;
  assert.throws(() => callAbi(wrongLayout), /layout field_count must match its fields/);
});

test('real-shape SDK ABI passes with logical storage dimensions intact', () => {
  const abi = realShapeAbi();
  const result = callReal(abi);
  assert.equal(result.abiSha256, sha(JSON.stringify(abi)));
  assert.equal(result.sourceSha256, SOURCE_PIN);
  assert.deepEqual(result.methodNames, NAMES);
  assert.equal(result.identityMethodId, SYNTHETIC_IDENTITY_METHOD_ID);
  assert.equal(result.identityInputFelts, 17);
  assert.equal(result.identityOutputFelts, 0);
  assert.equal(result.identityMutability, 'external');
  // Reviewed logical storage, struct types and layout are carried through.
  assert.deepEqual(abi.contract.state, REAL_ABI.contract.state);
  assert.deepEqual(abi.contract.state_layout, REAL_ABI.contract.state_layout);
  assert.deepEqual(abi.types, REAL_ABI.types);
  assert.ok(abi.contract.state.some(field => field.felt_size > 65536),
    'reviewed state must exceed the calldata felt work budget');
  assert.ok(abi.contract.state.some(field => field.type.kind === 'array' && field.type.length === 1073741824)
    && abi.contract.state.some(field => field.type.kind === 'array' && field.type.length === 16777216),
  'reviewed 2^30 and 2^24 logical storage arrays must stay accepted declarations');
  for (const flag of ['compiled', 'vmVerified', 'fullUpsVerified', 'sdKeyProofVerified', 'liveAccepted', 'nftPurchaseWritesEnabled'])
    assert.equal(result[flag], false, flag);
  assert.equal(result.financialOperations, 0);
  assert.equal(result.feeBudget, 0);
  assert.ok(result.unverified.includes('abi-to-source-correspondence'));
});

test('real-shape ABI still refuses bad pins, envelopes, counts, lies and duplicates', () => {
  const base = realShapeAbi();
  const json = JSON.stringify(base);
  assert.throws(() => callReal(base, {abiPin: 'c'.repeat(64)}), /ABI pin/);
  assert.throws(() => callReal(base, {sourcePin: 'd'.repeat(64)}), /source pin/);
  assert.throws(() => inspectIdentityBuyAbiV1(json + ' ', CONFIG_JSON, sha(json), SOURCE_PIN), /ABI pin/);
  assert.throws(() => callReal({...base, bytecode: '00'}), /raw ABI fields/);

  const count = realShapeAbi();
  realIdentity(count).input_felt_count = 16;
  assert.throws(() => callReal(count), /input_felt_count must match its typed inputs/);

  const stateWidth = realShapeAbi();
  stateWidth.contract.state[0].felt_size = 1;
  assert.throws(() => callReal(stateWidth), /state field felt_size must match its type/);

  const itemWidth = realShapeAbi();
  itemWidth.contract.state[0].type.item_felt_size = 2;
  assert.throws(() => callReal(itemWidth), /item_felt_size must match the item type/);

  const duplicateName = realShapeAbi();
  duplicateName.contract.methods.push(structuredClone(duplicateName.contract.methods[0]));
  assert.throws(() => callReal(duplicateName), /duplicate method name/);

  const duplicateId = realShapeAbi();
  duplicateId.contract.methods.find(method => method.name !== NFT_IDENTITY_BUY_METHOD).method_id = SYNTHETIC_IDENTITY_METHOD_ID;
  assert.throws(() => callReal(duplicateId), /duplicate method_id/);

  const legacy = realShapeAbi();
  legacy.contract.methods.push(structuredClone(REAL_ABI.contract.methods.find(method => method.name === 'open_buy')));
  assert.throws(() => callReal(legacy), /method name set/);

  const deep = realShapeAbi();
  let type = FELT;
  for (let i = 0; i < 12; i++) type = {kind: 'array', item: type, length: 1, item_felt_size: 1};
  deep.contract.state[0].type = type;
  assert.throws(() => callReal(deep), /depth bound/);

  const layout = realShapeAbi();
  layout.contract.state_layout.field_count += 1;
  assert.throws(() => callReal(layout), /layout field_count must match its fields/);
});

test('logical storage scale never relaxes the actual calldata work budget', () => {
  const methods = doubles();
  const other = methods.find(method => method.name !== NFT_IDENTITY_BUY_METHOD);
  other.inputs = [param('huge', {kind: 'array', item: FELT, length: 16777216, item_felt_size: 1}, 16777216)];
  other.input_felt_count = 16777216;
  assert.throws(() => call(methods), /array length/);
  // A large logical map capacity is a declaration; its slots stay unverified.
  const mapped = abiObject(doubles());
  mapped.contract.state.push({name: 'listings', type: {...MAP_PLACEHOLDER, capacity: 16777216}, offset: 5, felt_size: 64});
  assert.equal(callAbi(mapped).identityInputFelts, 17);
});

test('storage maps stay opaque and type traversal stays bounded', () => {
  const mapped = abiObject(doubles());
  // Placeholder map kind: SDK map kinds and physical slots are never re-derived.
  mapped.contract.state.push({name: 'listings', type: MAP_PLACEHOLDER, offset: 5, felt_size: 64});
  assert.equal(callAbi(mapped).identityInputFelts, 17);
  const inMethod = doubles();
  identityOf(inMethod).inputs[0].type = MAP_PLACEHOLDER;
  assert.throws(() => call(inMethod), /statically known felt width/);
  const deep = abiObject(doubles());
  let type = FELT;
  for (let i = 0; i < 12; i++) type = {kind: 'array', item: type, length: 1, item_felt_size: 1};
  deep.contract.state[0].type = type;
  assert.throws(() => callAbi(deep), /depth bound/);
});

// Method calldata is bounded by the frozen SDK capacity, not by storage scale.
// All method_id values here remain SYNTHETIC host placeholders.
test('non-identity method calldata obeys the frozen SDK capacity with an exact boundary', () => {
  const limit = FROZEN_CAPACITY.calldataWords;
  assert.equal(limit, 128);
  const words = length => ({kind: 'array', item: FELT, length, item_felt_size: 1});
  const target = methods => methods.find(method => method.name !== NFT_IDENTITY_BUY_METHOD);

  const over = doubles();
  target(over).inputs = [param('words', words(limit + 1), limit + 1)];
  target(over).input_felt_count = limit + 1;
  assert.throws(() => call(over), /array felt width exceeds the bound/);

  const split = doubles();
  target(split).inputs = [param('words', words(limit), limit), param('extra', FELT, 1)];
  target(split).input_felt_count = limit + 1;
  assert.throws(() => call(split), /felt count exceeds the frozen calldata capacity bound/);

  const exact = doubles();
  target(exact).inputs = [param('words', words(limit), limit)];
  target(exact).input_felt_count = limit;
  const result = call(exact);
  assert.equal(result.identityInputFelts, 17);
  assert.equal(result.nftPurchaseWritesEnabled, false);
  assert.equal(result.financialOperations, 0);
  assert.ok(result.unverified.includes('abi-to-source-correspondence'));
});

// A map keeps the struct total opaque; later map-free fields must still be
// checked individually. Physical map slots are never derived here.
test('opaque map-bearing structs still check every later known-width field', () => {
  const abi = abiObject(doubles());
  abi.types = [{
    kind: 'struct', name: 'MappedListing', felt_size: 64,
    fields: [
      {name: 'listings', type: MAP_PLACEHOLDER, offset_within_parent: 0, felt_size: 64},
      {name: 'seller', type: FELT, offset_within_parent: 64, felt_size: 1},
    ],
  }];
  abi.contract.state.push({name: 'mapped', type: {kind: 'struct', name: 'MappedListing'}, offset: 5, felt_size: 64});
  // Intentionally opaque storage stays accepted; no total is re-derived.
  assert.equal(callAbi(abi).identityInputFelts, 17);

  const mismatched = structuredClone(abi);
  mismatched.types[0].fields[1].felt_size = 2;
  assert.throws(() => callAbi(mismatched), /struct field felt_size must match its type/);

  const laterArray = structuredClone(abi);
  laterArray.types[0].fields[1] = {name: 'price', type: PRICE, offset_within_parent: 64, felt_size: 3};
  assert.throws(() => callAbi(laterArray), /struct field felt_size must match its type/);

  for (const felt_size of [0, -1, 1.5, '1', null, 2 ** 53]) {
    const malformed = structuredClone(abi);
    malformed.types[0].fields[1].felt_size = felt_size;
    assert.throws(() => callAbi(malformed), /struct field felt_size must be a safe positive integer/);
    const malformedMapField = structuredClone(abi);
    malformedMapField.types[0].fields[0].felt_size = felt_size;
    assert.throws(() => callAbi(malformedMapField), /struct field felt_size must be a safe positive integer/);
  }

  // A map-bearing struct is still refused as actual calldata work.
  const inMethod = structuredClone(abi);
  const target = inMethod.contract.methods.find(method => method.name !== NFT_IDENTITY_BUY_METHOD);
  target.inputs = [param('mapped', {kind: 'struct', name: 'MappedListing'}, 64)];
  target.input_felt_count = 64;
  assert.throws(() => callAbi(inMethod), /statically known felt width/);
});

test('a struct first widened by logical storage cannot bypass the calldata budget', () => {
  const limit = FROZEN_CAPACITY.calldataWords;
  const wide = limit + 1;
  const abi = abiObject(doubles());
  abi.types = [{
    kind: 'struct', name: 'WideListing', felt_size: wide,
    fields: [{name: 'words', type: {kind: 'array', item: FELT, length: wide, item_felt_size: 1},
      offset_within_parent: 0, felt_size: wide}],
  }];
  abi.contract.state.push({name: 'listings', type: {kind: 'struct', name: 'WideListing'}, offset: 5, felt_size: wide});
  const target = value => value.contract.methods.find(method => method.name !== NFT_IDENTITY_BUY_METHOD);

  // The logical storage declaration alone stays accepted.
  const storageOnly = structuredClone(abi);
  assert.equal(callAbi(storageOnly).identityInputFelts, 17);

  // Reusing the same struct as a parameter must re-check the calldata budget.
  target(abi).inputs = [param('listing', {kind: 'struct', name: 'WideListing'}, wide)];
  target(abi).input_felt_count = wide;
  assert.throws(() => callAbi(abi), /array felt width exceeds the bound/);

  // A struct that fits the frozen capacity is reusable in both contexts.
  const fits = structuredClone(abi);
  fits.types[0].felt_size = limit;
  fits.types[0].fields[0].type.length = limit;
  fits.types[0].fields[0].felt_size = limit;
  fits.contract.state[2].felt_size = limit;
  target(fits).inputs = [param('listing', {kind: 'struct', name: 'WideListing'}, limit)];
  target(fits).input_felt_count = limit;
  assert.equal(callAbi(fits).identityInputFelts, 17);
});
