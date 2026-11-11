import test from 'node:test'; import assert from 'node:assert/strict';
import {validateRecoveredDeployment, reconcileInitialDeployment} from './reconcileInitialDeployment.mjs';
import {sha256} from '../requestBinding.mjs';
import {mkdtempSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const h='a'.repeat(64), requestBytes=Buffer.from('exact saved public request');
function fixture(){return {owner:971904,checkpoint:101,requestBytes,before:{checkpoint_id:100,next_contract_id:51},
  preflight:{initialLayoutVerified:true,publicEndpointsBound:true,oldFieldCount:0,oldSlotCount:0,
    expectedDeployer:'971904',codeRoot:h,functionTreeRoot:h,stateTreeHeight:31,layoutRoot:h,newFieldCount:58,newSlotCount:1325400292},
  identity:{requestSha256:sha256(requestBytes),deployer:'971904',expectedContentHash:h,codeRoot:h,functionTreeRoot:h,stateTreeHeight:31},
  receipt:{success:true,data:{status:'included',tx_type:'DeployContract',content_hash:h,included_checkpoint_id:101,result:{contract_id:51}}},
  leaf:{deployer:971904,code_root:h,function_tree_root:h,state_layout_root:h,state_tree_height:31,state_layout_field_count:58,state_layout_slot_count:1325400292}};}
test('original unknown deployment can be recovered without an ACK or another send',()=>{
  const v=validateRecoveredDeployment(fixture());assert.equal(v.contractId,51);assert.equal(v.binding.contract.codeRoot,h);
});
test('historical occurrence, wrong roots, unverified layout and altered lookup identity fail closed',()=>{
  const mutations=[v=>{v.receipt.data.result.contract_id=50;},v=>{v.receipt.data.included_checkpoint_id=100;},
    v=>{v.leaf.deployer=3;},v=>{v.leaf.state_layout_root='b'.repeat(64);},v=>{v.preflight.initialLayoutVerified=false;},
    v=>{v.identity.requestSha256='b'.repeat(64);},v=>{v.identity.functionTreeRoot='b'.repeat(64);},
    v=>{v.receipt.data.content_hash='b'.repeat(64);},v=>{v.checkpoint=100;},v=>{v.preflight.oldFieldCount=14;},
    v=>{v.receipt.success=false;},v=>{v.receipt.data.status='pending';}];
  for(const change of mutations){const v=fixture();change(v);assert.throws(()=>validateRecoveredDeployment(v));}
});
test('404 never authorizes a retry, and a chain reset stops recovery before receipt lookup (mock RPC)',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'psy-deployment-recovery-'));
  try {
    const v=fixture(),chain='b'.repeat(64),put=(name,value)=>{const p=join(dir,name);writeFileSync(p,JSON.stringify(value));return p;};
    writeFileSync(join(dir,'request.json'),v.requestBytes);
    for(const name of ['before','preflight'])put(name+'.json',v[name]);
    put('intent.json',{action:'initial-deploy-only',chainRootAt1:chain});
    const config=put('config.json',{defaultNetwork:'testnet',networks:{testnet:{api_services_url:['https://index.invalid']}}});
    const identityPath=put('identity.json',v.identity),files=readdirSync(dir);let lookups=0,actualChain=chain;
    const options={config,attempt:dir,identityPath,chainRootAt1:chain,owner:v.owner,
      readState:async()=>({networkName:'testnet',checkpoint:101,coordinator:'https://c.invalid',
        rpc:async(_url,method)=>{assert.equal(method,'psy_get_checkpoint_leaf_data');return {global_chain_root:actualChain};},
        contractLeaf:async()=>{throw Error('not found must not authorize a leaf guess');}}),
      fetchImpl:async(_url,options)=>{lookups++;assert.equal(options.redirect,'manual');assert.equal(options.method,undefined);
        return new Response(JSON.stringify({success:false,error:'Transaction not found'}),{status:404});}};
    const r=await reconcileInitialDeployment(options);assert.equal(r.status,'unknown');assert.equal(r.mayRetry,false);assert.equal(r.broadcasts,0);
    actualChain='c'.repeat(64);await assert.rejects(reconcileInitialDeployment(options),/chain reset/);
    assert.equal(lookups,1);assert.deepEqual(readdirSync(dir),files);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
