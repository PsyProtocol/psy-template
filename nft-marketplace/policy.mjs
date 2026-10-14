import {integer,user,FEE_ESCROW} from '../amm/u124/client.mjs';
const w=witness=>({witness}),k=constant=>({constant:String(constant)});
export function makePolicy(marketId,c,abi,nftAbi,tokenAbi){
 const method=(a,name,n)=>{const m=a.contract.methods.find(x=>x.name===name);if(!m||m.input_felt_count!==n||m.output_felt_count!==0||(m.state_mutability!=='external'&&!(name==='noop'&&m.state_mutability==='view')))throw Error(`method ABI: ${name}`);return m;};
 const call=(id,a,name,inputs)=>({contract_id:id,method_id:method(a,name,inputs.length).method_id,method_name:name,inputs});
 const guard=(name,inputs=[])=>call(marketId,abi,name,inputs);
 const nft=(name,inputs)=>call(c.nftId,nftAbi,name,inputs);
 const ft=(name,inputs)=>call(c.tokenId,tokenAbi,name,inputs);
 const native=(name,inputs)=>({contract_id:0,method_name:name,method_id:{simple_claim:2293029357,simple_transfer:354447671,simple_burn:2923993647}[name],inputs});
 const seller=w(1),buyer=w(2),amount=[w(3),w(4)],listing=w(10),buy=w(11),zero=k(0);
 const branches=[];
 const add=(name,calls)=>{while(calls.length<9)calls.push(guard('noop'));if(calls.length!==9)throw Error('NFT policy stack overflow');calls.push(native('simple_burn',[w(12)]));branches.push({branch:branches.length+1,name,calls});};
 add('settle_sale',[guard('settle_sale',[seller,buyer,...amount,listing,buy]),native('simple_claim',[seller]),native('simple_claim',[buyer]),ft('claim',[buyer]),nft('claim',[zero,seller]),nft('acknowledge',[buyer]),nft('transfer',[zero,buyer]),ft('transfer',[seller,...amount]),native('simple_transfer',[seller,k(FEE_ESCROW)])]);
 add('refund_listing',[guard('refund_listing',[seller,listing]),native('simple_claim',[seller]),nft('claim',[zero,seller]),nft('acknowledge',[seller]),nft('transfer',[zero,seller])]);
 add('refund_listing_fee',[guard('refund_listing_fee',[seller,listing]),native('simple_claim',[seller])]);
 add('refund_buy',[guard('refund_buy',[buyer,...amount,buy]),native('simple_claim',[buyer]),ft('claim',[buyer]),ft('transfer',[buyer,...amount])]);
 add('refund_buy_fee',[guard('refund_buy_fee',[buyer,buy]),native('simple_claim',[buyer])]);
 add('ack_delivery',[guard('ack_delivery',[seller]),native('simple_claim',[seller]),nft('acknowledge',[seller])]);
 // Materialize the fresh user and both asset trees before market foreign reads.
 add('activate',[native('simple_claim',[seller]),nft('acknowledge',[seller]),ft('claim',[seller]),guard('activate',[seller]),ft('transfer',[seller,k(1),zero])]);
 return {version:1,market:'nftmarket',market_id:marketId,nft_id:c.nftId,token_id:c.tokenId,witness_length:13,tx_count:10,fee_min:'1000000000',fee_max:String(FEE_ESCROW),branches};
}
export function operationCalls(policy,fields){
 if(!Array.isArray(fields)||fields.length!==13)throw Error('13 witness fields required');
 fields.forEach(x=>integer(x,(1n<<62n)-1n));user(fields[1]);
 const b=policy.branches.find(b=>BigInt(b.branch)===fields[0]);if(!b)throw Error('unknown NFT branch');
 if(b.name==='settle_sale'||b.name.startsWith('refund_buy'))user(fields[2]);
 if(fields[12]<1000000000n||fields[12]>FEE_ESCROW||fields[12]%1000n)throw Error('invalid burn fee');
 return b.calls.map(c=>({...c,contract_id:BigInt(c.contract_id),method_id:BigInt(c.method_id),inputs:c.inputs.map(x=>x.witness===undefined?BigInt(x.constant):fields[x.witness])}));
}
export function signingRequest(policy,fields){const witness=[...fields];if(witness[12]===0n)witness[12]=1000000000n;return {contract_calls:operationCalls(policy,witness).slice(0,9).map(({contract_id,method_name,inputs})=>({contract_id,method_name,inputs})),software_defined_call:{inputs:fields}};}
