// On-chain two-hop check. Hop 1 is the existing AMM. Hop 2 is a newly deployed
// copy of that AMM, so the route is A→B→A across two pools. The completed
// acceptance case is only read. No old contract is updated and nothing is retried
// after an ambiguous send.
import assert from 'node:assert/strict';
import {cpSync, existsSync, mkdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {formal, pause} from '../executor/acceptance/candidateHarness.mjs';
import {read, run, save, confirmDeploy, ordinary} from '../batching/admission/liveSupport.mjs';
import {registerMarket} from '../batching/admission/liveMarket.mjs';
import {LiveMarket} from '../batching/admission/liveMarket.mjs';
import {publicState} from '../executor/publicState.mjs';
import {call, encodeAmount, FEE_ESCROW as F, decodeSlots, parseLosslessJson} from '../amm/u124/client.mjs';
import {sponsorCalls, activationFunding} from '../batching/v2/client.mjs';
import {payoutClaims} from '../batching/admission/liveAssets.mjs';
import {planExactRoute} from './route.mjs';

const [parent, original, fresh] = process.argv.slice(2);
assert.ok(parent && original && fresh, 'PARENT ORIGINAL FRESH');
assert.notEqual(fresh, parent, 'fresh case must not be the completed acceptance case');
const tools = read(join(parent, 'public/candidate-toolchain-v4.json'));
const env = {PSY_MARKET_TESTNET_PROFILE: 'staging-bundled-regtest-20261020-v1', RAYON_NUM_THREADS: '2'};
const unit = 10n ** 18n, lpAmount = 5n * unit, swapInput = unit;
const actors = {
 bob: {id: 860352, secret: join(original, '.secrets/bob-bundled-profile-v1.json')},
 sponsor: {id: 1384640, secret: join(original, '.secrets/sponsor-bundled-profile-v1.json')},
};
const deployer = read(join(parent, 'public/deploy-amm-identity.json')).publicKeyHash;
const sourceBuild = join(parent, 'markets-v1/amm');
const hopBuild = join(fresh, 'markets-v1/amm-hop2');
const config = join(fresh, 'public/rpc.json');
mkdirSync(join(fresh, 'public'), {recursive: true});
mkdirSync(join(fresh, 'attempts'), {recursive: true});
if (!existsSync(config)) cpSync(join(parent, 'public/rpc.json'), config);
if (!existsSync(hopBuild)) {
 mkdirSync(join(fresh, 'markets-v1'), {recursive: true});
 cpSync(sourceBuild, hopBuild, {recursive: true});
 rmSync(join(hopBuild, 'bound'), {recursive: true, force: true});
 rmSync(join(hopBuild, 'live-registration.json'), {force: true});
}
const ordinaryBinary = tools.ordinaryBinary, compactBinary = tools.compactBinary;
const tokenAbi = read(join(sourceBuild, 'token-a.json')).abi;
const hop1Registration = read(join(sourceBuild, 'live-registration.json'));
const log = (...a) => console.log(new Date().toISOString(), ...a);

function unsent(label) {
 const out = join(fresh, 'attempts', label), failure = join(out, 'failure.json');
 return existsSync(failure) && !existsSync(join(out, 'included.json')) && !existsSync(join(out, 'preflight.json')) && !existsSync(join(out, 'request.json')) && read(failure).broadcastMayHaveBeenAttempted === false;
}
async function user(actor, label, calls, bindings) {
 let name = label;
 for (let i = 1; i <= 4 && unsent(name); i++) name = label + '-retry-v' + i;
 const out = join(fresh, 'attempts', name);
 if (existsSync(join(out, 'included.json'))) return out;
 return ordinary({base: fresh, config, binary: ordinaryBinary, secret: actors[actor].secret, name, calls, bindings, env});
}
function market(build, registration) {
 return new LiveMarket({base: fresh, config, build, registration, policy: read(join(build, 'bound/policy.json')), contracts: registration.contracts, ordinaryBinary, compactBinary, env, actors});
}
const harness = {base: fresh, config, binary: compactBinary, binarySha256: tools.compactBinarySha256, env, actors};
const taskNamed = name => t => t.kind === 'batch_maintenance' && parseLosslessJson(t.submission).contract_calls.some(c => c.method_name === name);
async function fund(m, label, purpose) {
 if (existsSync(join(fresh, 'attempts', label, 'included.json'))) return;
 const s = await publicState(config), off = m.abi.contract.state.find(f => f.name === 'sponsor_nonce').offset;
 await user('sponsor', label, sponsorCalls({marketId: BigInt(m.id), abi: m.abi, vaultId: BigInt(m.vault), nonce: await s.slot(actors.sponsor.id, m.id, off) + 1n, purpose: BigInt(purpose), amount: purpose === 1 ? 2n * F : F}), new Map(m.contracts.map(b => [b.contract.contractId, b])));
}
async function waitPast(checkpoint) {while ((await publicState(config)).checkpoint <= checkpoint) await pause(10000);}
async function reserves(m) {
 const s = await publicState(config), slots = new Map();
 for (const name of ['reserve_a', 'reserve_b']) {
  const field = m.abi.contract.state.find(f => f.name === name);
  for (let i = 0; i < field.felt_size; i++) slots.set(BigInt(field.offset + i), await s.slot(m.vault, m.id, field.offset + i));
 }
 return {a: decodeSlots(m.abi, 'reserve_a', slots).value, b: decodeSlots(m.abi, 'reserve_b', slots).value};
}
async function submitted(f, label, expected) {
 for (let i = 0; i < 8; i++) {
  try {return await f.step(label, expected);}
  catch (error) {
   const message = String(error.message);
   const retryable = (message.includes('explicit pre-broadcast rejection') && message.includes('error sending request')) || message.includes('public read unavailable after bounded retries');
   if (!retryable) throw error;
   await pause(15000);
  }
 }
 throw Error('pre-broadcast connection rejection remained after the saved proof was reused');
}
async function runEpoch(m, tag, plan, order) {
 const f = await formal(harness, m, tag, plan, {expiry: 96});
 try {
  await fund(m, tag + '-start-fund', 2); await submitted(f, tag + '-start', taskNamed('start_epoch'));
  if (order) await order();
  await fund(m, tag + '-admit-fund', 2); await submitted(f, tag + '-admit', taskNamed('admit_entry'));
  await fund(m, tag + '-seal-fund', 2); await waitPast(plan.cutoff); await submitted(f, tag + '-seal', taskNamed('seal_epoch'));
  await fund(m, tag + '-commit-fund', 1); await submitted(f, tag + '-commit', t => t.kind === 'batch_commit');
  await submitted(f, tag + '-settle', t => t.kind === 'batch_settle');
 } finally {await f.close();}
}

async function reconcileAllocatedDeploy(deployDir) {
 const before = read(join(deployDir, 'before.json')), preflight = read(join(deployDir, 'preflight.json')), floor = before.next_contract_id;
 assert.equal(preflight.expectedDeployer, deployer);
 const s = await publicState(config);
 const at = cp => s.rpc(s.coordinator, 'psy_get_l2_block_state', {checkpoint_id: cp});
 assert.equal((await at(before.checkpoint_id)).next_contract_id, floor, 'allocation floor moved before the saved broadcast');
 const anchor = (await s.rpc(s.coordinator, 'psy_get_latest_l2_block_state', {})).checkpoint_id;
 assert.ok(anchor > before.checkpoint_id && (await at(anchor)).next_contract_id > floor, 'saved deployment was not allocated');
 let low = before.checkpoint_id, high = anchor;
 while (high - low > 1) {const mid = Math.floor((high + low) / 2); if ((await at(mid)).next_contract_id > floor) high = mid; else low = mid;}
 const leaf = await s.contractLeaf(floor);
 assert.equal(leaf.deployer, deployer);
 for (const [actual, expected] of [['code_root', 'codeRoot'], ['function_tree_root', 'functionTreeRoot'], ['state_layout_root', 'layoutRoot'], ['state_tree_height', 'stateTreeHeight'], ['state_layout_field_count', 'newFieldCount'], ['state_layout_slot_count', 'newSlotCount']]) assert.equal(leaf[actual], preflight[expected], actual);
 const services = read(config).networks.sepolia.api_services_url[0].replace(/\/$/, '');
 const indexed = await (await fetch(services + '/api/v1/transaction/hash/' + read(join(deployDir, 'receipt.json')).receipt, {signal: AbortSignal.timeout(20000)})).json();
 const indexedId = indexed.data?.result?.contract_id ?? null;
 save(join(deployDir, 'included.json'), {checkedAt: new Date().toISOString(), checkpoint: s.checkpoint, contractId: floor, includedCheckpoint: high, beforeCheckpoint: before.checkpoint_id, leaf, preflight, requestSaved: true, servicesIndexedReceiptVerified: indexedId === floor, indexedContractId: indexedId, indexedIncludedCheckpoint: indexed.data?.included_checkpoint_id ?? null});
}
const deployDir = join(fresh, 'attempts/composition-deploy-amm-v1');
if (!existsSync(join(deployDir, 'included.json'))) {
 if (!existsSync(deployDir)) {
  const deployLog = join(fresh, existsSync(join(fresh, 'composition-deploy-amm-v1.log')) ? 'composition-deploy-amm-v2.log' : 'composition-deploy-amm-v1.log');
  const timing = await run(ordinaryBinary, ['deploy', config, join(parent, '.secrets/deploy-amm.json'), join(sourceBuild, 'compiled/compilation_artifact.json'), deployDir], deployLog, env);
  save(join(deployDir, 'timing.json'), timing);
 } else for (const name of ['request.json', 'receipt.json', 'before.json', 'preflight.json', 'intent.json']) assert.ok(existsSync(join(deployDir, name)), 'incomplete deployment ' + name);
 let confirmed = false;
 try {await confirmDeploy(config, deployDir, deployer); confirmed = true;}
 catch (error) {if (!String(error.message).includes('historical deployment ID precedes this attempt allocation floor')) throw error;}
 if (!confirmed) await reconcileAllocatedDeploy(deployDir);
}
const deployment = read(join(deployDir, 'included.json'));
log('second AMM', deployment.contractId);
if (!existsSync(join(hopBuild, 'live-registration.json'))) {
 const dependencies = hop1Registration.contracts.filter(b => b.contract.contractId !== hop1Registration.marketId);
 await registerMarket({base: fresh, config, build: hopBuild, deployment, dependencies, compactBinary, env, admissionMode: 'all-four-v1'});
}
const hop1 = market(sourceBuild, hop1Registration);
const hop2 = market(hopBuild, read(join(hopBuild, 'live-registration.json')));
const bindings = new Map([...hop1.contracts, ...hop2.contracts].map(b => [b.contract.contractId, b]));
log('pools', hop1.id, hop1.vault, hop2.id, hop2.vault);

if (!existsSync(join(fresh, 'public/composition-hop2-activated-v1.json'))) {
 const failedFund = join(fresh, 'attempts/composition-hop2-activation-fund');
 const fundLabel = existsSync(join(failedFund, 'failure.json')) && !existsSync(join(failedFund, 'preflight.json')) ? 'composition-hop2-activation-fund-retry-v1' : 'composition-hop2-activation-fund';
 await user('bob', fundLabel, activationFunding({market: 'amm', config: hop2.driverConfig, tokenAbi, vaultId: BigInt(hop2.vault)}), bindings);
 const f = await formal(harness, hop2, 'composition-activate', {version: 1, epoch: 1, cutoff: 1, members: []});
 try {await f.step('composition-hop2-activate', taskNamed('activate_batch_vault'));} finally {await f.close();}
 const s = await publicState(config), claims = await payoutClaims(s, {userId: actors.bob.id, markets: [hop2], tokenAbi, allowEmpty: true});
 if (claims.length) await user('bob', 'composition-hop2-activation-claim', claims, bindings);
 save(join(fresh, 'public/composition-hop2-activated-v1.json'), {checkedAt: new Date().toISOString(), marketId: hop2.id, vaultId: hop2.vault});
}

const lpPlanPath = join(fresh, 'public/composition-lp-plan-v1.json');
if (!existsSync(lpPlanPath)) {
 const s = await publicState(config), epoch = Number(await s.slot(hop2.vault, hop2.id, hop2.abi.contract.state.find(f => f.name === 'queue_epoch').offset)) + 1;
 save(lpPlanPath, {version: 1, epoch, cutoff: s.checkpoint + 128, members: [{owner: actors.bob.id, nonce: '1'}]});
}
const lpPlan = read(lpPlanPath);
if (!existsSync(join(fresh, 'attempts/composition-lp-order/included.json'))) {
 const deadline = BigInt(lpPlan.cutoff) + 2048n;
 await user('bob', 'composition-lp-order', [hop2.order('open_add', [BigInt(hop2.vault), encodeAmount(lpAmount), encodeAmount(lpAmount), encodeAmount(lpAmount - 1000n), deadline, 1n]), {contract_id: 0n, method_name: 'simple_transfer', inputs: [BigInt(hop2.vault), F]}, ...['assetA', 'assetB'].map(k => call(BigInt(hop2.driverConfig[k]), tokenAbi, 'transfer', [BigInt(hop2.vault), encodeAmount(lpAmount)]))], bindings);
}
await runEpoch(hop2, 'composition-lp', lpPlan, () => user('bob', 'composition-lp-consent', [hop2.order('request_admission', [BigInt(lpPlan.epoch), BigInt(lpPlan.cutoff)])], bindings));
const seeded = await reserves(hop2);
assert.equal(seeded.a, lpAmount); assert.equal(seeded.b, lpAmount);
log('hop2 reserves', seeded.a.toString(), seeded.b.toString());

const routePath = join(fresh, 'public/composition-route-plan-v1.json');
if (!existsSync(routePath)) {
 const first = await reserves(hop1), second = await reserves(hop2), s = await publicState(config);
 const off = hop1.abi.contract.state.find(f => f.name === 'nonce').offset;
 const nonce = await s.slot(actors.bob.id, hop1.id, off) + 1n;
 const route = planExactRoute({input: swapInput, minimumOut: 1n, hops: [
  {marketId: BigInt(hop1.id), assetIn: 2464n, assetOut: 2466n, reserveIn: first.a, reserveOut: first.b},
  {marketId: BigInt(hop2.id), assetIn: 2466n, assetOut: 2464n, reserveIn: second.b, reserveOut: second.a},
 ]});
 const epoch = Number(await s.slot(hop1.vault, hop1.id, hop1.abi.contract.state.find(f => f.name === 'queue_epoch').offset)) + 1;
 save(routePath, {route: JSON.parse(JSON.stringify(route, (_, v) => typeof v === 'bigint' ? v.toString() : v)), hop1ReserveA: first.a.toString(), hop1ReserveB: first.b.toString(), hop2ReserveA: second.a.toString(), hop2ReserveB: second.b.toString(), bobHop1Nonce: nonce.toString(), hop1Epoch: epoch, cutoff: s.checkpoint + 128});
}
const planned = read(routePath), route = planned.route;
const hop1Plan = {version: 1, epoch: planned.hop1Epoch, cutoff: planned.cutoff, members: [{owner: actors.bob.id, nonce: planned.bobHop1Nonce}]};
if (!existsSync(join(fresh, 'attempts/composition-hop1-order/included.json'))) {
 await user('bob', 'composition-hop1-order', [hop1.order('open_swap', [BigInt(hop1.vault), 0n, encodeAmount(swapInput), encodeAmount(BigInt(route.hops[0].output)), BigInt(planned.cutoff) + 2048n, BigInt(planned.bobHop1Nonce)]), {contract_id: 0n, method_name: 'simple_transfer', inputs: [BigInt(hop1.vault), F]}, call(2464n, tokenAbi, 'transfer', [BigInt(hop1.vault), encodeAmount(swapInput)])], bindings);
}
await runEpoch(hop1, 'composition-hop1', hop1Plan, () => user('bob', 'composition-hop1-consent', [hop1.order('request_admission', [BigInt(planned.hop1Epoch), BigInt(planned.cutoff)])], bindings));
const afterFirst = await reserves(hop1);
assert.equal(afterFirst.a, BigInt(planned.hop1ReserveA) + swapInput);
assert.equal(afterFirst.b, BigInt(planned.hop1ReserveB) - BigInt(route.hops[0].output), 'hop1 output moved off the planned floor');
log('hop1 settled', route.hops[0].output);

const midClaims = await payoutClaims(await publicState(config), {userId: actors.bob.id, markets: [hop1], tokenAbi, allowEmpty: true});
if (midClaims.length) await user('bob', 'composition-hop1-claim', midClaims, bindings);
const hop2PlanPath = join(fresh, 'public/composition-hop2-plan-v1.json');
if (!existsSync(hop2PlanPath)) {
 const s = await publicState(config), epoch = Number(await s.slot(hop2.vault, hop2.id, hop2.abi.contract.state.find(f => f.name === 'queue_epoch').offset)) + 1;
 save(hop2PlanPath, {version: 1, epoch, cutoff: s.checkpoint + 128, members: [{owner: actors.bob.id, nonce: '2'}]});
}
const hop2Plan = read(hop2PlanPath);
if (!existsSync(join(fresh, 'attempts/composition-hop2-order/included.json'))) {
 await user('bob', 'composition-hop2-order', [hop2.order('close_add', []), hop2.order('open_swap', [BigInt(hop2.vault), 1n, encodeAmount(BigInt(route.hops[1].input)), encodeAmount(BigInt(route.hops[1].output)), BigInt(hop2Plan.cutoff) + 2048n, 2n]), {contract_id: 0n, method_name: 'simple_transfer', inputs: [BigInt(hop2.vault), F]}, call(2466n, tokenAbi, 'transfer', [BigInt(hop2.vault), encodeAmount(BigInt(route.hops[1].input))])], bindings);
}
await runEpoch(hop2, 'composition-hop2', hop2Plan, () => user('bob', 'composition-hop2-consent', [hop2.order('request_admission', [BigInt(hop2Plan.epoch), BigInt(hop2Plan.cutoff)])], bindings));
const endClaims = await payoutClaims(await publicState(config), {userId: actors.bob.id, markets: [hop2], tokenAbi, allowEmpty: true});
if (endClaims.length) await user('bob', 'composition-hop2-claim', endClaims, bindings);
const afterSecond = await reserves(hop2);
assert.equal(afterSecond.b, lpAmount + BigInt(route.hops[1].input));
assert.equal(afterSecond.a, lpAmount - BigInt(route.hops[1].output));
save(join(fresh, 'public/composition-live-complete-v1.json'), {completedAt: new Date().toISOString(), hop1Market: hop1.id, hop2Market: hop2.id, input: route.input, intermediate: route.hops[0].output, finalOutput: route.finalOutput, invokeSync: false, atomic: false, productionReady: false});
log('two-hop complete', route.input, route.hops[0].output, route.finalOutput);
