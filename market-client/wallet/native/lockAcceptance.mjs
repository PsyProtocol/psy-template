// Browser-only protocol test. Synthetic proofs/backend, no RPC or real send.
import {createStagedWallet} from '../staged.mjs';
import {createBrowserWalletLock} from '../lockCoordinator.mjs';
import {digest,canonical} from '../../protocol.mjs';
export async function installLockAcceptance(prefix){
 if(!/^psy-qa-lock-\d+$/.test(prefix))throw Error('Dedicated test prefix required');
 const hash=async x=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const H=x=>hash(x),network={name:'synthetic',magic:'1'};
 const context={origin:location.origin,account:await H('public'),fingerprint:await H('key'),chainKey:await H('chain'),userId:12345,networkHash:await digest(network)};
 const record={recordId:await H('record'),registryHash:await H('registry'),request:{userId:12345},snapshot:{user:{publicKeyHash:context.account}},plan:{financialAuthorization:false,userId:12345,recipientId:12345,network,sdkManifestSha256:await H('sdk'),startUserLeafHash:await H('start'),walletNonce:'8',startCheckpoint:100,validUntilCheckpoint:164,maxNetworkFee:'5000000000',calls:[{contract_id:'2497',method_name:'request_cancel',inputs:[]}]}};
 const store={get:async k=>{const x=localStorage.getItem(prefix+':'+k);return x?JSON.parse(x):undefined;},set:async(k,v)=>localStorage.setItem(prefix+':'+k,JSON.stringify(v))};
 const counter=k=>{const key=prefix+':'+k;localStorage.setItem(key,String(Number(localStorage.getItem(key)||0)+1));};
 const requestJson='{"synthetic":true}';
 const prepared={schema:1,requestJson,requestSha256:await H(requestJson),manifestSha256:await H('manifest'),endUserLeafHash:await H('end'),sigHash:await H('sig'),sessionHash:await H('session'),fingerprint:context.fingerprint,userId:12345,publicKeyHash:context.account,networkHash:context.networkHash,registryHash:record.registryHash,sdkManifestSha256:record.plan.sdkManifestSha256,startUserLeafHash:record.plan.startUserLeafHash,walletNonce:'8',validUntilCheckpoint:164,actualFee:'1000001000',fullCalls:[...record.plan.calls,{contract_id:'0',method_name:'simple_burn',inputs:['1000001000']}]};
 const backend={prepareOnly:async()=>prepared,verifyPrepared:async(r,p)=>({fullProofVerified:true,fullCallsBound:true,sessionBound:true,sigHashBound:true,endpointsAndFeesBound:true,requestSha256:p.requestSha256,manifestSha256:p.manifestSha256,sdkManifestSha256:p.sdkManifestSha256}),recheck:async(r,p)=>({requestSha256:p.requestSha256,checkpoint:101,identityAndDependenciesVerified:true,fullStateAndNonceVerified:true,feesVerified:true}),broadcastExact:async()=>{counter('mockSends');throw Error('synthetic lost reply');},reconcile:async()=>({status:'unresolved'})};
 const service=createStagedWallet({store,backend,exclusive:createBrowserWalletLock(),verifyRecord:async r=>{if(r.recordId!==record.recordId)throw Error('changed synthetic record');},confirmBroadcast:async terms=>{counter('approvals');return{approved:true,approvalSha256:await digest(terms)};}});
 return {prepare:()=>service.prepare(context,record),broadcast:p=>service.broadcast(context,p.intentId,p.preparedHash),observations:()=>({approvals:Number(localStorage.getItem(prefix+':approvals')||0),mockSends:Number(localStorage.getItem(prefix+':mockSends')||0),secureContext:isSecureContext,browserLockManager:typeof navigator.locks?.request==='function',synthetic:true,financialOperations:0})};
}
