import {integer,user,encodeAmount,FEE_ESCROW} from '../amm/u124/client.mjs';
export {encodeAmount,decodeAmount,losslessJson,parseLosslessJson,FEE_ESCROW} from '../amm/u124/client.mjs';
export const MAX_FELT=18446744069414584320n;
export function call(contract,abi,name,inputs=[]){integer(contract,16777215n);const m=abi.contract.methods.find(m=>m.name===name);if(!m)throw Error(`missing method ${name}`);const flat=inputs.flat();flat.forEach(x=>integer(x,MAX_FELT));if(flat.length!==m.input_felt_count)throw Error(`${name} arity`);return {contract_id:contract,method_name:name,inputs:flat};}
export const feeCall=vault=>{user(vault);return {contract_id:0n,method_name:'simple_transfer',inputs:[vault,FEE_ESCROW]};};
export function listingCalls({marketId,marketAbi,nftId,nftAbi,vault,slot,price,deadline,nonce}){
 user(vault);integer(slot,127n);integer(deadline,4294967295n);integer(nonce,(1n<<62n)-1n);if(!nonce||!price)throw Error('positive nonce/price required');
 return [call(nftId,nftAbi,'acknowledge',[vault]),call(marketId,marketAbi,'open_listing',[vault,slot,encodeAmount(price),deadline,nonce]),feeCall(vault),call(nftId,nftAbi,'transfer',[slot,vault])];
}
export function purchaseCalls({marketId,marketAbi,tokenId,tokenAbi,vault,seller,listingNonce,price,deadline,nonce}){
 user(vault);user(seller);integer(deadline,4294967295n);for(const n of [nonce,listingNonce]){integer(n,(1n<<62n)-1n);if(!n)throw Error('positive nonce required');}if(!price)throw Error('positive price required');
 return [call(marketId,marketAbi,'open_buy',[vault,seller,listingNonce,encodeAmount(price),deadline,nonce]),feeCall(vault),call(tokenId,tokenAbi,'transfer',[vault,encodeAmount(price)])];
}
