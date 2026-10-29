import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';
import {auditPairArtifact} from './pair-artifact.mjs';
import {makeBatchPolicy} from '../v2/policy.mjs';import {bindNativePolicy,PROFILE} from '../mainnet-beta/native.mjs';
const root=process.argv[2],read=p=>JSON.parse(readFileSync(root+'/'+p));
for(const market of ['orderbook','nftmarket']){
 const c=read(market+'/config.json'),a=read(market+'/compiled/compilation_artifact.json'),stream={};
 const independent=auditPairArtifact(market,c,a);
 const audit=read(market+'/compiled/FOREIGN_READ_AUDIT.json');assert.equal(audit.foreignReadCommandsChecked,independent.foreignReadCommandsChecked);assert.equal(audit.allReadsBound,true);assert.ok(audit.foreignReadCommandsChecked>0);assert.equal(audit.assetA,market==='nftmarket'?c.tokenId:c.assetA);assert.equal(audit.assetB,market==='nftmarket'?c.nftId:c.assetB);assert.equal(audit.assetAHeight,31);assert.equal(audit.assetBHeight,market==='nftmarket'?30:31);assert.equal(audit.nativeHeight,32);
 const base=bindNativePolicy(makeBatchPolicy(market,1000,c,a.abi,read('token/compilation_artifact.json').abi,read('nft/compilation_artifact.json').abi),PROFILE);
 for(const[name,n]of Object.entries({open_source_stream:16,initialize_stream_roots:12,begin_source_page:4,set_source_users:6,set_source_manifests:10,finish_source_page:4,abort_source_stream:4,begin_order_page:4,set_order_page:16,finish_order_page:4,begin_stream_settlement:13,bind_stream_member:12,claim_stream_member:2,finish_stream_settlement:7,advance_pair_frontier:18,bind_pair_choice:8,finish_pair_carry:5})){const m=a.abi.contract.methods.find(m=>m.name===name);assert.equal(m.input_felt_count,n,name);assert.equal(m.output_felt_count,0);assert.equal(m.state_mutability,name==='bind_pair_choice'?'view':'external');stream[name]={contract_id:1000,method_name:name,method_id:m.method_id,input_count:n};}
 // Rewrite every coverage and operation descriptor, not only the display name.
 const visit=v=>{if(!v||typeof v!=='object')return;if(v.method_name==='recover_funding'){const mask=Number(v.inputs.at(-1).constant),name=`recover_funding_${mask}`,m=a.abi.contract.methods.find(m=>m.name===name);assert.equal(m.input_felt_count,7);assert.equal(m.output_felt_count,0);assert.equal(m.state_mutability,'external');v.method_name=name;v.method_id=m.method_id;}for(const x of Object.values(v))if(typeof x==='object')visit(x);};visit(base);
 const spec={version:8,profile:'source-covered-pair-global-frontier-v1',market,market_id:1000,tx_count:40,witness_length:80,page_capacity:2,trading_enabled:true,scan_capacity:4,live_authorization:false,qualified_randomness:false,base,noop:base.noop,stream};
 for(const[name,v]of [['policy.json',base],['stream-policy.json',spec]])writeFileSync(root+'/'+market+'/'+name,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
}
