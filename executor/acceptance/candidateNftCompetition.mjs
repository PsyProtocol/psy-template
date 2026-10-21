// Corrected fresh NFT candidate: four members, two buyers for one listing,
// independent journals with valid competing proofs, lost parent response,
// nonempty expiry and same-set refreeze with a cancelled second listing.
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {cohort, formal, pause} from './candidateHarness.mjs';
import {read, save} from '../../batching/admission/liveSupport.mjs';
import {publicState} from '../publicState.mjs';
import {call, encodeAmount, FEE_ESCROW as F, parseLosslessJson} from '../../amm/u124/client.mjs';
import {sponsorCalls, nftBuyCalls} from '../../batching/v2/client.mjs';
import {cohortAssets, payoutClaims} from '../../batching/admission/liveAssets.mjs';
const [base, original] = process.argv.slice(2), h = cohort(base, original), m = h.by.nftmarket, unit = 10n ** 18n;
assert.ok(existsSync(join(base, 'public/omitted-complete-v1.json')));
const spec = {users: [...Object.values(h.actors).map(x => x.id), ...h.markets.map(x => x.vault), ...h.markets.map(x => read(join(original, 'markets-v1', x.kind, 'live-registration.json')).vaultId), 1695936], assets: [2464, 2466], nftId: 2467};
const beforePath = join(base, 'public/nft-competition-assets-before.json');
if (!existsSync(beforePath)) save(beforePath, await cohortAssets(await publicState(h.config), spec));
const names = ['bob', 'trader', 'charlie', 'dave'], services = [];
const operation = method => t => t.kind === 'batch_maintenance' && parseLosslessJson(t.submission).contract_calls.some(c => c.method_name === method);
async function fund(label, purpose = 2) { const s = await publicState(h.config), off = m.abi.contract.state.find(f => f.name === 'sponsor_nonce').offset;
 await h.user('sponsor', label, sponsorCalls({marketId: BigInt(m.id), abi: m.abi, vaultId: BigInt(m.vault), nonce: await s.slot(h.actors.sponsor.id, m.id, off) + 1n, purpose: BigInt(purpose), amount: purpose === 1 ? 2n * F : F})); }
async function waitPast(checkpoint) {while ((await publicState(h.config)).checkpoint <= checkpoint) await pause(10000);}
const deadline = BigInt((await publicState(h.config)).checkpoint) + 2048n;
for (const name of ['bob', 'dave']) await h.user(name, 'nft-competition-' + name + '-listing', [
 ...(name === 'dave' ? [m.order('close_buy', [])] : []),
 call(2467n, h.nft, 'acknowledge', [BigInt(m.vault)]), m.order('open_listing', [BigInt(m.vault), 0n, encodeAmount(5n * unit), deadline, name === 'bob' ? 3n : 2n]),
 {contract_id: 0n, method_name: 'simple_transfer', inputs: [BigInt(m.vault), F]}, call(2467n, h.nft, 'transfer', [0n, BigInt(m.vault)])]);
for (const name of ['trader', 'charlie']) await h.user(name, 'nft-competition-' + name + '-buy', [m.order('close_listing', []),
 ...nftBuyCalls({marketId: BigInt(m.id), marketAbi: m.abi, config: m.driverConfig, nftAbi: h.nft, tokenAbi: h.token, vaultId: BigInt(m.vault), seller: BigInt(h.actors.bob.id), listingNonce: 3n, price: 5n * unit, deadline, nonce: 2n})]);
const planPath = join(base, 'public/nft-competition-plan-v1.json');
if (!existsSync(planPath)) {const s = await publicState(h.config), off = m.abi.contract.state.find(x => x.name === 'order_checkpoint').offset;
 const buyers = await Promise.all(['trader', 'charlie'].map(async name => ({name, owner: h.actors[name].id, orderCheckpoint: String(await s.slot(h.actors[name].id, m.id, off))})));
 buyers.sort((a, b) => Number(BigInt(a.orderCheckpoint) - BigInt(b.orderCheckpoint)) || a.owner - b.owner);
 save(planPath, {version: 1, epoch: 3, cutoff: s.checkpoint + 96, members: names.map(name => ({owner: h.actors[name].id, nonce: name === 'bob' ? '3' : '2'})).sort((a, b) => a.owner - b.owner), buyers, expectedWinner: buyers[0].name});}
const p = read(planPath), plan = {version: 1, epoch: p.epoch, cutoff: p.cutoff, members: p.members};
try {
 const f = await formal(h, m, 'nft-competition', plan, {expiry: 24}); services.push(f);
 await fund('nft-competition-start-fund'); await f.step('nft-competition-start', operation('start_epoch'));
 for (const name of names) await h.user(name, 'nft-competition-' + name + '-consent', [m.order('request_admission', [3n, BigInt(p.cutoff)])]);
 await fund('nft-competition-admit-0-fund');
 const raceFile = join(base, 'public/nft-competition-independent-journals.json');
 if (!existsSync(raceFile)) {
  // Both proofs are complete and durable before either broadcast. The winner
  // is deliberately released first; the loser must reject its stale anchor.
  // This is NOT represented as two simultaneous RPC submissions.
  const contender = await formal(h, m, 'nft-competition-contender', {...plan, members: [p.members.find(x => x.owner === h.actors.bob.id)]}, {expiry: 24, runtimeSuffix: '-independent-contender'}); services.push(contender);
  const second = await contender.adapter.scan(); assert.ok(operation('admit_entry')(second.action));
  const first = await f.adapter.scan(); assert.ok(operation('admit_entry')(first.action));
  assert.notEqual(first.action.submission, second.action.submission);
  save(join(base, 'public/nft-competition-contender-task.json'), second.action);
  let readyA, readyB, releaseA, releaseB;
  const ready = [new Promise(r => readyA = r), new Promise(r => readyB = r)];
  const gates = [new Promise(r => releaseA = r), new Promise(r => releaseB = r)];
  const submitA = f.adapter.submit, submitB = contender.adapter.submit;
  f.adapter.submit = async (...a) => {readyA(); await gates[0]; await submitA(...a); throw Error('acceptance discards parent submit result after durable child send');};
  contender.adapter.submit = async (...a) => {readyB(); await gates[1]; return submitB(...a);};
  const a = f.step('nft-competition-admit-0', operation('admit_entry'));
  const b = contender.journal.execute({task: second.action, ...contender.adapter});
  // If a prover fails, break the barrier and surface its exact failure.
  const barrier = Promise.all(ready);
  await Promise.race([barrier, a.then(() => {throw Error('winner escaped proof barrier');}), b.then(() => {throw Error('contender escaped proof barrier');})]);
  const preparedA = (await f.journal.records()).findLast(x => x.status === 'proved').proof;
  const preparedB = (await contender.journal.records()).findLast(x => x.status === 'proved').proof;
  const proofA = parseLosslessJson(readFileSync(join(preparedA.preparedDirectory, 'preflight.json'), 'utf8'));
  const proofB = parseLosslessJson(readFileSync(join(preparedB.preparedDirectory, 'preflight.json'), 'utf8'));
  for (const proof of [proofA, proofB]) {assert.equal(proof.fullUpsVerified, true); assert.equal(proof.exactStackAndSessionVerified, true);}
  assert.equal(proofA.core.new_user_leaf.nonce, proofB.core.new_user_leaf.nonce);
  assert.equal(proofA.core.state_transition.start_user_leaf_hash, proofB.core.state_transition.start_user_leaf_hash);
  assert.notEqual(proofA.core.new_user_leaf.user_state_tree_root, proofB.core.new_user_leaf.user_state_tree_root);
  releaseA(); const winner = await a; releaseB(); const loser = await b;
  assert.equal(loser.status, 'not-submitted');
  const records = await contender.journal.records(), rejected = records.findLast(x => x.status === 'not-submitted'); assert.ok(rejected);
  const winnerRecords = await f.journal.records(); assert.ok(winnerRecords.some(x => x.status === 'broadcast-result' && x.outcome?.error?.includes('discards parent submit result')));
  const duplicate = await f.journal.execute({task: read(join(base, 'public/nft-competition-admit-0-formal-task.json')), ...f.adapter}); assert.equal(duplicate.status, 'already-included');
  save(raceFile, {checkedAt: new Date().toISOString(), scope: 'independent durable journals; both full UPSs prepared from the same own nonce before winner broadcast; loser released after exact winning inclusion', simultaneousRpcRace: false, sameOwnNonce: proofA.core.new_user_leaf.nonce, sameStartLeaf: proofA.core.state_transition.start_user_leaf_hash, differentEndStateRootsVerified: true, preparedA, preparedB, winner, loser, rejected, parentResultDiscarded: true, exactReceiptRecovered: true, duplicateStatus: duplicate.status});
  f.adapter.submit = submitA;
 }
 for (let i = 1; i < 4; i++) {await fund('nft-competition-admit-' + i + '-fund'); await f.step('nft-competition-admit-' + i, operation('admit_entry'));}
 await fund('nft-competition-seal-fund'); await waitPast(p.cutoff); await f.step('nft-competition-seal', operation('seal_epoch'));
 await fund('nft-competition-commit-fund', 1); await f.step('nft-competition-commit', t => t.kind === 'batch_commit');
 const frozenPath = join(base, 'public/nft-competition-original-frozen.json');
 if (!existsSync(frozenPath)) save(frozenPath, await m.snapshot('nft-competition-first-freeze'));
 await h.user('dave', 'nft-competition-dave-cancel-after-freeze', [m.order('request_cancel', [])]);
 const s = await publicState(h.config), expiryOff = m.abi.contract.state.find(x => x.name === 'batch_expiry').offset;
 await waitPast(Number(await s.slot(m.vault, m.id, expiryOff)));
 await f.step('nft-competition-expire', t => t.kind === 'batch_expire'); await f.close();
 const g = await formal(h, m, 'nft-competition-refreeze', plan, {expiry: 96}); services.push(g);
 await fund('nft-competition-refreeze-fund', 1); await g.step('nft-competition-refreeze', t => t.kind === 'batch_commit');
 const originalFreeze = parseLosslessJson(readFileSync(frozenPath, 'utf8')), refreshed = await m.snapshot('nft-competition-second-freeze');
 for (const field of ['queue_root', 'queue_owner', 'queue_nonce']) assert.deepEqual(refreshed.fields[field], originalFreeze.fields[field], 'expiry cannot reselect the accepted set');
 const daveIndex = p.members.findIndex(x => x.owner === h.actors.dave.id); assert.equal(originalFreeze.fields.frozen_cancelled[daveIndex], 0n); assert.equal(refreshed.fields.frozen_cancelled[daveIndex], 1n);
 await g.step('nft-competition-settle', t => t.kind === 'batch_settle');
 const settled = await m.snapshot('nft-competition-final'); assert.equal(settled.fields.queue_phase[0], 3n);
 const winnerId = h.actors[p.expectedWinner].id;
 assert.deepEqual(settled.fields.queue_outcome, p.members.map(x => x.owner === h.actors.bob.id || x.owner === winnerId ? 1n : 2n));
 for (const name of names) await h.user(name, 'nft-competition-' + name + '-claim', await payoutClaims(await publicState(h.config), {userId: h.actors[name].id, markets: [m], tokenAbi: h.token, nftAbi: h.nft, nftSlot: name === 'dave' || name === p.expectedWinner ? 0 : undefined}));
 const before = parseLosslessJson(readFileSync(beforePath, 'utf8')), after = await cohortAssets(await publicState(h.config), spec);
 for (const asset of spec.assets) assert.equal(after.totals[asset], 1000n * unit);
 assert.equal(after.nfts.length, 2); assert.equal(after.nfts.filter(x => x.user === winnerId).length, 1); assert.equal(after.nfts.filter(x => x.user === h.actors.dave.id).length, 1);
 for (const [src, dst] of [[h.actors.bob.id, winnerId], [h.actors.dave.id, h.actors.dave.id]]) {const old = before.nfts.find(x => x.user === src), now = after.nfts.find(x => x.user === dst); assert.deepEqual(now.tokenId, old.tokenId); assert.deepEqual(now.metadataHash, old.metadataHash);}
 let fees = 0n; const perUser = [];
 for (const name of names) {const id = h.actors[name].id; let userFees = 0n;
  for (const attempt of readdirSync(join(base, 'attempts')).filter(x => x.startsWith('nft-competition-' + name + '-'))) {const q = join(base, 'attempts', attempt, 'included.json'); if (existsSync(q)) userFees += BigInt(read(q).receipt.data.result.fees_collected);}
  const deltaA = name === 'bob' ? 5n * unit : name === p.expectedWinner ? -5n * unit : 0n;
  assert.equal(after.accounts[id].ft[2464] - before.accounts[id].ft[2464], deltaA); assert.equal(after.accounts[id].ft[2466], before.accounts[id].ft[2466]);
  assert.equal(after.accounts[id].native - before.accounts[id].native, -(name === p.expectedWinner ? F : 0n) - userFees); perUser.push({name, userId: id, deltaA, userFees});
 }
 for (const attempt of readdirSync(join(base, 'attempts')).filter(x => x.startsWith('nft-competition-'))) {const q = join(base, 'attempts', attempt, 'included.json'); if (existsSync(q)) fees += BigInt(read(q).receipt.data.result.fees_collected);}
 // f and g share one journal; count exact transaction identities once.
 const seen = new Set(); for (const service of services) for (const r of (await service.journal.records()).filter(x => x.status === 'included' && Number(x.result.checkpoint) > Number(before.checkpoint))) if (!seen.has(r.result.contentHash)) {seen.add(r.result.contentHash); fees += BigInt(r.result.receipt.data.result.fees_collected);}
 assert.equal(before.nativeTotal - after.nativeTotal, fees);
 save(join(base, 'public/nft-competition-assets-after.json'), after);
 save(join(base, 'public/nft-competition-complete-v1.json'), {completedAt: new Date().toISOString(), marketId: m.id, priorCorrectedBaseline: 2472, retiredMarket: 2469, acceptedMembers: 4, uniqueSaleCount: 1, winnerId, perUser, sameAcceptedSetAfterTimeout: true, postFreezeCancellationAppliedOnRefreeze: true, cancelledUnmatchedSellerNftReturned: true, ordinaryClaimsIncluded: true, fees, productionReady: false});
} finally {for (const service of services) await service.close();}
