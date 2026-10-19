// Deterministic, public test payer. This is offline proof input, not a wallet
// registration or a deployment. Keep the exact fixed-recipient acceptance
// branches used by the original sandbox; ordinary private keys are never inputs.
import {FEE_ESCROW,encodeAmount} from '../../amm/u124/client.mjs';
export function acceptancePayerPolicy({config,markets,tokenAbi,issuer=5,donor=6}) {
 const k=value=>({constant:String(value)}), w=index=>({witness:index});
 const invoke=(cid,method,inputs)=>{if(!method)throw Error('Missing acceptance payer ABI method');return {contract_id:cid,method_id:method.method_id,method_name:method.name,inputs};};
 const m=(kind,name,inputs=[])=>invoke(markets[kind].contractId,markets[kind].abi.contract.methods.find(m=>m.name===name),inputs);
 const t=(asset,name,inputs)=>invoke(asset,tokenAbi.contract.methods.find(m=>m.name===name),inputs);
 const native=(name,inputs)=>invoke(0,{name,method_id:{simple_claim:2293029357,simple_transfer:354447671,simple_burn:2923993647}[name]},inputs);
 const transfer=(asset,to,n)=>t(asset,'transfer',[k(to),...encodeAmount(n).map(k)]);
 const claim=(asset,from)=>t(asset,'claim',[k(from)]);
 const fee=kind=>native('simple_transfer',[k(markets[kind].vaultId),k(FEE_ESCROW)]);
 const U=10n**18n, branches=[];
 const add=(name,calls)=>{while(calls.length<8)calls.push(m('amm','noop'));if(calls.length!==8)throw Error('Acceptance payer stack overflow');calls.push(native('simple_burn',[w(12)]));branches.push({branch:branches.length+1,name,calls});};
 const setupAmm=nonce=>[m('amm','noop'),native('simple_claim',[k(donor)]),claim(config.assetA,issuer),m('amm','open_swap',[k(markets.amm.vaultId),k(0),...encodeAmount(U).map(k),k(1),k(0),k(4294967295),k(nonce)]),transfer(config.assetA,markets.amm.vaultId,U),fee('amm')];
 add('setup_amm_1',setupAmm(1));
 add('claim_and_close_amm',[m('amm','noop'),claim(config.assetB,markets.amm.vaultId),m('amm','close_swap_0')]);
 add('reject_unsettled_extra_amm_payment',[m('amm','noop'),transfer(config.assetA,markets.amm.vaultId,1n),m('amm','close_swap_0')]);
 add('setup_book',[m('amm','noop'),native('simple_claim',[k(donor)]),m('orderbook','open_sell',[k(markets.orderbook.vaultId),k(0),...encodeAmount(U).map(k),...encodeAmount(U).map(k),k(4294967295),k(1)]),transfer(config.assetA,markets.orderbook.vaultId,U),fee('orderbook')]);
 add('claim_and_close_book',[m('amm','noop'),claim(config.assetB,markets.orderbook.vaultId),m('orderbook','close_0')]);
 add('setup_curve_refund',[m('amm','noop'),native('simple_claim',[k(donor)]),m('bondingcurve','open_buy',[k(markets.bondingcurve.vaultId),k(1),k(2),...encodeAmount(U).map(k),k(4294967295),k(1)]),transfer(config.assetB,markets.bondingcurve.vaultId,U),fee('bondingcurve')]);
 add('claim_and_close_curve',[m('amm','noop'),claim(config.assetB,markets.bondingcurve.vaultId),m('bondingcurve','close_buy')]);
 add('setup_amm_2',setupAmm(2));
 add('return_unused_to_fixed_funders',[m('amm','noop'),t(config.assetA,'transfer',[k(issuer),w(3),w(4)]),t(config.assetB,'transfer',[k(issuer),w(5),w(6)]),native('simple_transfer',[k(donor),w(7)])]);
 return {version:1,market:'bounded_test_payer',market_id:markets.amm.contractId,asset_a:config.assetA,asset_b:config.assetB,witness_length:13,tx_count:9,fee_min:'1000000000',fee_max:String(FEE_ESCROW),branches};
}
