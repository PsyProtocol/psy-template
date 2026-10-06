import {createPoolCalls,POOL_FEE_ESCROW,POOL_AMOUNT_CAP} from './operationCalls.mjs';
import {quoteExactIn,quoteRemoveLiquidity} from '../amm/referenceMath.mjs';
const cap=BigInt(POOL_AMOUNT_CAP),fee=BigInt(POOL_FEE_ESCROW),n=Number;
// Inputs are one checkpoint's authenticated public slots. Choose one UPS;
// rescan after inclusion because each settlement changes the shared reserves.
export function proposePoolAction({config,pool,orders,checkpoint}) {
 const calls=createPoolCalls(config),signed=x=>calls.withPoolSignInputs(x);
 if(pool.phase!==1n)return null;
 for(const o of orders){
  if(o.pool!==BigInt(config.poolUserId)||o.kind===0n||o.nonce<=o.consumedNonce)continue;
  const psy=o.sentPsy-o.settledPsy,token=o.sentToken-o.settledToken;
  if(psy<0n||token<0n)continue;
  const payerId=o.payerId,nonce=n(o.nonce),expired=BigInt(checkpoint)>o.deadline;
  if(o.kind===1n){
   if(o.asset!==0n&&o.asset!==BigInt(config.tokenId))continue;
   const isPsy=o.asset===0n,x=isPsy?o.amountPsy:o.amountToken;
   if(x<1n||x>cap||psy!==(isPsy?x*BigInt(config.psyUnit):0n)+fee||token!==(isPsy?0n:x*BigInt(config.tokenUnit)))continue;
   if(expired)return {kind:'refund-swap',payerId,submission:signed(calls.refundSwapCalls({payerId,asset:n(o.asset),amount:n(x)}))};
   try{const q=quoteExactIn({reserveIn:isPsy?pool.reservePsy:pool.reserveToken,reserveOut:isPsy?pool.reserveToken:pool.reservePsy,amountIn:x,minAmountOut:o.minOut});if(q.nextReserveIn>cap)continue;
    return {kind:'swap',payerId,submission:signed(calls.settleSwapCalls({payerId,asset:n(o.asset),amountIn:n(x),amountOut:n(q.amountOut),nonce}))};
   }catch{continue;}
  }
  if(o.kind===2n){
   if(psy<fee||(psy-fee)%BigInt(config.psyUnit)||token%BigInt(config.tokenUnit))continue;
   const x=(psy-fee)/BigInt(config.psyUnit),y=token/BigInt(config.tokenUnit);
   if(x>cap||y>cap||(x>0n&&x!==o.amountPsy)||(y>0n&&y!==o.amountToken))continue;
   if(expired&&x+y>0n)return {kind:'refund-add',payerId,submission:signed(calls.refundAddCalls({payerId,amountPsy:n(x),amountToken:n(y)}))};
   if(x!==o.amountPsy||y!==o.amountToken||x<1n||y<1n||pool.reservePsy<1n||pool.reserveToken<1n||x*pool.reserveToken!==y*pool.reservePsy)continue;
   const minted=x*pool.totalShares/pool.reservePsy;
   if(minted<o.minOut||minted<1n||pool.totalShares+minted>cap||pool.reservePsy+x>cap||pool.reserveToken+y>cap||o.ownedShares+minted>cap)continue;
   return {kind:'add',payerId,submission:signed(calls.settleAddCalls({payerId,amountPsy:n(x),amountToken:n(y),minted:n(minted),nonce}))};
  }
  if(o.kind===3n&&psy===fee&&token===0n){
   if(expired)return {kind:'cancel-remove',payerId,submission:calls.cancelRemoveCalls({payerId,nonce})};
   if(o.ownedShares<o.shares)continue;
   try{const q=quoteRemoveLiquidity({reservePsy:pool.reservePsy,reserveUsdt:pool.reserveToken,totalShares:pool.totalShares,shares:o.shares});if(q.amountPsy<o.minPsy||q.amountUsdt<o.minToken)continue;
    return {kind:'remove',payerId,submission:signed(calls.settleRemoveCalls({payerId,shares:n(o.shares),amountPsy:n(q.amountPsy),amountToken:n(q.amountUsdt),nonce}))};
   }catch{continue;}
  }
 }
 return null;
}
