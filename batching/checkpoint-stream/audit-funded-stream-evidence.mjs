// Read-only public consistency. Full proof and approval binding must be checked
// separately by the fixed native verifier and actual spending-key circuit.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseLosslessJson} from '../../amm/u124/client.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {auditStreamEvidence, auditUpsRow} from './audit-evidence.mjs';
import {auditMinimumRow} from './audit-minimum-evidence.mjs';

export function auditFundedStreamRow(verification, request, plan, session) {
  const row = auditUpsRow(verification, request, plan, session);
  auditMinimumRow(plan, session); // Shared lifetime-fee/grant assertions only.
  assert.ok([5n, 6n, 8n, 9n, 13n].includes(plan.fields[0]), 'explicit deterministic phase');
  for (const optional of ['random', 'minimum']) {
    if (Object.hasOwn(plan, optional)) assert.equal(plan[optional], null);
  }
  for (const call of session.stack) assert.equal(call.caller_contract_id, 4294967296n);
  if (plan.fields[0] === 8n) {
    assert.ok(plan.fields[2] >= 1n && plan.fields[2] <= 4n, 'verified settlement page capacity');
    for (let i = 0; i < Number(plan.fields[2]); i++) {
      for (let limb = 24; limb < 30; limb++) {
        const value = plan.fields[limb + 13 * i];
        assert.ok(value >= 0n && value < 2n ** 62n, 'complete U124 limb range');
      }
    }
  }
  return row;
}

export function auditFixtureSourceAfterFunding(funding, source, plan) {
  const core = funding.user_ec_input.core;
  assert.ok(source.fields[6] > core.checkpoint_id, 'fresh fixture checkpoint follows funding proof');
  assert.equal(source.fields[6], plan.source.scope[6]);
  assert.equal(source.fields[4], plan.source.scope[4]);
  const vault = source.accounts.find(account => account.leaf.user_id === source.fields[4]);
  assert.ok(vault, 'vault authenticated in the complete source');
  assert.deepEqual(vault.leaf, core.new_user_leaf, 'exact accepted funding endpoint is in the new frozen source');
}

export async function auditFundedStreamEvidence(root) {
  const baseline = await auditStreamEvidence(root), markets = {};
  const phases = ['funding-grant', 'open', 'source-0', 'source-1', 'settle-0', 'settle-tail', 'timeout-tail', 'abort-source'];
  for (const market of ['amm', 'bondingcurve']) {
    const report = JSON.parse(await readFile(join(root, market + '-REPORT.json')));
    for (const [key, value] of Object.entries({profile: 'source-covered-deterministic-funded-bootstrap-v1',
      completeUps: 8, members: 5, sourcePages: 2, actualSyntheticFills: 3,
      cancelledRefund: true, slippageRefund: true, timeoutTailRefund: true,
      unacceptedSourceAbort: true, nativeConservationIncludingFees: true,
      legacySponsor: false, randomMode: false, ordinaryWalletUps: false,
      financialOperations: 0})) assert.equal(report[key], value, key);
    const rows = {}, hashes = {}, plans = {}; let scope, registered, fills = 0, refunds = 0, funding;
    for (const phase of phases) {
      const base = join(root, market + '-' + phase), files = {};
      for (const name of ['verification.json', 'request.json', 'plan.json', 'public-session.json', 'key-proof.bin']) {
        const bytes = await readFile(join(base, name)); hashes[market + '-' + phase + '/' + name] = sha256(bytes);
        if (name.endsWith('.json')) files[name] = name === 'verification.json'
          ? JSON.parse(bytes) : parseLosslessJson(bytes.toString());
      }
      const plan = files['plan.json'], session = files['public-session.json'];
      if (phase === 'funding-grant') funding = files['request.json'];
      plans[phase] = plan;
      rows[phase] = auditFundedStreamRow(files['verification.json'], files['request.json'], plan, session);
      assert.equal(files['verification.json'].keyFingerprint, report.keyFingerprint);
      if (!registered) registered = plan.registered_key;
      assert.deepEqual(plan.registered_key, registered, 'one exact funded key');
      if (phase !== 'funding-grant') {
        if (!scope) scope = plan.source.scope;
        assert.deepEqual(plan.source.scope, scope, 'one original source over normal and recovery forks');
      } else {
        assert.equal(plan.fields[0], 13n); assert.equal(plan.fields[21], 1n);
        assert.equal(plan.fields[22], BigInt(report.lifetimeCap)); assert.equal(plan.fields[23], 1n);
        assert.equal(session.actualCalls[0].inputs[6], 600n, 'fixture ordinary funding owner');
      }
      if (phase === 'open') {
        const bytes = await readFile(join(base, 'source.json'));
        hashes[market + '-open/source.json'] = sha256(bytes);
        auditFixtureSourceAfterFunding(funding, parseLosslessJson(bytes.toString()), plan);
      }
      if (['settle-0', 'settle-tail'].includes(phase)) {
        for (const call of session.actualCalls) {
          if (call.method_name === (market === 'amm' ? 'swap_0' : 'settle_limit_buy')) fills++;
          if (call.method_name === 'refund_funding'
            || call.method_name === (market === 'amm' ? 'batch_refund_swap_0' : 'batch_refund_curve_buy')) refunds++;
        }
      }
    }
    assert.equal(fills, 3); assert.equal(refunds, 2);
    assert.equal(plans['source-0'].source.before.accounts, 0n);
    assert.deepEqual(plans['source-0'].source.after, plans['source-1'].source.before);
    assert.equal(plans['source-1'].source.after.order_count, 5n);
    const sourceAccounts = Number(plans['source-1'].source.after.accounts);
    assert.equal(sourceAccounts, 8, 'all eight declared synthetic Native accounts');
    assert.equal(scope[7] - scope[6], 32n, 'unchanged deterministic source window');
    assert.equal(rows['funding-grant'].endLeaf, rows.open.startLeaf, 'grant to source opening state edge');
    const normal = phases.slice(0, 6);
    const fee = normal.reduce((sum, phase) => sum + BigInt(rows[phase].syntheticNativeFee), 0n);
    assert.equal(fee, BigInt(report.normalFeeUsed)); assert.ok(fee <= BigInt(report.lifetimeCap));
    markets[market] = {...baseline.markets[market], rows, sourceAccounts,
      normalPhases: normal, normalPhaseSeconds: normal.reduce((sum, phase) => sum + rows[phase].seconds, 0),
      normalSyntheticNativeFee: String(fee), lifetimeCap: String(report.lifetimeCap),
      nativeConservationRecorded: true, sourceContainsExactFundingEndpoint: true,
      actualSyntheticFills: fills, normalTerminalRefunds: refunds, fileSha256: hashes};
  }
  return {schema: 1, completeUps: 16, cryptographicVerificationPerformed: false,
    scope: 'Public consistency of separately native-verified deterministic v14 settlement/recovery; not approval verification, receipt, ordinary wallet arrival or production acceptance',
    financialOperations: 0, canBroadcast: false, markets};
}
if (process.argv.length === 3 && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.stdout.write(JSON.stringify(await auditFundedStreamEvidence(resolve(process.argv[2])), null, 2) + '\n');
