// Late-bind the reviewed pair policy to one explicit market identity.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {auditPairArtifact} from './pair-artifact.mjs';
import {makeBatchPolicy} from '../v2/policy.mjs';
import {bindNativePolicy,PROFILE} from '../mainnet-beta/native.mjs';
export function makePairOptimizedPolicy(market,marketId,c,a,token,nft){
 assert.ok(['orderbook','nftmarket'].includes(market),'pair market kind');
 const assetIds=market==='nftmarket'?[c.tokenId,c.nftId]:[c.assetA,c.assetB];
 assert.ok(Number.isSafeInteger(marketId)&&marketId>=5&&marketId<16777216&&!assetIds.includes(marketId),'distinct bounded market ID');
 auditPairArtifact(market,c,a);
 const base=bindNativePolicy(makeBatchPolicy(market,marketId,c,a.abi,token.abi,nft.abi),PROFILE),stream={};
 for(const[name,n]of Object.entries({open_source_stream:16,initialize_stream_roots:12,begin_source_page:4,set_source_users:6,set_source_manifests:10,finish_source_page:4,abort_source_stream:4,begin_order_page:4,set_order_page:16,finish_order_page:4,begin_stream_settlement:13,bind_stream_member:12,claim_stream_member:2,finish_stream_settlement:7,advance_pair_frontier:18,bind_pair_choice:8,finish_pair_carry:5,bind_pair_rejection:9})){
  const m=a.abi.contract.methods.find(m=>m.name===name);assert.equal(m?.input_felt_count,n,name);assert.equal(m.output_felt_count,0);assert.equal(m.state_mutability,['bind_pair_choice','bind_pair_rejection'].includes(name)?'view':'external');stream[name]={contract_id:marketId,method_name:name,method_id:m.method_id,input_count:n};
 }
 // Rewrite every coverage and operation descriptor, including all refunds.
 const visit=v=>{if(!v||typeof v!=='object')return;if(v.method_name==='recover_funding'){const mask=Number(v.inputs.at(-1).constant),name=`recover_funding_${mask}`,m=a.abi.contract.methods.find(m=>m.name===name);assert.equal(m?.input_felt_count,7);assert.equal(m.output_felt_count,0);assert.equal(m.state_mutability,'external');v.method_name=name;v.method_id=m.method_id;}for(const x of Object.values(v))if(typeof x==='object')visit(x);};visit(base);
 return {version:9,profile:'source-covered-pair-triangular-recovery-v1',market,market_id:marketId,tx_count:40,witness_length:80,page_capacity:2,trading_enabled:true,scan_capacity:4,live_authorization:false,qualified_randomness:false,base,noop:base.noop,stream};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const root=process.argv[2];assert.ok(root,'fixture root required');const read=p=>JSON.parse(readFileSync(root+'/'+p));
 for(const market of ['orderbook','nftmarket']){
  const c=read(market+'/config.json'),a=read(market+'/compiled/compilation_artifact.json'),independent=auditPairArtifact(market,c,a),audit=read(market+'/compiled/FOREIGN_READ_AUDIT.json');
  assert.equal(audit.foreignReadCommandsChecked,independent.foreignReadCommandsChecked);assert.equal(audit.allReadsBound,true);assert.ok(audit.foreignReadCommandsChecked>0);assert.equal(audit.assetA,market==='nftmarket'?c.tokenId:c.assetA);assert.equal(audit.assetB,market==='nftmarket'?c.nftId:c.assetB);assert.equal(audit.assetAHeight,31);assert.equal(audit.assetBHeight,market==='nftmarket'?30:31);assert.equal(audit.nativeHeight,32);
  const spec=makePairOptimizedPolicy(market,1000,c,a,read('token/compilation_artifact.json'),read('nft/compilation_artifact.json'));
  for(const[name,v]of [['policy.json',spec.base],['stream-policy.json',spec]])writeFileSync(root+'/'+market+'/'+name,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 }
}
