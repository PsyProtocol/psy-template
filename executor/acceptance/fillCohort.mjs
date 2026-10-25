import assert from 'node:assert/strict';
import {canonicalHeldNfts} from '../../batching/admission/liveAssets.mjs';
import {parseLosslessJson,losslessJson} from '../../amm/u124/client.mjs';
// Observation metadata may be Number in live reads and BigInt in preserved
// evidence. Amounts stay exact; changing a real owner, value or NFT still fails.
export function assertBookFillCohort(before,after,{owner,buyer,assets,unit}){
 assert.equal(assets.length,2);assert.equal(typeof unit,'bigint');assert.ok(unit>0n);
 assert.deepEqual(Object.keys(after.accounts).sort(),Object.keys(before.accounts).sort());
 assert.deepEqual(Object.keys(before.totals).sort(),assets.map(String).sort());assert.deepEqual(Object.keys(after.totals).sort(),assets.map(String).sort());
 for(const asset of assets){assert.equal(after.totals[asset],before.totals[asset]);for(const[id,row]of Object.entries(before.accounts)){
  const delta=id===String(owner)?(asset===assets[0]?-unit:unit):id===String(buyer)?(asset===assets[0]?unit:-unit):0n;
  assert.equal(typeof row.ft[asset],'bigint');assert.equal(typeof after.accounts[id].ft[asset],'bigint');assert.equal(after.accounts[id].ft[asset]-row.ft[asset],delta,'exact owner/vault FT delta');
 }}
 assert.deepEqual(canonicalHeldNfts(after.nfts),canonicalHeldNfts(before.nfts),'NFT owner/identity unchanged');
 assert.deepEqual(parseLosslessJson(losslessJson(after.nftPending)),parseLosslessJson(losslessJson(before.nftPending)),'pending NFT identity/cursors unchanged');
 return true;
}
