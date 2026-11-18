// Opt-in source-only ABI compatibility gate. No trust or write authority.
// Digest pins establish byte equality only: not review provenance, compiled
// bytecode, function root, SD-key binding, signature/session approval or
// safe production writes. No compiler, filesystem, network or wallet use.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {methodSpans} from '../../batching/v2/generate.mjs';
import {
  generateIdentityBuyCandidate,
  FROZEN_CAPACITY,
  NFT_IDENTITY_BUY_METHOD,
  NFT_IDENTITY_BUY_FELTS,
} from './identity-buy-candidate.mjs';

export const ABI_GATE_MAX_ABI_BYTES = 1048576;
export const ABI_GATE_MAX_CONFIG_BYTES = 4096;
const MAX_METHODS = 64;
const MAX_PARAMS = 32;
const MAX_TYPES = 256;
const MAX_STRUCT_FIELDS = 64;
const MAX_STATE_FIELDS = 256;
const MAX_TYPE_DEPTH = 8;
const MAX_TYPE_NODES = 4096;
// Actual work budgets: JSON lists and AST traversal. Method calldata felts use
// the frozen SDK capacity exported by the candidate module, never a separate
// guessed number and never a logical storage dimension.
const MAX_ARRAY_LENGTH = 4096;
const MAX_CALLDATA_FELTS = FROZEN_CAPACITY.calldataWords;
const MAX_MAP_CAPACITY = 1 << 20;
assert.ok(Number.isSafeInteger(MAX_CALLDATA_FELTS) && MAX_CALLDATA_FELTS >= NFT_IDENTITY_BUY_FELTS,
  'frozen calldata capacity must be a safe felt budget covering the identity buy words');
// Logical storage dimensions are declarations, not work: the frozen SDK state
// declares arrays with 16,777,216 entries without any JSON element, slot
// allocation or slot traversal here. They are bounded only by checked
// safe-integer arithmetic. Physical map ranges stay opaque and unverified.
const MAX_LOGICAL_DIMENSION = Number.MAX_SAFE_INTEGER;
const METHOD_ID_MAX = 4294967295;
const STATE_TREE_HEIGHT_MAX = 65535;
const ZERO_DIGEST = '0'.repeat(64);
const DIGEST = /^[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Frozen SDK primitive names and felt widths (PrimitiveTypeName). Full-u64
// artifact constants are rejected; Goldilocks handling stays in the existing
// dedicated client.
const PRIMITIVE_WIDTH = new Map([['Felt', 1], ['Bool', 1], ['U32', 1], ['Hash', 4]]);
// Typed signature emitted by the candidate source: the legacy buy words plus
// collection, recipient and the two four-word Hash identities.
const felt = name => ({kind: 'primitive', name});
const IDENTITY_SIGNATURE = [
  ['pool', felt('Felt')], ['seller', felt('Felt')], ['listing_nonce', felt('Felt')],
  ['price', {kind: 'array', item: felt('Felt'), length: 2, item_felt_size: 1}],
  ['deadline', felt('Felt')], ['nonce', felt('Felt')],
  ['collection_id', felt('Felt')], ['recipient', felt('Felt')],
  ['expected_token_id', felt('Hash')], ['expected_metadata_hash', felt('Hash')],
].map(([name, type]) => ({name, type}));
const sha256 = text => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

function boundedString(value, limit, label) {
  assert.equal(typeof value, 'string', label + ' must be a primitive string');
  const size = Buffer.byteLength(value, 'utf8');
  assert.ok(size > 0 && size <= limit, label + ' must fit the UTF-8 byte bound');
}

function parseObject(text, label) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    assert.fail(label + ' must be well-formed JSON');
  }
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), label + ' must be a JSON object');
  return value;
}

function exactFields(value, fields, label, optional = []) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), label + ' must be an object');
  const keys = Object.keys(value);
  const allowed = new Set([...fields, ...optional]);
  assert.ok(fields.every(field => keys.includes(field)) && keys.every(key => allowed.has(key)),
    label + ' must declare exactly the frozen SDK raw ABI fields');
}

function typeContext(types) {
  assert.ok(Array.isArray(types) && types.length <= MAX_TYPES, 'bounded abi types list');
  const declared = new Map();
  for (const type of types) {
    exactFields(type, ['kind', 'name', 'felt_size', 'fields'], 'abi type');
    assert.equal(type.kind, 'struct', 'abi type kind must be struct');
    assert.ok(typeof type.name === 'string' && IDENTIFIER.test(type.name), 'abi type name');
    assert.ok(!declared.has(type.name), 'duplicate type name ' + type.name);
    assert.ok(Number.isSafeInteger(type.felt_size) && type.felt_size >= 1, 'abi type felt_size');
    assert.ok(Array.isArray(type.fields) && type.fields.length <= MAX_STRUCT_FIELDS, 'bounded struct field list');
    declared.set(type.name, type);
  }
  return {declared, widths: new Map(), visiting: new Set(), nodes: 0};
}

// Felt width of a typed AST node, or null when it contains a storage map:
// physical map slot ranges belong to the frozen SDK layout module and are
// never re-derived here.
function typeWidth(ty, ctx, depth, label, logical = false) {
  assert.ok(ctx.nodes < MAX_TYPE_NODES, label + ' type traversal exceeds the node budget');
  ctx.nodes += 1;
  assert.ok(depth <= MAX_TYPE_DEPTH, label + ' type nesting exceeds the depth bound');
  assert.ok(ty && typeof ty === 'object' && !Array.isArray(ty), label + ' type must be an object');
  if (ty.kind === 'primitive') {
    exactFields(ty, ['kind', 'name'], label + ' primitive type');
    assert.ok(PRIMITIVE_WIDTH.has(ty.name), label + ' primitive name must be a frozen SDK primitive');
    return PRIMITIVE_WIDTH.get(ty.name);
  }
  if (ty.kind === 'array') {
    exactFields(ty, ['kind', 'item', 'length', 'item_felt_size'], label + ' array type');
    const lengthBound = logical ? MAX_LOGICAL_DIMENSION : MAX_ARRAY_LENGTH;
    const widthBound = logical ? MAX_LOGICAL_DIMENSION : MAX_CALLDATA_FELTS;
    assert.ok(Number.isSafeInteger(ty.length) && ty.length >= 1 && ty.length <= lengthBound, label + ' array length');
    const item = typeWidth(ty.item, ctx, depth + 1, label + ' item', logical);
    if (item === null) return null;
    assert.equal(ty.item_felt_size, item, label + ' item_felt_size must match the item type');
    const width = item * ty.length;
    assert.ok(Number.isSafeInteger(width) && width <= widthBound, label + ' array felt width exceeds the bound');
    return width;
  }
  if (ty.kind === 'struct') {
    exactFields(ty, ['kind', 'name'], label + ' struct type');
    assert.ok(typeof ty.name === 'string' && IDENTIFIER.test(ty.name), label + ' struct type name');
    return structWidth(ty.name, ctx, depth + 1, logical);
  }
  if (ty.kind === 'map') {
    exactFields(ty, ['kind', 'map_kind', 'key', 'value', 'capacity', 'value_felt_size', 'alignment_felts'], label + ' map type');
    assert.ok(typeof ty.map_kind === 'string' && IDENTIFIER.test(ty.map_kind), label + ' map kind');
    const capacityBound = logical ? MAX_LOGICAL_DIMENSION : MAX_MAP_CAPACITY;
    assert.ok(Number.isSafeInteger(ty.capacity) && ty.capacity >= 1 && ty.capacity <= capacityBound, label + ' map capacity');
    assert.ok(Number.isSafeInteger(ty.alignment_felts) && ty.alignment_felts >= 1, label + ' map alignment');
    assert.ok(typeWidth(ty.key, ctx, depth + 1, label + ' key', logical) !== null, label + ' map key must be map-free');
    const value = typeWidth(ty.value, ctx, depth + 1, label + ' value', logical);
    if (value !== null) assert.equal(ty.value_felt_size, value, label + ' value_felt_size must match the value type');
    return null;
  }
  return assert.fail(label + ' type kind must be a frozen SDK kind');
}

// Declared struct widths are cached per name AND per context: a width accepted
// as a logical storage declaration must never satisfy a calldata parameter.
// Calldata entries re-run the small array/felt budgets. No layout is re-derived
// and no logical storage slot is iterated or allocated.
function structWidth(name, ctx, depth, logical) {
  const key = (logical ? 'logical:' : 'calldata:') + name;
  if (ctx.widths.has(key)) return ctx.widths.get(key);
  assert.ok(!ctx.visiting.has(key), 'recursive struct type ' + name);
  const declared = ctx.declared.get(name);
  assert.ok(declared, 'struct type ' + name + ' must be declared in abi.types');
  ctx.visiting.add(key);
  let total = 0;
  for (const field of declared.fields) {
    exactFields(field, ['name', 'type', 'offset_within_parent', 'felt_size'], 'struct field ' + name);
    assert.ok(typeof field.name === 'string' && IDENTIFIER.test(field.name), 'struct field name');
    assert.ok(Number.isSafeInteger(field.offset_within_parent) && field.offset_within_parent >= 0, 'struct field offset');
    // Every declared field size is checked on its own. An earlier map makes
    // the overall struct width opaque, but it never excuses a later
    // map-free field from its own declared-width equality check.
    assert.ok(Number.isSafeInteger(field.felt_size) && field.felt_size >= 1,
      'struct field felt_size must be a safe positive integer');
    const width = typeWidth(field.type, ctx, depth + 1, name + '.' + field.name, logical);
    if (width === null) total = null;
    else {
      assert.equal(field.felt_size, width, 'struct field felt_size must match its type');
      if (total !== null) total += width;
    }
  }
  ctx.visiting.delete(key);
  if (total !== null) assert.equal(declared.felt_size, total, 'struct felt_size must match its fields');
  ctx.widths.set(key, total);
  return total;
}

function paramFelts(params, ctx, label) {
  assert.ok(Array.isArray(params) && params.length <= MAX_PARAMS, label + ' must be a bounded parameter list');
  let total = 0;
  for (const param of params) {
    exactFields(param, ['name', 'type', 'felt_size'], label + ' parameter');
    assert.ok(typeof param.name === 'string' && IDENTIFIER.test(param.name), label + ' parameter name');
    // Parameters are actual calldata work, so the small array budget and the
    // frozen SDK calldata capacity apply, not the logical storage bounds.
    const width = typeWidth(param.type, ctx, 1, label + ' ' + param.name, false);
    assert.ok(width !== null, label + ' parameter type must have a statically known felt width');
    assert.equal(param.felt_size, width, label + ' parameter felt_size must match its type');
    total += width;
    assert.ok(total <= MAX_CALLDATA_FELTS, label + ' felt count exceeds the frozen calldata capacity bound');
  }
  return total;
}

function stateFields(state, ctx) {
  assert.ok(Array.isArray(state) && state.length <= MAX_STATE_FIELDS, 'bounded state field list');
  for (const field of state) {
    exactFields(field, ['name', 'type', 'offset', 'felt_size'], 'abi state field');
    assert.ok(typeof field.name === 'string' && IDENTIFIER.test(field.name), 'state field name');
    assert.ok(Number.isSafeInteger(field.offset) && field.offset >= 0, 'state field offset');
    assert.ok(Number.isSafeInteger(field.felt_size) && field.felt_size >= 1, 'state field felt_size');
    // State declarations carry logical storage dimensions, not calldata work.
    const width = typeWidth(field.type, ctx, 1, 'state ' + field.name, true);
    if (width !== null) assert.equal(field.felt_size, width, 'state field felt_size must match its type');
  }
}

// Accepts the frozen SDK ABI envelope {schema_version, contract, types} only.
// Compiled bytecode/artifact JSON, extra fields and u64 constants are refused;
// selectors, layout slots and proof material are never re-derived here.
export function inspectIdentityBuyAbiV1(abiJson, configJson, expectedAbiSha256, expectedSourceSha256) {
  boundedString(abiJson, ABI_GATE_MAX_ABI_BYTES, 'abiJson');
  boundedString(configJson, ABI_GATE_MAX_CONFIG_BYTES, 'configJson');
  for (const [digest, label] of [[expectedAbiSha256, 'expectedAbiSha256'], [expectedSourceSha256, 'expectedSourceSha256']]) {
    assert.equal(typeof digest, 'string', label + ' must be a primitive string');
    assert.ok(DIGEST.test(digest) && digest !== ZERO_DIGEST, label + ' must be a nonzero lowercase 64-hex digest');
  }
  const abiSha256 = sha256(abiJson);
  assert.equal(abiSha256, expectedAbiSha256, 'raw ABI bytes must match the supplied ABI pin');
  const candidate = generateIdentityBuyCandidate(parseObject(configJson, 'configJson'));
  const sourceSha256 = candidate.manifest.sourceSha256;
  assert.equal(sourceSha256, expectedSourceSha256, 'fresh candidate source must match the supplied source pin');

  const abi = parseObject(abiJson, 'abiJson');
  exactFields(abi, ['schema_version', 'contract', 'types'], 'abi');
  assert.ok(typeof abi.schema_version === 'string' && abi.schema_version.length > 0
    && abi.schema_version.length <= 32, 'abi schema_version');
  const contract = abi.contract;
  exactFields(contract, ['name', 'state_tree_height', 'state', 'methods'], 'abi.contract', ['state_layout']);
  assert.ok(typeof contract.name === 'string' && IDENTIFIER.test(contract.name), 'abi contract name');
  assert.ok(Number.isSafeInteger(contract.state_tree_height) && contract.state_tree_height >= 0
    && contract.state_tree_height <= STATE_TREE_HEIGHT_MAX, 'abi state_tree_height must be a u16');
  const ctx = typeContext(abi.types);
  stateFields(contract.state, ctx);
  if (Object.hasOwn(contract, 'state_layout')) {
    // The canonical manifest is carried through, not re-derived: slot ranges,
    // hashes and the type proof plan belong to the SDK and the prover.
    const layout = contract.state_layout;
    exactFields(layout, ['layout_version', 'encoding_version', 'field_count', 'slot_count', 'fields', 'type_proof_plan'], 'abi state_layout');
    assert.ok(Array.isArray(layout.fields) && layout.fields.length <= MAX_STATE_FIELDS, 'bounded layout field list');
    assert.equal(layout.field_count, layout.fields.length, 'layout field_count must match its fields');
    assert.equal(layout.field_count, contract.state.length, 'layout field_count must match contract state');
  }
  const methods = contract.methods;
  assert.ok(Array.isArray(methods) && methods.length > 0 && methods.length <= MAX_METHODS, 'bounded nonempty method list');
  const expectedNames = methodSpans(candidate.source).map(span => span.name).sort();
  assert.ok(!expectedNames.includes('open_buy'), 'candidate must not retain the legacy buy entry');

  const names = new Set();
  const methodIds = new Set();
  let identity = null;
  for (const method of methods) {
    exactFields(method, ['name', 'method_id', 'state_mutability', 'inputs', 'outputs', 'input_felt_count', 'output_felt_count'],
      'abi method', ['vm_type']);
    assert.ok(typeof method.name === 'string' && IDENTIFIER.test(method.name), 'abi method name');
    assert.ok(!names.has(method.name), 'duplicate method name ' + method.name);
    names.add(method.name);
    const methodId = method.method_id;
    assert.ok(typeof methodId === 'number' && Number.isSafeInteger(methodId)
      && methodId >= 1 && methodId <= METHOD_ID_MAX, 'canonical nonzero uint32 method_id for ' + method.name);
    assert.ok(!methodIds.has(methodId), 'duplicate method_id ' + methodId);
    methodIds.add(methodId);
    if (Object.hasOwn(method, 'vm_type'))
      assert.ok(typeof method.vm_type === 'string' && method.vm_type.length <= 64, 'abi vm_type for ' + method.name);
    assert.ok(method.state_mutability === 'external' || method.state_mutability === 'view', 'declared state_mutability for ' + method.name);
    const inputs = paramFelts(method.inputs, ctx, method.name + ' inputs');
    const outputs = paramFelts(method.outputs, ctx, method.name + ' outputs');
    assert.equal(method.input_felt_count, inputs, method.name + ' input_felt_count must match its typed inputs');
    assert.equal(method.output_felt_count, outputs, method.name + ' output_felt_count must match its typed outputs');
    if (method.name === NFT_IDENTITY_BUY_METHOD) identity = {
      methodId, inputs, outputs, mutability: method.state_mutability,
      params: method.inputs.map(param => ({name: param.name, type: param.type})),
    };
  }
  assert.deepEqual([...names].sort(), expectedNames, 'exact candidate method name set');
  assert.ok(identity, NFT_IDENTITY_BUY_METHOD + ' must be present');
  assert.equal(identity.inputs, NFT_IDENTITY_BUY_FELTS, 'identity buy requires 17 input felts');
  assert.equal(identity.outputs, 0, 'identity buy requires zero output felts');
  assert.equal(identity.mutability, 'external', 'identity buy must be external');
  assert.deepEqual(identity.params, IDENTITY_SIGNATURE, 'identity buy requires the exact typed candidate signature');

  return Object.freeze({
    schema: 1,
    profile: candidate.manifest.profile,
    abiSha256,
    sourceSha256,
    methodNames: Object.freeze([...names].sort()),
    identityMethod: NFT_IDENTITY_BUY_METHOD,
    identityMethodId: identity.methodId,
    identityInputFelts: identity.inputs,
    identityOutputFelts: identity.outputs,
    identityMutability: identity.mutability,
    sourceOnly: true,
    prepareOnly: true,
    newContractRequired: true,
    newKeyRequired: true,
    compiled: false,
    vmVerified: false,
    fullUpsVerified: false,
    sdKeyProofVerified: false,
    liveAccepted: false,
    nftPurchaseWritesEnabled: false,
    financialOperations: 0,
    feeBudget: 0,
    unverified: Object.freeze([
      'compiled-bytecode', 'function-root', 'sd-key-binding',
      'signature-session-approval', 'abi-to-source-correspondence', 'real-settlement',
    ]),
    note: 'ABI shape compatibility only; not compiled bytecode or function-root trust, '
      + 'SD-key binding, signature/session approval or safe production writes.',
  });
}
