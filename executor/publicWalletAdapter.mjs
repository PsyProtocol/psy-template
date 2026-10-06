import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import assert from 'node:assert/strict';
import {publicState} from './publicState.mjs';import {receiptReader} from './chainReceipts.mjs';
import {retryProofOnlyPreflight} from './preflight.mjs';
import {scanPool} from '../launchamm/chainReader.mjs';
import {scanOrderbook} from '../orderbook/rpcReader.mjs';
import {scanAmm} from '../amm/chainReader.mjs';
const execFile=promisify(execFileCallback);
const padded=x=>x.toLowerCase().padStart(64,'0');
export async function createPublicWalletAdapter(options){
 assert.ok(['launchamm','orderbook','amm'].includes(options.kind),'unsupported public wallet kind');
 const state=await publicState(options.rpcConfig),leaf=await state.contractLeaf(options.contractId);
 assert.equal(leaf.code_root,options.codeRoot,'deployed code root');assert.equal(leaf.state_layout_root,options.layoutRoot,'deployed layout root');
 assert.deepEqual(await state.userIds(options.publicKeyHash),[options.vaultId],'public vault registration');
 assert.equal(state.networkName,options.network,'network identity');
 const prefix=options.kind==='launchamm'?[String(options.contractId),options.driverConfig]:[String(options.contractId)];
 const env={...process.env,LAUNCH_POOL_USE_LOCAL_PROVER:'1',ORDERBOOK_USE_LOCAL_PROVER:'1',AMM_USE_LOCAL_PROVER:'1'};
 for(const k of Object.keys(env))if(k.endsWith('_WITNESS_WALLET')||k.endsWith('_LOCAL_DEFS'))delete env[k];
 const identity=await execFile(options.wallet,['fingerprint',...prefix],{env,timeout:120000,maxBuffer:2000000});
 assert.equal(padded(identity.stdout.trim().split('\n').at(-1)),padded(options.fingerprint),'wallet circuit fingerprint');
 const reader=await receiptReader(options.rpcConfig);
 async function scan(){
  if(options.kind==='launchamm')return scanPool(options);
  if(options.kind==='amm')return scanAmm(options);
  return scanOrderbook(options);
 }
 const leafFrom=outcome=>outcome?.endUserLeafHash;
 async function reconcile(attempt){return reader({userId:options.vaultId,endUserLeafHash:leafFrom(attempt.outcome)});}
 async function bindingCurrent(){const s=await publicState(options.rpcConfig),l=await s.contractLeaf(options.contractId);assert.equal(l.code_root,options.codeRoot,'code changed during execution');assert.equal(l.state_layout_root,options.layoutRoot,'layout changed during execution');assert.deepEqual(await s.userIds(options.publicKeyHash),[options.vaultId]);}
 return {scan,reconcile,
  isCurrent:async task=>{await bindingCurrent();return JSON.stringify((await scan()).action)===JSON.stringify(task);},
  prove:async task=>{const dir=await mkdtemp(join(tmpdir(),'psy-public-ups-')),file=join(dir,'calls.json');await writeFile(file,JSON.stringify(task.submission),{mode:0o600});
   const args=['submit',...prefix,file,options.rpcConfig];await retryProofOnlyPreflight(()=>execFile(options.wallet,args,{env:{...env,LAUNCH_POOL_PROVE_ONLY:'1',ORDERBOOK_PROVE_ONLY:'1',AMM_PROVE_ONLY:'1'},timeout:900000,maxBuffer:2000000}));return {file,args};},
  submit:async(_task,proof)=>{let output,error;try{const r=await execFile(options.wallet,proof.args,{env:{...env,LAUNCH_POOL_PROVE_ONLY:'0',ORDERBOOK_PROVE_ONLY:'0',AMM_PROVE_ONLY:'0'},timeout:900000,maxBuffer:2000000});output=r.stdout+'\n'+r.stderr;}catch(e){output=(e.stdout??'')+'\n'+(e.stderr??'');error=e.message;}
   const endUserLeafHash=output.match(/submitted (?:launch pool vault|orderbook escrow|pool) transaction ([0-9a-f]{64})/)?.[1]??output.match(/deterministic leaf ([0-9a-f]{64})/)?.[1];
   return {endUserLeafHash,error,output};}
 };
}
