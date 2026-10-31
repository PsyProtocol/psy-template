import test from 'node:test';import assert from 'node:assert/strict';
import {pendingContractMetadata,ContractMetadataNotReady} from './contractMetadataRead.mjs';
import {retryRead,ReadUnavailable} from './readRetry.mjs';
const method='psy_get_user_contract_state_tree_leaf_hash',params={checkpoint_id:25379,user_id:223232,contract_id:8,leaf_id:0};
const error={code:-32001,message:'contract 8 state tree height metadata is not available in Realm DB yet'};
test('only an exact read/contract/checkpoint-scoped missing metadata error is retryable',()=>{
 assert.ok(pendingContractMetadata(method,params,error)instanceof ContractMetadataNotReady);
 assert.ok(pendingContractMetadata(method,params,{...error,code:-32001n})instanceof ContractMetadataNotReady);
 for(const[m,p,e]of [['psy_submit_user_end_cap',params,error],[method,{...params,contract_id:9},error],[method,{...params,checkpoint_id:0},error],[method,{...params,contract_id:0},{...error,message:'contract 0 state tree height metadata is not available in Realm DB yet'}],[method,params,{...error,code:403}],[method,params,{...error,message:error.message+'; accept zero'}],[method,params,{code:-32001,message:'invalid state proof'}]])assert.equal(pendingContractMetadata(m,p,e),null);
});
test('metadata retries preserve the exact read and never invent a zero state; exhaustion stays unavailable',async()=>{
 let calls=0;const operation=async()=>{if(++calls<3)throw pendingContractMetadata(method,params,error);return 'observed-state';};
 assert.equal(await retryRead(operation,{delayMs:0}),'observed-state');assert.equal(calls,3);
 calls=0;await assert.rejects(retryRead(async()=>{calls++;throw pendingContractMetadata(method,params,error);},{delayMs:0}),e=>e instanceof ReadUnavailable&&e.cause instanceof ContractMetadataNotReady);assert.equal(calls,3);
});
