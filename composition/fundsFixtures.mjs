// Synthetic unit fixture only; no deployment identity.
import{fundsPolicy}from'./contract/policy.mjs';
export const abi=rows=>({contract:{methods:rows.map(([name,input_felt_count],i)=>({name,input_felt_count,method_id:100+i}))}});
export function fundsFixture(registryHash='a'.repeat(64)){
 const controllerAbi=abi([['request_route',14],['bind_funding',1],['noop',0],['forbidden',0],['begin_funding',2],['finish_funding',2],['prepare_1',8],['prepare_2',8],['finish_send_1',2],['finish_send_2',2],['mark_consent',5],['mark_cancel',3],['mark_recovery',3],['record_1_success',4],['record_1_refund',4],['record_2_success',4],['record_2_refund',4],['charge',1],...['input','middle','final'].flatMap(mode=>[['begin_return_'+mode,6],['finish_return_'+mode,2]])]);
 const marketAbi=abi([['open_swap',8],['request_admission',2],['request_cancel',0],['release_unaccepted',0],['request_recovery',1],['close_swap_0',0],['close_swap_1',0]]);
 const tokenAbi=abi([['claim',1],['transfer',3],['cancel_unclaimed_payment',1]]),nativeAbi=abi([['simple_claim',1],['simple_transfer',2],['simple_burn',1]]);
 const policy=fundsPolicy({controllerId:1002,controllerAbi,assetA:42,assetB:43,tokenAbi,nativeAbi,markets:[{id:1000,vault:300,abi:marketAbi},{id:1001,vault:400,abi:marketAbi}],registryHash});
 return{policy,controllerAbi,tokenAbi,nativeAbi,marketAbis:[marketAbi,marketAbi]};
}
