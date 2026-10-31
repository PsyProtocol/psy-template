// Public consistency audit only. Native proof and call/session verification are
// separate gates; this never signs, sends, installs resources or authorizes UI.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {auditUpsRow} from './audit-evidence.mjs';

export function auditFundedRow(spec, verification, request, plan, session) {
  assert.equal(spec.version, 14n);
  assert.equal(spec.live_authorization, false);
  assert.equal(spec.qualified_randomness, false);
  assert.equal(spec.source_window_checkpoints, 32n);
  const f = plan.fields, mode = f[0], key = plan.registered_key;
  const owner = spec.fee_owner;
  const role = (name, inputs) => ({...spec.stream[name], inputs});
  const resolveCall = (call, values) => ({...call, inputs: call.inputs.map(input =>
    input.constant !== undefined ? BigInt(input.constant) : values[Number(input.witness)])});
  const calls = Array.from({length: 40}, () => ({...spec.noop, inputs: []}));
  if (mode === 14n) {
    assert.equal(f[23], 1n);
    assert.notEqual(f[24], owner);
    const values = Array(13).fill(0n); values[1] = f[24];
    const activation = spec.base.operations.find(o => o.name === 'activate_batch_vault');
    assert.equal(activation.maintenance, true);
    assert.equal(activation.calls.length, 9);
    activation.calls.forEach((call, i) => { calls[i] = resolveCall(call, values); });
    calls[9] = role('apply_fee_grant', [f[21], f[22], ...key, owner, 1n]);
    calls[10] = resolveCall(spec.owner_fee_claim, []);
    assert.equal(verification.firstUse, true);
    assert.equal(verification.storedStartLeaf, '0'.repeat(64));
    assert.equal(verification.signatureStartLeaf, verification.startLeaf);
    assert.equal(session.session.start_user_leaf.nonce, 0n);
  } else if (mode === 13n) {
    assert.ok(f[23] === 0n || f[23] === 1n);
    calls[0] = role('apply_fee_grant', [f[21], f[22], ...key, owner, f[23]]);
    if (f[23] === 1n) calls[1] = resolveCall(spec.owner_fee_claim, []);
    assert.equal(verification.firstUse, false);
  } else {
    assert.equal(mode, 4n, 'this audit accepts bootstrap/grant/maintenance only');
    const values = f.slice(21, 34);
    const op = spec.base.operations.find(o => o.branch === values[0] && o.maintenance === true);
    assert.ok(op, 'exact reviewed maintenance branch');
    assert.equal(op.calls.length, 9);
    op.calls.forEach((call, i) => { calls[i] = resolveCall(call, values); });
    assert.equal(verification.firstUse, false);
  }
  calls[38] = role('account_executor_fee', [f[73], ...key]);
  calls[39] = resolveCall(spec.base.burn, f);
  assert.equal(session.stack.length, calls.length);
  for (const [i, call] of calls.entries()) {
    const stack = session.stack[i];
    assert.equal(stack.caller_contract_id, 4294967296n, 'direct caller');
    assert.equal(stack.contract_id, call.contract_id, 'ordered contract');
    assert.equal(stack.method_id, call.method_id, 'ordered method');
    assert.equal(stack.inputs_length, BigInt(call.inputs.length), 'full argument count');
  }
  const actual = session.actualCalls.map(call => {
    assert.deepEqual(Object.keys(call).sort(), ['contract_id', 'inputs', 'method_name']);
    return {contract_id: call.contract_id, method_name: call.method_name, inputs: call.inputs};
  });
  assert.deepEqual(actual, calls.filter(call => call.method_name !== 'noop')
    .map(({contract_id, method_name, inputs}) => ({contract_id, method_name, inputs})));
  const persisted = verification.firstUse
    ? {...verification, startLeaf: verification.storedStartLeaf} : verification;
  const row = auditUpsRow(persisted, request, plan, session);
  return {...row, signatureStartLeaf: verification.signatureStartLeaf,
    firstUse: verification.firstUse, lifetimeCap: String(f[22]), mode: String(mode)};
}

export async function auditFundedEvidence(root, fixtures) {
  const markets = {}, files = {};
  const read = async (path, lossless = true) => {
    const bytes = await readFile(path); files[path.startsWith(root + '/') ? path.slice(root.length + 1) : 'fixtures/' + path.slice(fixtures.length + 1)] = sha256(bytes);
    return lossless ? parseLosslessJson(bytes.toString()) : JSON.parse(bytes);
  };
  for (const market of ['amm', 'bondingcurve']) {
    const report = await read(join(root, market + '-REPORT.json'), false);
    for (const [name, value] of Object.entries({emptyVaultAtStart: true, fullUpsVerified: true,
      registrationPathVerified: true, randomMode: false, seedSourceUsed: false,
      normalWalletClaims: false, liveAcceptance: false, financialOperations: 0})) assert.equal(report[name], value);
    const spec = await read(join(fixtures, market, 'stream-policy.json'));
    const phases = ['fresh-bootstrap', market === 'amm' ? 'deterministic-fee-grant' : 'deterministic-curve-initialize'];
    const rows = {};
    for (const phase of phases) {
      const base = join(root, market + '-' + phase);
      const [v, request, plan, session] = await Promise.all([
        read(join(base, 'verification.json'), false), read(join(base, 'request.json')),
        read(join(base, 'plan.json')), read(join(base, 'public-session.json'))]);
      assert.equal(v.keyFingerprint, report.keyFingerprint);
      rows[phase] = auditFundedRow(spec, v, request, plan, session);
    }
    assert.equal(rows[phases[0]].endLeaf, rows[phases[1]].startLeaf, 'persisted state edge');
    assert.equal(phases.reduce((n, phase) => n + BigInt(rows[phase].syntheticNativeFee), 0n), BigInt(report.feeUsed));
    markets[market] = {keyFingerprint: report.keyFingerprint, rows, feeUsed: String(report.feeUsed),
      coldResourceSeconds: report.measurements.find(m => m.phase === 'cold-stream-resource-build').seconds};
  }
  return {schema: 1, completeUps: 4, cryptographicVerificationPerformed: false,
    scope: 'Public consistency audit of separately native-verified synthetic proofs; not independent cryptographic verification, receipt, ordinary wallet approval or finality',
    canBroadcast: false, financialOperations: 0, markets, files};
}
if (process.argv.length === 4 && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.stdout.write(JSON.stringify(await auditFundedEvidence(resolve(process.argv[2]), resolve(process.argv[3])), null, 2) + '\n');
