import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeBatchPolicy} from '../v2/policy.mjs';
import {bindNativePolicy,PROFILE} from '../mainnet-beta/native.mjs';
export function makeStreamPolicy(market,marketId,config,artifact,token,nft){
 const base=bindNativePolicy(makeBatchPolicy(market,marketId,config,artifact.abi,token.abi,nft.abi),PROFILE),stream={};
 for(const [name,arity]of Object.entries({open_source_stream:16,initialize_stream_roots:12,begin_source_page:4,set_source_users:6,set_source_manifests:10,finish_source_page:4,abort_source_stream:4,begin_order_page:4,set_order_page:16,finish_order_page:4,begin_stream_settlement:13,bind_stream_member:12,claim_stream_member:2,finish_stream_settlement:7})){
  const m=artifact.abi.contract.methods.find(m=>m.name===name);assert.ok(m&&m.input_felt_count===arity&&m.output_felt_count===0&&m.state_mutability==='external',name);stream[name]={contract_id:marketId,method_name:name,method_id:m.method_id,input_count:arity};
 }
 return {version:5,profile:'source-covered-priority-stream-v3',market,market_id:marketId,tx_count:40,witness_length:80,live_authorization:false,qualified_randomness:false,base,noop:base.noop,stream};
}
if(process.argv.length===3){const root=process.argv[2],read=p=>JSON.parse(readFileSync(root+'/'+p));for(const market of ['amm','bondingcurve']){const c=read(market+'/config.json'),s=makeStreamPolicy(market,1000,c,read(market+'/compiled/compilation_artifact.json'),read('token/compilation_artifact.json'),read('nft/compilation_artifact.json'));for(const [name,v]of [['policy.json',s.base],['stream-policy.json',s]])writeFileSync(root+'/'+market+'/'+name,JSON.stringify(v,null,2)+'\n',{flag:'wx'});}}
