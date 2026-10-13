import {encodeAmount,tokenCall} from './arithmetic.mjs';
const P=18446744069414584321n;
function user(value){if(!Number.isSafeInteger(value)||value<1||value>=16777216)throw new RangeError('user ID must be 1..16777215');return value;}
function channel(value){if(!Number.isSafeInteger(value)||value<0||value>=16)throw new RangeError('channel must be 0..15');return value;}
function scalar(value){if(typeof value==='number'){if(!Number.isSafeInteger(value))throw new RangeError('unsafe Number; use BigInt');value=BigInt(value);}if(typeof value!=='bigint'||value<0n||value>=P)throw new RangeError('invalid Felt');return value;}
function vector(values,length){if(!Array.isArray(values)||values.length!==length)throw new RangeError('invalid metadata length');return values.map(scalar);}
function amount(value){if(value===0n)throw new RangeError('positive amount required');return encodeAmount(value);}
export function createTokenCallBuilder(contractId){
 const call=(method,...inputs)=>tokenCall(contractId,method,inputs);
 tokenCall(contractId,'claim');
 return {
  setMetadata:(symbol,decimals)=>{if(!Number.isInteger(decimals)||decimals<0||decimals>18)throw new RangeError('decimals must be 0..18');return call('set_metadata',scalar(symbol),decimals);},
  setExtendedMetadata:(name,uri)=>call('set_extended_metadata',...vector(name,2),...vector(uri,5)),
  setMaxSupply:cap=>call('set_max_supply',...amount(cap)),
  mint:value=>call('mint',...amount(value)),mintTo:(to,value)=>call('mint_to',user(to),...amount(value)),
  burn:value=>call('burn',...amount(value)),settleBurn:from=>call('settle_burn',user(from)),
  setMintAuthority:to=>call('set_mint_authority',user(to)),renounceMintAuthority:()=>call('renounce_mint_authority'),
  transfer:(to,value)=>call('transfer',user(to),...amount(value)),claim:from=>call('claim',user(from)),
  cancelUnclaimedPayment:from=>call('cancel_unclaimed_payment',user(from)),
  refundClaimedPayment:(from,value)=>call('refund_claimed_payment',user(from),...amount(value)),
  batchTransfer:payments=>{
   if(!Array.isArray(payments)||![2,5].includes(payments.length))throw new RangeError('batch requires 2 or 5 payments');
   return call('batch_transfer_'+payments.length,...payments.map(p=>p.amount===0n&&p.to===0?0:user(p.to)),...payments.flatMap(p=>encodeAmount(p.amount)));
  },
  openDelegationChannel:(index,spender,value)=>call('open_delegation_channel',channel(index),user(spender),...amount(value)),
  spendDelegation:(owner,index,value,to)=>call('spend_delegation',user(owner),channel(index),...amount(value),user(to)),
  requestRevokeDelegation:index=>call('request_revoke_delegation',channel(index)),
  closeDelegationChannel:(owner,index,version)=>{version=scalar(version);if(version===0n||version>=(1n<<62n))throw new RangeError('version must be 1..2^62-1');return call('close_delegation_channel',user(owner),channel(index),version);},
  finalizeRevokeDelegation:(index,spender)=>call('finalize_revoke_delegation',channel(index),user(spender)),
 };
}
