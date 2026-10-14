// RPC/driver doubles below test release gates, not chain settlement.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {verifyAcceptance,acceptanceReceiptReader} from '../acceptance.mjs';
import {signingRequest} from '../policy.mjs';
import {losslessJson,encodeAmount,FEE_ESCROW} from '../client.mjs';
import {NFT} from '../generate.mjs';

const root = process.env.NFT_MARKET_BUILD;
if (!root || !process.env.TOKEN_WIDE_ARTIFACT) throw Error('explicit compiled fixtures required');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const market = json(root + '/market/compiled/abi.json'), token = json(process.env.TOKEN_WIDE_ARTIFACT).abi;
const policy = json(root + '/market/policy.json'), config = json(root + '/market/config.json');
const digest = value => createHash('sha256').update(value).digest('hex');

function fixture() {
 const paths = {wallet: '/release/wallet', policy: '/release/policy', abi: '/release/market', driverConfig: '/release/config'};
 const options = {...paths, kind: 'nftmarket', network: 'test', contractId: 1000, vaultId: 100, fingerprint: 'a'.repeat(64), rpcConfig: 'unused',
  users: [200, 201, 202], collection: {abi: '/release/nft'}, paymentToken: {abi: '/release/ft'}};
 const files = new Map(Object.values(paths).map(path => [path, Buffer.from('driver-fixture')]));
 files.set(paths.abi, Buffer.from(JSON.stringify(market)));files.set(paths.driverConfig, Buffer.from(JSON.stringify(config)));
 files.set(options.collection.abi, Buffer.from('{}'));files.set(options.paymentToken.abi, Buffer.from(JSON.stringify(token)));
 const receipts = [], operations = [];
 for (const [index, kind] of ['activate', 'settle_sale', 'refund_listing', 'refund_buy', 'settle_sale', 'refund_buy'].entries()) {
  const branch = policy.branches.find(b => b.name === kind);
  const fields = [BigInt(branch.branch), 200n, 201n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, BigInt(index + 1), BigInt(index + 1), 0n];
  const callsText = losslessJson(signingRequest(policy, fields)), callsFile = '/calls/' + digest(callsText) + '.json';
  const submissionLog = callsFile + '.submission-00000000-0000-0000-0000-000000000000.log', leaf = digest(String(index));
  files.set(callsFile, Buffer.from(callsText));
  files.set(submissionLog, Buffer.from([
   {fullUpsVerified: true, submitted: false, marketId: 1000, fingerprint: options.fingerprint, fee: 1000000000, endUserLeafHash: leaf},
   {status: 'broadcast_intent', userId: 100, endUserLeafHash: leaf},
  ].map(v => JSON.stringify(v)).join('\n')));
  operations.push({kind, callsFile, submissionLog});receipts.push({userId: 100, endUserLeafHash: leaf, contentHash: digest('content' + index), checkpoint: 90 + index});
 }
 const evidence = {version: 1, issuerId: 200, totalFT: '100', totalNFT: '2',
  users: [{userId: 200, ft: '84', nft: '2', status: 'purchased', nonce: '3', owned: [
   {slot: 0, tokenId: ['9', '10', '11', '12'], metadataHash: ['13', '14', '15', '16']},
   {slot: 1, tokenId: ['1', '2', '3', '4'], metadataHash: ['5', '6', '7', '8']} ]},
   {userId: 201, ft: '11', nft: '0', status: 'sold', nonce: '3', owned: []},
   {userId: 202, ft: '5', nft: '0', status: 'payment-refunded', nonce: '1', owned: []}],
  receipts, sdkOperations: operations, release: [...files].map(([path, bytes]) => ({path, sha256: digest(bytes)}))};
 const slots = new Map(), set = (u, c, o, v) => slots.set(`${u}:${c}:${o}`, BigInt(v));
 const field = name => market.contract.state.find(f => f.name === name).offset;
 for (const [index, u] of evidence.users.entries()) {
  encodeAmount(BigInt(u.ft)).forEach((v, i) => set(u.userId, config.tokenId, i, v));set(u.userId, config.nftId, 0, u.nft);
  set(u.userId, 1000, field('nonce'), u.nonce);set(100, 1000, field('consumed') + u.userId, u.nonce);
  const values = [BigInt(u.nonce), [2n, 1n, 4n][index], 201n, ...encodeAmount(1n), ...encodeAmount(index ? 1n : 0n), index ? 0n : 1n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, index === 1 ? FEE_ESCROW : 0n];
  values.forEach((v, i) => set(100, 1000, field('results') + 17 * u.userId + i, v));
  if (index === 0) set(u.userId, config.nftId, NFT.outbox + NFT.stride * 100 + NFT.claimed, 1n);
  if (index) set(u.userId, config.tokenId, 33554455 + 4 * 100, 1n);
  if (index === 1) set(u.userId, 0, 4 + 2 * 100, FEE_ESCROW);
  for (const item of u.owned) {
   const offset = NFT.owned + 9 * item.slot;set(u.userId, config.nftId, offset + 4, 1n);
   item.tokenId.forEach((v, i) => set(u.userId, config.nftId, offset + i, v));item.metadataHash.forEach((v, i) => set(u.userId, config.nftId, offset + 5 + i, v));
  }
 }
 set(200, config.tokenId, token.contract.state.find(f => f.name === 'total_supply').offset, 100n);set(200, config.nftId, 4, 2n);
 const dependencies = {read: async path => files.get(path), createAdapter: async () => ({}),
  readReceipts: async () => async identity => ({...identity, status: 'included'}),
  readState: async () => ({networkName: 'test', checkpoint: 100, slot: async (u, c, o) => slots.get(`${u}:${c}:${o}`) ?? 0n})};
 return {options, evidence, dependencies, set, files};
}

test('verified evidence stays distinct from independent production approval', async () => {
 const f = fixture(), result = await verifyAcceptance(f.options, f.evidence, f.dependencies);
 assert.equal(result.engineeringAcceptanceVerified, true);assert.equal(result.productionReady, false);
 assert.equal(result.coverage.settle_sale, 2);assert.equal(result.balances.length, 3);
});
test('unconfirmed or mismatched receipts cannot pass acceptance', async () => {
 for (const mutation of [r => ({...r, status: 'unresolved'}), r => ({...r, contentHash: 'f'.repeat(64)}), r => ({...r, userId: 999})]) {
  const f = fixture();f.dependencies.readReceipts = async () => async r => mutation({...r, status: 'included'});
  await assert.rejects(() => verifyAcceptance(f.options, f.evidence, f.dependencies));
 }
});
test('missing coverage and counting one broadcast twice are rejected', async () => {
 const f = fixture();f.evidence.sdkOperations.pop();await assert.rejects(() => verifyAcceptance(f.options, f.evidence, f.dependencies), /missing live coverage/);
 const g = fixture();g.evidence.sdkOperations[4] = g.evidence.sdkOperations[1];await assert.rejects(() => verifyAcceptance(g.options, g.evidence, g.dependencies), /duplicate SDK broadcast/);
});
test('unclaimed delivery, retained vault assets and broken conservation block acceptance', async () => {
 for (const mutate of [f => f.set(200, config.nftId, NFT.outbox + NFT.stride * 100 + NFT.claimed, 0n),
  f => f.set(100, config.tokenId, 0, 1n), f => f.set(201, config.tokenId, 0, 10n), f => {f.evidence.users[0].ft = '83';}]) {
  const f = fixture();mutate(f);await assert.rejects(() => verifyAcceptance(f.options, f.evidence, f.dependencies));
 }
});
test('release files are checked again after live reads', async () => {
 const f = fixture(), readState = f.dependencies.readState;
 f.dependencies.readState = async () => {f.files.set(f.options.wallet, Buffer.from('changed'));return readState();};
 await assert.rejects(() => verifyAcceptance(f.options, f.evidence, f.dependencies), /release changed/);
});
test('NFT counts cannot conceal a substituted token or metadata', async () => {
 for (const offset of [NFT.owned, NFT.owned + 5]) {
  const f = fixture();f.set(200, config.nftId, offset, 99n);
  await assert.rejects(() => verifyAcceptance(f.options, f.evidence, f.dependencies), /NFT identity\/metadata changed/);
 }
});
test('two slots cannot count the same NFT identity twice', async () => {
 const f = fixture(), owned = f.evidence.users[0].owned;
 owned[1].tokenId = [...owned[0].tokenId];
 owned[1].tokenId.forEach((v, i) => f.set(200, config.nftId, NFT.owned + 9 + i, BigInt(v)));
 await assert.rejects(() => verifyAcceptance(f.options, f.evidence, f.dependencies), /duplicate owned NFT identity/);
});
test('receipt snapshot reuses historical leaves but rechecks a pending receipt', async () => {
 const directory=await mkdtemp(join(tmpdir(),'nft-acceptance-cache-'));
 try {
  const config=join(directory,'rpc.json');await writeFile(config,JSON.stringify({defaultNetwork:'test',networks:{test:{api_services_url:['https://services.test'],users_per_realm:1000,realm_configs:[{id:0,rpc_url:['https://realm.test']}]}}}));
  const calls=new Map(),leaf=cp=>digest('leaf'+cp),content=cp=>digest('content'+cp);let included=false;
  const read=await acceptanceReceiptReader(config,{fetchImpl:async(url,options)=>{
   let data,key;
   if(options?.body){const cp=JSON.parse(options.body).params.checkpoint_id;key='leaf'+cp;data={result:leaf(cp)};}
   else if(url.includes('/get/user/transactions')){key='list';data={success:true,data:{items:[102,101].map(cp=>({tx_type:'user_endcap',owner_user_id:123,included_checkpoint_id:cp,content_hash:content(cp)})),has_next:false}};}
   else {const cp=url.endsWith(content(101))?101:102;key='receipt'+cp;data={success:true,data:{status:cp===101&&!included?'pending':'included',owner_user_id:123,included_checkpoint_id:cp,content_hash:content(cp)}};}
   calls.set(key,(calls.get(key)??0)+1);return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
  }});
  assert.equal((await read({userId:123,endUserLeafHash:leaf(101)})).status,'unresolved');included=true;
  assert.equal((await read({userId:123,endUserLeafHash:leaf(101)})).status,'included');
  assert.equal((await read({userId:123,endUserLeafHash:leaf(102)})).status,'included');
  assert.equal(calls.get('list'),1);assert.equal(calls.get('leaf101'),1);assert.equal(calls.get('leaf102'),1);assert.equal(calls.get('receipt101'),2);
 } finally {await rm(directory,{recursive:true,force:true});}
});
