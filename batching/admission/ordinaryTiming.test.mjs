import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ordinary} from './liveSupport.mjs';
import {losslessJson,parseLosslessJson} from '../../amm/u124/client.mjs';

test('ordinary integration persists fractional resident timings while financial values remain exact integers',async t=>{
 const base=await mkdtemp(join(tmpdir(),'ordinary-timing-'));
 try{
  await mkdir(join(base,'public'));await mkdir(join(base,'attempts'));
  const config=join(base,'public/rpc.json'),root='1'.repeat(64),end='f'.repeat(64),publicKey='a'.repeat(64);
  await writeFile(config,JSON.stringify({defaultNetwork:'test',networks:{test:{users_per_realm:1000,realm_configs:[{id:0,rpc_url:['https://realm.test']}],coordinator_configs:[{id:0,rpc_url:['https://coordinator.test']}]}}}));
  const leaf={code_root:root,state_layout_root:root,state_tree_height:32,function_tree_root:root,state_layout_field_count:3,state_layout_slot_count:100};
  t.mock.method(globalThis,'fetch',async(_url,options)=>({ok:true,text:async()=>JSON.stringify({result:JSON.parse(options.body).method==='psy_get_latest_l2_block_state'?{checkpoint_id:4}:leaf})}));
  const bindings=new Map([[0,{contract:{contractId:0,codeRoot:root,layoutRoot:root,stateTreeHeight:32},functionTreeRoot:root,layoutFieldCount:3,layoutSlotCount:100}]]);
  let runs=0;const worker={run:async({out})=>{
   runs++;await mkdir(out);await writeFile(join(out,'preflight.json'),losslessJson({fullUpsVerified:true,userId:123n,endUserLeafHash:end,core:{checkpoint_id:3n,new_user_leaf:{user_id:123n,public_key:publicKey},largeExactValue:(1n<<100n)+17n}}));
   return{startedAt:'2026-10-25T00:00:00Z',finishedAt:'2026-10-25T00:00:01Z',wallMilliseconds:1000,residentStartup:{ready:true,publicKeyHash:publicKey,sessionConstructionMs:41717.12345}};
  },reconcile:async()=>({status:'included',userId:123,endUserLeafHash:end,checkpoint:4,contentHash:'c'.repeat(64),receipt:{success:true,data:{status:'included'}}})};
  const args={base,config,binary:'unused',secret:'unused',calls:[{contract_id:0n,method_name:'simple_transfer',inputs:[42n,1n]}],bindings,worker};
  const out=await ordinary({...args,name:'valid'});
  assert.equal(JSON.parse(await readFile(join(out,'timing.json'),'utf8')).residentStartup.sessionConstructionMs,41717.12345);
  assert.equal(parseLosslessJson(await readFile(join(out,'included.json'),'utf8')).preflight.core.largeExactValue,(1n<<100n)+17n);
  await assert.rejects(ordinary({...args,name:'invalid-float-payment',calls:[{contract_id:0n,method_name:'simple_transfer',inputs:[42n,1.25]}]}));
  assert.equal(runs,1,'fractional money must reject before the proof worker');
 }finally{await rm(base,{recursive:true,force:true});}
});
