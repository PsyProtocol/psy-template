// A deliberately omitted, consented sender exits only after the epoch closes.
// The admission plan is empty: this is bounded no-service recovery, not fairness.
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {cohort, formal, pause} from './candidateHarness.mjs';
import {read, save, run, binding} from '../../batching/admission/liveSupport.mjs';
import {publicState} from '../publicState.mjs';
import {call, encodeAmount, FEE_ESCROW as F, parseLosslessJson} from '../../amm/u124/client.mjs';
import {sponsorCalls, curveLimitCalls} from '../../batching/v2/client.mjs';
import {cohortAssets, payoutClaims, canonicalHeldNfts} from '../../batching/admission/liveAssets.mjs';
import {enrolledRecovery} from './enrolledRecovery.mjs';

const [base, original] = process.argv.slice(2), h = cohort(base, original), unit = 10n ** 18n;
assert.ok(existsSync(join(base, 'public/maximum-complete-v1.json')));
const actor = h.actors.bob, services = [], a = h.by.amm, b = h.by.orderbook,
 c = h.by.bondingcurve, n = h.by.nftmarket;
// Independent vault anchors may progress together. Settle all results before
// surfacing an error, so no sibling financial job continues behind a retry.
const independent = async jobs => {const results = await Promise.allSettled(jobs.map(job => job())); const failed = results.find(r => r.status === 'rejected'); if (failed) throw failed.reason;};
const spec = h.assetSpec;
const beforePath = join(base, 'public/omitted-assets-before.json');
if (!existsSync(beforePath)) save(beforePath, await cohortAssets(await publicState(h.config), spec));
const deadline = BigInt((await publicState(h.config)).checkpoint) + 2048n;
// Before consent, a sender can release immediately without service. This QA
// order is deliberately unfunded; it cannot withdraw any other sender's funds.
await h.user('bob', 'omitted-bob-before-consent-exit', [
 a.order('close_swap_0', []), a.order('open_swap', [BigInt(a.vault), 0n, encodeAmount(unit), encodeAmount(1n), deadline, h.bobLpNonce + 2n]),
 a.order('request_cancel', []), a.order('release_unaccepted', []), a.order('request_recovery', [BigInt(a.vault)])
]);
const immediatePath = join(base, 'public/omitted-before-consent-immediate-exit.json');
if (!existsSync(immediatePath)) {const s = await publicState(h.config), kind = a.abi.contract.state.find(x => x.name === 'kind').offset;
 assert.equal(await s.slot(actor.id, a.id, kind), 0n);
 save(immediatePath, {checkedAt: new Date().toISOString(), market: a.id, userId: actor.id, funded: false, admissionConsentSigned: false, releasedInSameOrdinaryUps: true, otherSenderFundsWithdrawn: false});}
await h.user('bob', 'omitted-bob-ft-orders', [
 a.order('open_swap', [BigInt(a.vault), 0n, encodeAmount(unit), encodeAmount(1n), deadline, h.bobLpNonce + 3n]),
 {contract_id: 0n, method_name: 'simple_transfer', inputs: [BigInt(a.vault), F]}, call(2464n, h.token, 'transfer', [BigInt(a.vault), encodeAmount(unit)]),
 b.order('close_0', []), b.order('open_sell', [BigInt(b.vault), 0n, encodeAmount(unit), encodeAmount(unit), deadline, 2n]),
 {contract_id: 0n, method_name: 'simple_transfer', inputs: [BigInt(b.vault), F]}, call(2464n, h.token, 'transfer', [BigInt(b.vault), encodeAmount(unit)]),
 c.order('close_buy', []), ...curveLimitCalls({marketId: BigInt(c.id), marketAbi: c.abi, tokenAbi: h.token, config: c.driverConfig, vaultId: BigInt(c.vault), buy: true, lots: 1n, quoteLimit: 2n * unit, deadline, nonce: 2n})
]);
await h.user('bob', 'omitted-bob-nft-order', [n.order('close_buy', []), call(2467n, h.nft, 'acknowledge', [BigInt(n.vault)]),
 n.order('open_listing', [BigInt(n.vault), 0n, encodeAmount(5n * unit), deadline, 2n]),
 {contract_id: 0n, method_name: 'simple_transfer', inputs: [BigInt(n.vault), F]}, call(2467n, h.nft, 'transfer', [0n, BigInt(n.vault)])]);
const planPath = join(base, 'public/omitted-plan-v1.json');
if (!existsSync(planPath)) { const s = await publicState(h.config),epochs={};for(const m of h.markets){const n=await s.slot(m.vault,m.id,m.abi.contract.state.find(f=>f.name==='queue_epoch').offset);assert.ok(n>=0n&&n<4294967295n);epochs[m.kind]=Number(n)+1;}save(planPath, {cutoff: s.checkpoint + 128, epochs, members: []}); }
const plan = read(planPath);
async function fund(label) {
 const s = await publicState(h.config), calls = [];
 for (const m of h.markets) { const f = m.abi.contract.state.find(x => x.name === 'sponsor_nonce');
  calls.push(...sponsorCalls({marketId: BigInt(m.id), abi: m.abi, vaultId: BigInt(m.vault), nonce: await s.slot(h.actors.sponsor.id, m.id, f.offset) + 1n, purpose: 2n, amount: F})); }
 await h.user('sponsor', label, calls);
}
const operation = method => t => t.kind === 'batch_maintenance' && parseLosslessJson(t.submission).contract_calls.some(x => x.method_name === method);
try {
 for (const m of h.markets) services.push(await formal(h, m, 'omitted', {version: 1, epoch: plan.epochs[m.kind], cutoff: plan.cutoff, members: []}));
 await fund('omitted-start-fund');
 await independent(services.map((service, i) => () => service.step('omitted-' + h.markets[i].kind + '-start', operation('start_epoch'),{cliOnce:true})));
 await h.user('bob', 'omitted-bob-consent-cancel', h.markets.flatMap(m => [m.order('request_admission', [BigInt(plan.epochs[m.kind]), BigInt(plan.cutoff)]), m.order('request_cancel', [])]));
 // Prove-only negative gate. A failure cannot transmit, and own state must not move.
 const negative = join(base, 'public/omitted-early-release-negative.json');
 if (!existsSync(negative)) {
  const input = join(base, 'public/omitted-early-release-input.json'), out = join(base, 'attempts/omitted-early-release-negative'), log = join(base, 'omitted-early-release-negative.log');
  // A completed negative proof is evaluated from its preserved record, never re-proved.
  if (!existsSync(log)) {
   const s = await publicState(h.config), calls = h.markets.map(m => m.order('release_unaccepted', []));
   const ids = [...new Set([0, ...calls.map(x => Number(x.contract_id))])];
   const contracts = await Promise.all(ids.map(async id => {const expected = h.bindings.get(id); assert.deepEqual(await binding(s, id), expected); return expected;}));
   save(input, {calls: {contract_calls: calls, software_defined_call: {inputs: []}}, contracts, validUntilCheckpoint: s.checkpoint + 64});
   let rejected = false;
   try {await run(h.ordinaryBinary, ['preflight', h.config, actor.secret, input, out], log, h.env);} catch {rejected = true;}
   assert.ok(rejected, 'consented terms must remain locked while omitted epoch is open');
  }
  assert.ok(!existsSync(join(out, 'intent.json')) && !existsSync(join(out, 'request.json')) && !existsSync(join(out, 'preflight.json')), 'negative proof must not reach transmission');
  // The reviewed wallet suppresses contract error text; only static codes leave the process.
  const failure = read(join(out, 'failure.json'));
  assert.equal(failure.phase, 'prove-ordinary-calls');
  assert.equal(failure.reasonCode, 'REJECTED_REVIEW_REQUIRED');
  assert.equal(failure.broadcastMayHaveBeenAttempted, false);
  const s = await publicState(h.config), locked = [];
  for (const m of h.markets) {
   const slot = name => s.slot(actor.id, m.id, m.abi.contract.state.find(x => x.name === name).offset);
   const [kind, cancelled, orderNonce, admissionNonce, admissionEpoch] = await Promise.all(['kind', 'cancelled', 'nonce', 'admission_nonce', 'admission_epoch'].map(slot));
   assert.notEqual(kind, 0n); assert.equal(cancelled, 1n); assert.equal(admissionNonce, orderNonce); assert.equal(admissionEpoch, BigInt(plan.epochs[m.kind]));
   locked.push({market: m.id, kind: String(kind), cancelled: true, admissionEpoch: String(admissionEpoch), admissionNonce: String(admissionNonce)});
  }
  save(negative, {checkedAt: new Date().toISOString(), checkpoint: s.checkpoint, rejected: true, marketIds: h.markets.map(m => m.id), failurePhase: failure.phase, reasonCode: failure.reasonCode, suppressedErrorSha256: failure.suppressedErrorSha256, stillLockedAfterRejection: locked,
   reasonAttribution: 'contract text is suppressed by the reviewed wallet; the same consented+cancelled release is pinned to "admission consent locks terms until epoch closure" by the VM regression refused_admission_sender_can_opt_out_and_enroll_exact_recovery on byte-identical release_unaccepted source; the identical release succeeds only after abort (omitted-bob-release-enroll)',
   scope: 'first failing assertion rejects the combined call stack; all four negative CFCs are separately archived', broadcastAttempted: false});
 }
 await fund('omitted-abort-fund');
 while ((await publicState(h.config)).checkpoint <= plan.cutoff) await pause(10000);
 // A resolved never-connected abort keeps its original task file; the replacement is scanned fresh.
 const abortLabel = kind => existsSync(join(base, 'public', 'omitted-' + kind + '-abort-nonsubmission-v1.json')) ? 'omitted-' + kind + '-abort-retry-v1' : 'omitted-' + kind + '-abort';
 await independent(services.map((service, i) => () => service.step(abortLabel(h.markets[i].kind), operation('abort_empty_epoch'))));
 await h.user('bob', 'omitted-bob-release-enroll', h.markets.flatMap(m => [m.order('release_unaccepted', []), m.order('request_recovery', [BigInt(m.vault)])]));
 // Abort consumed its gas grant. A fresh bounded two-fee authorization is
 // needed for fund-gas + return; NFT delivery can require a second grant.
 // Never assume previous economic settlement left sufficient vault gas.
 await enrolledRecovery(h,services,{prefix:'omitted-recovery',owners:[actor.id],maxGrantsPerMarket:2,maxRounds:12});
 await h.user('bob', 'omitted-bob-claim', await payoutClaims(await publicState(h.config), {userId: actor.id, markets: h.markets, tokenAbi: h.token, nftAbi: h.nft, nftSlot: 0}));
 const before = parseLosslessJson(readFileSync(beforePath, 'utf8')), after = await cohortAssets(await publicState(h.config), spec);
 for (const asset of spec.assets) {assert.equal(after.totals[asset], 1000n * unit); assert.equal(after.accounts[actor.id].ft[asset], before.accounts[actor.id].ft[asset]);}
 assert.deepEqual(canonicalHeldNfts(after.nfts), canonicalHeldNfts(before.nfts));
 assert.equal(before.nftTotal,2n);assert.equal(after.nftTotal,2);assert.equal(after.nftPending.length,0);
 let userFees = 0n, totalFees = 0n;
 for (const name of readdirSync(join(base, 'attempts')).filter(x => x.startsWith('omitted-'))) {const p = join(base, 'attempts', name, 'included.json'); if (!existsSync(p)) continue; const r = read(p); const fee = BigInt(r.receipt.data.result.fees_collected); totalFees += fee; if (r.receipt.data.owner_user_id === actor.id) userFees += fee;}
 for (const f of services) for (const r of (await f.journal.records()).filter(x => x.status === 'included' && Number(x.result.checkpoint) > Number(before.checkpoint))) totalFees += BigInt(r.result.receipt.data.result.fees_collected);
 assert.equal(before.accounts[actor.id].native - after.accounts[actor.id].native, userFees, 'all sender principal and all four fee escrows returned');
 assert.equal(before.nativeTotal - after.nativeTotal, totalFees, 'global native delta equals actual included fees');
 save(join(base, 'public/omitted-assets-after.json'), after);
 save(join(base, 'public/omitted-complete-v1.json'), {completedAt: new Date().toISOString(), marketIds: h.markets.map(m => m.id), deliberatelyOmitted: actor.id, acceptedMembers: 0, terminalEpochRequired: true, ordinaryClaimsIncluded: true, originalSenderFtNftAndNativePrincipalReturned: true, userFees, totalFees, globalFairnessClaim: false});
} finally {for (const f of services) await f.close();}
