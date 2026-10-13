import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {publicState} from '../executor/publicState.mjs';
import {mapReads,readTogether} from '../executor/readConcurrency.mjs';
import {FEE_ESCROW, MAX_LOTS, MAX_COST, cumulativeCost, quoteBuy, quoteSell, validateCurve} from './curveMath.mjs';
import {initializeCalls, settleBuyCalls, settleSellCalls, refundBuyCalls,
  refundSellCalls, graduateCalls, withVaultSignInputs} from './operationCalls.mjs';

const parameters = {token_contract_id:'tokenId', issuer_user:'issuerId', graduation_target:'targetId',
  max_lots:'maxLots', liquidity_lots:'liquidityLots', lot_size:'lotSize', base_price:'basePrice',
  step_price:'stepPrice', threshold_lots:'thresholdLots'};
const number = value => {const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new RangeError('unsafe curve input');return n;};

export function proposeCurveAction({contractId,vaultId,launch,pool,orders,checkpoint,
  issuerSentPsy,issuerSentToken,automaticInitialize=false,automaticGraduation=false}) {
  const c=validateCurve(launch),base={...launch,contractId,vaultId};
  const task=(kind,calls)=>({kind,submission:withVaultSignInputs(calls)});
  if(pool.phase===0n){
    if(automaticInitialize && issuerSentPsy===FEE_ESCROW && issuerSentToken===(c.maxLots+c.liquidityLots)*c.lotSize)
      return task('initialize',initializeCalls(base));
    return null;
  }
  if(pool.phase!==1n&&pool.phase!==2n)throw Error('invalid curve phase');
  for(const [field,key] of Object.entries(parameters))assert.equal(pool[field],BigInt(launch[key]),`curve parameter changed: ${field}`);
  if(pool.phase===1n)assert.equal(pool.psy_reserve,cumulativeCost(c,pool.sold_lots),'curve backing mismatch');
  else assert.equal(pool.psy_reserve,0n,'graduated curve backing');
  const candidates=[];
  for(const o of orders){
    if(o.vault!==BigInt(vaultId)||![1n,2n].includes(o.kind)||o.nonce<=o.consumedNonce)continue;
    if(o.lots<1n||o.lots>MAX_LOTS||o.expectedSold<0n||o.expectedSold>MAX_LOTS||o.quote<1n||o.quote>MAX_COST||o.deadline<1n)continue;
    const dp=o.sentPsy-o.settledPsy,dt=o.sentToken-o.settledToken;
    if(dp<0n||dt<0n)continue;
    const buy=o.kind===1n;
    if(dp!==(buy?o.quote+FEE_ESCROW:FEE_ESCROW)||(!buy&&dt!==o.lots*c.lotSize))continue;
    const args={...base,payerId:o.payerId,expectedSold:number(o.expectedSold),lots:number(o.lots),
      deadline:number(o.deadline),nonce:number(o.nonce)};
    // These contracts permit refunds after a quote becomes stale, as well as
    // after expiry or graduation. Refunds always use the signed original amount.
    let executable=pool.phase===1n&&o.expectedSold===pool.sold_lots&&o.deadline>=BigInt(checkpoint);
    if(executable)try{
      const quote=buy?quoteBuy(c,pool.sold_lots,o.lots):quoteSell(c,pool.sold_lots,o.lots);
      executable=o.quote===(buy?quote.cost:quote.payout);
    }catch(error){if(!(error instanceof RangeError))throw error;executable=false;}
    if(!executable){
      candidates.unshift(task(buy?'refund-buy':'refund-sell',buy
        ?refundBuyCalls({...args,quotedPsy:number(o.quote)}) :refundSellCalls(args)));
      continue;
    }
    candidates.push(task(buy?'buy':'sell',buy?settleBuyCalls(args):settleSellCalls(args)));
  }
  if(candidates.length)return candidates[0];
  if(automaticGraduation&&pool.phase===1n&&pool.sold_lots>=c.thresholdLots && issuerSentPsy-pool.issuerSettledPsy===FEE_ESCROW)
    return task('graduate',graduateCalls({...base,soldLots:number(pool.sold_lots)}));
  return null;
}

export async function scanCurve(options,readState=publicState){
  const state=await readState(options.rpcConfig),abi=JSON.parse(await readFile(options.abi,'utf8'));
  const launch=JSON.parse(await readFile(options.driverConfig,'utf8'));
  initializeCalls({...launch,contractId:options.contractId,vaultId:options.vaultId});
  const indexed=(name,user)=>{
    const field=abi.contract.state.find(x=>x.name===name);
    if(!field||field.type.item_felt_size!==1||user>=field.type.length)throw Error(`invalid curve cursor: ${name}`);
    return state.slot(options.vaultId,options.contractId,field.offset+user);
  };
  const pool=await state.fields(options.vaultId,options.contractId,abi,['phase',...Object.keys(parameters),'sold_lots','psy_reserve']);
  pool.issuerSettledPsy=await indexed('settled_psy_sent',launch.issuerId);
  const issuerSentPsy=await state.slot(launch.issuerId,0,3+2*options.vaultId);
  const issuerSentToken=await state.slot(launch.issuerId,launch.tokenId,3+2*options.vaultId);
  const orders=await mapReads(options.users,async payerId=>{
    if(!Number.isSafeInteger(payerId)||payerId<1||payerId>=16_777_216||payerId===options.vaultId)throw new RangeError('invalid curve payer');
    const f=await state.fields(payerId,options.contractId,abi,['order_kind','order_vault_user','order_lots','order_expected_sold','order_psy_quote','order_deadline','order_nonce']);
    const [consumedNonce,settledPsy,settledToken,sentPsy,sentToken]=await readTogether([
      indexed('consumed_nonce',payerId),indexed('settled_psy_sent',payerId),indexed('settled_token_sent',payerId),
      state.slot(payerId,0,3+2*options.vaultId),state.slot(payerId,launch.tokenId,3+2*options.vaultId)]);
    return {payerId,kind:f.order_kind,vault:f.order_vault_user,lots:f.order_lots,expectedSold:f.order_expected_sold,
      quote:f.order_psy_quote,deadline:f.order_deadline,nonce:f.order_nonce,
      consumedNonce,settledPsy,settledToken,sentPsy,sentToken};
  });
  return {checkpoint:state.checkpoint,pool,orders,action:proposeCurveAction({...options,launch,pool,orders,checkpoint:state.checkpoint,issuerSentPsy,issuerSentToken})};
}
