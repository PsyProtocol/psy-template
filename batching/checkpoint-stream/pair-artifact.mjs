// Independent build-time audit against reviewed role IDs, not a success flag
// supplied by the compiler. Actual full UPS verification remains mandatory.
import assert from 'node:assert/strict';
export function auditPairArtifact(market,config,artifact){
 assert.ok(['orderbook','nftmarket'].includes(market));assert.equal(artifact.state_tree_height,31);
 const heights=new Map([[0,32],[market==='nftmarket'?config.tokenId:config.assetA,31],[market==='nftmarket'?config.nftId:config.assetB,market==='nftmarket'?30:31]]);assert.equal(heights.size,3);
 assert.ok(Array.isArray(artifact.circuit_definitions)&&artifact.circuit_definitions.length>0);let reads=0;
 const foreign=new Set(['GetOtherUserContractStateSlotSingle','GetOtherUserContractStateSlotRange','GetSelfUserExternalContractStateSlotSingle','GetSelfUserExternalContractStateSlotRange']);
 for(const d of artifact.circuit_definitions){const constants=new Map(d.definitions.filter(n=>n.data_type===0&&n.op_type===1).map(n=>[n.index,n.inputs[0]])),own=d.definitions.find(n=>n.data_type===0&&n.op_type===47)?.index;
  for(const c of d.state_commands){if(!foreign.has(c.type))continue;const id=constants.get(c.contract_id),expected=heights.get(id)??(c.contract_id===own?31:undefined);assert.notEqual(expected,undefined,`unreviewed foreign contract in ${d.name}`);assert.equal(constants.get(c.contract_state_tree_height),expected,`foreign state height in ${d.name}, contract ${id??'self'}`);reads++;}
 }
 assert.ok(reads>0);return{foreignReadCommandsChecked:reads,reviewedHeights:Object.fromEntries(heights),allReadsBound:true};
}
