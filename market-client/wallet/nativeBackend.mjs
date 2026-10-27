// The extension supplies this fixed verifier implementation and its build pin.
// A dApp can supply only a plan record, never these functions or verifier keys.
import {canonical,hashPattern} from "../protocol.mjs";
import {createExactMarketTransport} from "./exactTransport.mjs";
import {publicManifest,stablePublic,shaPublic} from "./capsule.mjs";
const ok=(v,m)=>{if(!v)throw Error(m);};
export function createNativeMarketBackend({bundle,native,expectedVerifierPackSha256,parse,stringify,fetcher}){
 ok(hashPattern.test(expectedVerifierPackSha256??"")&&typeof native?.identity==="function"&&typeof native?.verify==="function"&&typeof native?.identify==="function","Extension-owned fixed native verifier required");
 const transport=createExactMarketTransport({bundle,parse,fetcher});
 async function identity(record,calls){
  const v=JSON.parse(await native.identity());
  ok(v.schema===1&&v.verifierPackSha256===expectedVerifierPackSha256&&v.sdkManifestSha256===bundle.registry.sdkManifestSha256&&BigInt(v.networkMagic)===BigInt(bundle.registry.network.magic),"Native verifier resource/dependency/network changed");
  const market=bundle.registry.markets.find(m=>m.marketId===record.plan.marketId);
  ok(market&&market.quarantined!==true,"Unreviewed or quarantined native plan");
  // NFT terms that are absent from calldata need a same-UPS postcondition.
  // Keep this boundary closed until that independent assertion path is proved.
  ok(market.kind!=="nftmarket","NFT identity postcondition is not accepted in this native profile");
  for(const c of calls){const d=market.dependencies.find(d=>String(d.contract.contractId)===String(c.contract_id)),k=v.contracts.find(k=>String(k.contractId)===String(c.contract_id));ok(d&&k&&k.codeRoot===d.contract.codeRoot&&k.layoutRoot===d.contract.layoutRoot&&k.functionRoot===d.functionTreeRoot,"Native method resources differ from reviewed route");}
  return v;
 }
 return {
  async identifyForPreparation(record,calls,request){
   const selected=await identity(record,calls);
   const projection=JSON.parse(await native.identify(request));
   ok(projection.verified===false&&hashPattern.test(projection.contentHash??""),"Public request identity projection required");
   return {...projection,verifierPackSha256:selected.verifierPackSha256};
  },
  async verifyPrepared(record,p){
   ok(p.schema===2&&typeof p.verificationBundleJson==="string"&&p.verificationBundleJson.length<=10_000_000,"Public complete-proof bundle missing; preserve legacy preparation");
   await identity(record,p.fullCalls);
   ok(p.verifierPackSha256===expectedVerifierPackSha256,"Prepared verifier build changed; preserve original");
   ok(await shaPublic(p.requestJson)===p.requestSha256&&await shaPublic(p.verificationBundleJson)===p.verificationBundleSha256&&await shaPublic(stablePublic(publicManifest(p)))===p.manifestSha256,"Exact public capsule identity changed");
   const approval={user_id:record.request.userId,public_key:p.publicKeyHash,nonce:BigInt(record.plan.walletNonce),checkpoint_min:record.plan.startCheckpoint,checkpoint_max:record.plan.validUntilCheckpoint,start_leaf:record.plan.startUserLeafHash,max_fee:BigInt(record.plan.maxNetworkFee),network_magic:BigInt(bundle.registry.network.magic),sdk_manifest:bundle.registry.sdkManifestSha256,calls:p.fullCalls};
   const report=JSON.parse(await native.verify(p.requestJson,stringify(approval),p.verificationBundleJson));
   for(const field of ["fullProofVerified","fullCallsBound","sessionBound","sigHashBound","endpointsAndFeesBound"])ok(report[field]===true,"Complete native verification rejected "+field);
   for(const field of ["requestSha256","sdkManifestSha256","contentHash","endUserLeafHash","sigHash","sessionHash","fingerprint","actualFee","verifierPackSha256"])ok(report[field]===p[field],"Native verification artifact mismatch "+field);
   ok(report.userId===p.userId&&report.nonce===p.walletNonce,"Native user/nonce mismatch");
   return {...report,manifestSha256:p.manifestSha256};
  },
  recheck:transport.recheck,
  broadcastExact:transport.broadcastExact,
  reconcile:transport.reconcile,
 };
}
