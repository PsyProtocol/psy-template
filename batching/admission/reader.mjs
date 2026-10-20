// Proposals from a bounded sealed queue. RPC data is not itself a proof.
// A complete contract/SD-key UPS verifies every proposal before submission.
import assert from 'node:assert/strict';
import {publicState} from '../../executor/publicState.mjs';
import {loadBatchFiles,scanBatch} from '../v2/reader.mjs';
import {witness,operationCalls} from '../v2/policy.mjs';
import {losslessJson,parseLosslessJson,FEE_ESCROW} from '../../amm/u124/client.mjs';
export function compactRequest(policy,fields){const normalized=fields.map(BigInt);if(normalized[73]===0n)normalized[73]=1000000000n;const calls=operationCalls(policy,normalized).filter(c=>{const skip=c.contract_id===BigInt(policy.noop.contract_id)&&c.method_id===BigInt(policy.noop.method_id);if(skip)assert.ok(c.method_name==='noop'&&c.inputs.length===0,'ambiguous noop');return !skip;});assert.ok(calls.length>=2&&calls.at(-1).method_name==='simple_burn');return {contract_calls:calls.slice(0,-1).map(({contract_id,method_name,inputs})=>({contract_id,method_name,inputs})),software_defined_call:{inputs:fields.map(BigInt)}};}
export function queueMaintenance(policy,{name,payer,a,b=0n}){assert.ok(['start_epoch','admit_entry','seal_epoch','abort_empty_epoch'].includes(name));const op=policy.operations.find(o=>o.name===name&&o.maintenance);assert.ok(op,'queue operation policy');const row=Array(13).fill(0n);row[0]=BigInt(op.branch);row[1]=BigInt(payer);row[2]=BigInt(a);if(op.calls.some(c=>c.inputs.some(x=>x.witness===3)))row[3]=BigInt(b);return compactRequest(policy,witness({mode:4,operations:[row],burn:0n}));}
export async function scanAdmission(options,readState=publicState,files){
 const s=await readState(options.rpcConfig);files??=await loadBatchFiles(options);const {abi,policy}=files,V=options.vaultId,C=options.contractId;
 const map=new Map(abi.contract.state.map(x=>[x.name,x.offset]));const at=(u,n,i=0)=>{assert.ok(map.has(n),'missing admission ABI '+n);return s.slot(u,C,map.get(n)+i);};
 const [batchPhase,ready,queuePhase,epoch,count,cutoff,batch,expiry]=await Promise.all(['batch_phase','batch_ready','queue_phase','queue_epoch','queue_count','queue_cutoff','batch_id','batch_expiry'].map(n=>at(V,n)));
 assert.ok([0n,1n,3n,4n].includes(batchPhase),'atomic batch phase');assert.ok([0n,1n,2n,3n].includes(queuePhase),'queue phase');assert.ok(count>=0n&&count<=4n);
 const wrap=result=>{if(!result.action)return result;const f=parseLosslessJson(result.action.submission).software_defined_call.inputs.map(BigInt);return {...result,action:{...result.action,profile:'compact-v1',validUntilCheckpoint:(f[0]===1n?f[3]:f[0]===2n?expiry:BigInt(s.checkpoint)+64n).toString(),submission:losslessJson(compactRequest(policy,f)),proofVerified:false}};};
 // Bootstrap/Curve inventory are distinct maintenance. No user hint discovery.
 if(ready===0n||(options.kind==='bondingcurve'&&await at(V,'phase')===0n))return wrap(await scanBatch({...options,users:[]},async()=>s,files));
 const root=await Promise.all([0,1,2,3].map(i=>at(V,'queue_root',i)));const scope={epoch,sourceCutoff:cutoff,count,root,source:'sealed queue; proposal requires authenticated contract proof'};
 if(batchPhase===1n){assert.equal(queuePhase,2n,'pending batch retains sealed queue');const result=await scanBatch({...options,users:[]},async()=>s,files);return {...wrap(result),scope};}
 if(queuePhase!==2n)return {checkpoint:s.checkpoint,phase:batchPhase,scope,action:null,reason:queuePhase===1n?'awaiting-consented-admissions-and-seal':queuePhase===3n?'epoch-complete':'epoch-not-started'};
 assert.ok(count>0n&&root.some(n=>n!==0n),'nonempty sealed queue');
 const owners=await Promise.all([0,1,2,3].map(i=>at(V,'queue_owner',i))),nonces=await Promise.all([0,1,2,3].map(i=>at(V,'queue_nonce',i)));
 for(let i=0;i<4;i++){assert.ok(i<Number(count)?owners[i]>0n&&owners[i]<16777216n&&nonces[i]>0n&&nonces[i]<(1n<<62n):owners[i]===0n&&nonces[i]===0n,'canonical accepted member');if(i&&i<Number(count))assert.ok(owners[i]>owners[i-1],'unique sorted accepted set');}
 const sponsor=options.batchSponsorId;assert.ok(Number.isSafeInteger(sponsor)&&sponsor>0&&sponsor!==V&&!owners.includes(BigInt(sponsor)),'separate batch sponsor');
 const [sent,claimed,base,pool,amount,nonce,used,purpose]=await Promise.all([s.slot(sponsor,0,3+2*V),s.slot(V,0,4+2*sponsor),at(V,'settled_fee',sponsor),at(sponsor,'sponsor_pool'),at(sponsor,'sponsor_amount'),at(sponsor,'sponsor_nonce'),at(V,'used_sponsorship',sponsor),at(sponsor,'sponsor_purpose')]);
 if(claimed!==base||sent-base!==2n*FEE_ESCROW||pool!==BigInt(V)||amount!==2n*FEE_ESCROW||nonce<=used||purpose!==1n)return {checkpoint:s.checkpoint,phase:batchPhase,scope,action:null,reason:'sponsor-funding-required',sponsor};
 const life=options.batchExpiryCheckpoints??64;assert.ok(Number.isSafeInteger(life)&&life>=1&&life<=1024);const until=BigInt(s.checkpoint)+BigInt(life);assert.ok(until<(1n<<32n));
 // All accepted members are included, even unmatched Book/NFT carries or
 // invalid funding requiring a refund. Never filter/reselect using a hint file.
 const fields=witness({mode:1,batch:batch+1n,users:owners.slice(0,Number(count)),nonces:nonces.slice(0,Number(count)),expiry:until,sponsor:BigInt(sponsor),burn:0n});
 return {checkpoint:s.checkpoint,phase:batchPhase,scope,action:{kind:'batch_commit',batchId:(batch+1n).toString(),profile:'compact-v1',validUntilCheckpoint:until.toString(),submission:losslessJson(compactRequest(policy,fields)),proofVerified:false}};
}
