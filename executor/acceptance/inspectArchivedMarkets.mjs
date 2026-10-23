// Read-only post-loss inventory. Never reconstructs an original request,
// submits a replacement, or certifies historical inclusion/conservation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {publicState} from '../publicState.mjs';
import {readTogether} from '../readConcurrency.mjs';
import {saveObservation} from '../observations.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
export async function inspectArchivedMarkets(publicDirectory,rpcConfig,{readState=publicState}={}){
 const metrics=[],startedAt=new Date().toISOString(),start=performance.now(),memoryBefore=process.memoryUsage().rss;
 const s=await readState(rpcConfig,{observeRead:r=>metrics.push(r)}),markets=[];
 for(const kind of ['amm','orderbook','bondingcurve','nftmarket']){
  const dir=join(publicDirectory,`maximum-${kind}-executor`),options=read(join(dir,'executor.json')),abi=read(join(dir,'abi.json')),dependencies=read(join(dir,'dependencies.json'));
  assert.equal(options.kind,kind);assert.equal(options.network,s.networkName);assert.equal(BigInt(s.network.magic),1384803358401154921n);
  const checks=await readTogether(dependencies.map(async b=>{
   const leaf=await s.contractLeaf(b.contract.contractId);
   assert.deepEqual({contract:{contractId:b.contract.contractId,codeRoot:leaf.code_root,layoutRoot:leaf.state_layout_root,stateTreeHeight:leaf.state_tree_height},functionTreeRoot:leaf.function_tree_root,layoutFieldCount:leaf.state_layout_field_count,layoutSlotCount:leaf.state_layout_slot_count},b,'current dependency differs from archived binding');return {binding:b,current:leaf};
  }));
  assert.deepEqual(await s.userIds(options.publicKeyHash),[options.vaultId]);
  assert.ok(checks.some(c=>c.binding.contract.contractId===options.contractId&&c.binding.contract.codeRoot===options.codeRoot&&c.binding.contract.layoutRoot===options.layoutRoot));
  const fields=new Map(abi.contract.state.map(f=>[f.name,f.offset]));assert.equal(fields.size,abi.contract.state.length);
  const names=['batch_ready','batch_id','batch_phase','batch_cutoff','batch_expiry','batch_count','batch_root','batch_users','batch_done','batch_rank','queue_epoch','queue_phase','queue_cutoff','queue_count','queue_root','queue_history','queue_owner','queue_nonce','queue_outcome'];
  const four=new Set(['batch_root','batch_users','batch_done','batch_rank','queue_root','queue_history','queue_owner','queue_nonce','queue_outcome']);
  const values=Object.fromEntries(await readTogether(names.map(async name=>{assert.ok(fields.has(name),'missing '+name);const width=four.has(name)?4:1;return[name,await readTogether(Array.from({length:width},(_,i)=>s.slot(options.vaultId,options.contractId,fields.get(name)+i)))];})));
  const realm=s.network.realm_configs.find(r=>r.id===Math.floor(options.vaultId/s.network.users_per_realm));
  assert.ok(realm);const account=await s.rpc(realm.rpc_url[0],'psy_get_user_leaf_data',{checkpoint_id:s.checkpoint,user_id:options.vaultId},{exactIntegers:true});
  markets.push({kind,marketId:options.contractId,vaultId:options.vaultId,publicKeyHash:options.publicKeyHash,fingerprint:options.fingerprint,sourceHashes:Object.fromEntries(['executor.json','abi.json','dependencies.json'].map(f=>[f,hash(join(dir,f))])),dependencies:checks,account,values});
 }
 return{schema:1,startedAt,finishedAt:new Date().toISOString(),wallMilliseconds:performance.now()-start,parentRssBeforeBytes:memoryBefore,parentRssAfterBytes:process.memoryUsage().rss,checkpoint:s.checkpoint,heads:s.heads,network:s.networkName,networkMagic:String(s.network.magic),rpcConfigSha256:hash(rpcConfig),markets,readMetrics:metrics,readMetricFailures:s.readMetricFailures??0,
  scope:'Current public RPC observation at a common checkpoint, dependency/key registration checks. Not an authenticated state proof, historical receipt reconstruction, funds audit, financial retry or completed acceptance. No old QA wallet signing material survives; no mutation is attempted.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const[archive,rpc,out]=process.argv.slice(2);assert.ok(archive&&rpc&&out,'ARCHIVE_PUBLIC RPC_CONFIG FRESH_OUT');saveObservation(out,await inspectArchivedMarkets(archive,rpc));}
