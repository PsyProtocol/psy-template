// Wallet-owned review policy, never a page-supplied token catalogue or ABI.
import {canonical, digest} from "../protocol.mjs";
import {validateCommitmentContext, validateCommitmentPlan, validateCallCommitments} from "./commitments.mjs";
import {MAX_AMOUNT,formatUnits} from "../../token/wide/arithmetic.mjs";
const ok=(v,m)=>{if(!v)throw Error(m);};
const HEX=/^[0-9a-f]{64}$/;
const exact=(v,fields)=>ok(v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join()===fields.sort().join(),"Exact public review fields required");
const amount=v=>typeof v==="string"&&/^[1-9]\d{0,37}$/.test(v)&&BigInt(v)<=MAX_AMOUNT;
export function validateClaimOutputs(outputs,calls,recipientId){
 validateCallCommitments(calls);
 ok(Array.isArray(outputs)&&outputs.length===1&&calls.length===2&&calls[0].methodName==="private_claim"&&calls[0].inputCount===86&&calls[0].callerContractId==="4294967296","Reviewed compact claim output scope required");
 const o=outputs[0];
 exact(o,["kind","assetId","recipientId","amountBaseUnits","codeRoot","layoutRoot","functionRoot"]);
 ok(o.kind==="ft-credit"&&o.assetId===calls[0].contractId&&/^[1-9]\d{0,7}$/.test(o.assetId)&&BigInt(o.assetId)>=5n&&BigInt(o.assetId)<16777216n&&
  o.recipientId===String(recipientId)&&amount(o.amountBaseUnits)&&[o.codeRoot,o.layoutRoot,o.functionRoot].every(v=>HEX.test(v)),"Verified claim output identity/amount required");
 return o;
}
export async function reviewCommitmentConfirmation(terms,catalogue){
 exact(terms,["schema","context","intentId","recordId","preparedHash","requestSha256","callCommitments","claimOutputs","actualFee","maxNetworkFee","validUntilCheckpoint","review"]);
 validateCommitmentContext(terms.context);
 exact(terms.review,["request","plan"]);
 exact(terms.review.request,["userId"]);
 validateCommitmentPlan(terms.review.plan,terms.review.request.userId);
 const p=terms.review.plan,c=terms.context;
 ok(terms.schema===1&&[terms.intentId,terms.recordId,terms.preparedHash,terms.requestSha256,c.account,c.fingerprint,c.networkHash,c.chainKey].every(v=>HEX.test(v))&&
  p.userId===c.userId&&p.recipientId===c.userId&&await digest(p.network)===c.networkHash&&
  terms.validUntilCheckpoint===p.validUntilCheckpoint&&terms.maxNetworkFee===p.maxNetworkFee&&amount(terms.actualFee)&&BigInt(terms.actualFee)<=BigInt(terms.maxNetworkFee),"Exact identity/domain/fee review required");
 const origin=new URL(c.origin);
 ok(origin.origin===c.origin&&(origin.protocol==="https:"||(origin.protocol==="http:"&&["localhost","127.0.0.1"].includes(origin.hostname))),"Exact secure requesting origin required");
 const o=validateClaimOutputs(terms.claimOutputs,terms.callCommitments,c.userId),fee=terms.callCommitments[1];
 ok(canonical(terms.callCommitments.slice(0,-1))===canonical(p.callCommitments)&&fee.contractId==="0"&&fee.callerContractId==="4294967296"&&fee.methodName==="burn"&&fee.inputCount===1,"Exact approved claim/fee order required");
 ok(Object.isFrozen(catalogue)&&Array.isArray(catalogue)&&catalogue.length>0&&catalogue.length<=64,"Immutable wallet-owned asset catalogue required");
 for(const a of catalogue){
  exact(a,["contractId","profile","codeRoot","layoutRoot","functionRoot","decimals","symbol"]);
  ok(Object.isFrozen(a)&&/^[1-9]\d{0,7}$/.test(a.contractId)&&BigInt(a.contractId)<16777216n&&a.profile==="u124_private_compact_v2"&&
   [a.codeRoot,a.layoutRoot,a.functionRoot].every(v=>HEX.test(v))&&Number.isInteger(a.decimals)&&a.decimals>=0&&a.decimals<=18&&
   typeof a.symbol==="string"&&/^[A-Za-z][A-Za-z0-9._-]{0,15}$/.test(a.symbol),"Reviewed immutable token metadata required");
 }
 ok(new Set(catalogue.map(a=>a.contractId)).size===catalogue.length,"Duplicate reviewed asset identity");
 const asset=catalogue.find(a=>a.contractId===o.assetId);
 ok(asset&&["codeRoot","layoutRoot","functionRoot"].every(k=>asset[k]===o[k]),"Claim executable has no reviewed token identity");
 const rows=[{label:"Action",value:"Claim tokens"},{label:"Asset",value:asset.symbol+" (contract "+o.assetId+")"},
  {label:"Amount",value:formatUnits(BigInt(o.amountBaseUnits),asset.decimals)+" "+asset.symbol},
  {label:"Base units",value:o.amountBaseUnits},{label:"Decimals",value:String(asset.decimals)},
  {label:"Recipient",value:o.recipientId},{label:"Network",value:p.network.name},{label:"Nonce",value:p.walletNonce},
  {label:"Network fee",value:formatUnits(BigInt(terms.actualFee),9)+" PSY"},
  {label:"Fee limit",value:formatUnits(BigInt(terms.maxNetworkFee),9)+" PSY"},
  {label:"Valid through",value:"Checkpoint "+terms.validUntilCheckpoint},{label:"Exact request",value:terms.requestSha256}];
 return {approvalSha256:await digest(terms),rows,scope:"Verified token credit and exact request approval; not broadcast or network confirmation"};
}
