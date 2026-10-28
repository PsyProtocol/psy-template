import assert from 'node:assert/strict';
import {processorCalls} from '../batching/checkpoint-processor/policy.mjs';
import {requireQualifiedRandomSource} from '../batching/random-order/sourceGate.mjs';
export function checkpointProcessorPlan(policy,fields){
 const logical=processorCalls(policy,fields),calls=logical.filter(c=>c.contract_id!==BigInt(policy.noop.contract_id)||c.method_id!==BigInt(policy.noop.method_id));
 assert.equal(logical.length,40);
 return {schema:1,profile:policy.source_model,scope:'candidate preparation only; actual checkpoint data must be proven by the owned CFC',logicalSlots:40,calls,
  sourceQualified:false,sealBeforeReleaseAuthenticated:false,finalityVerified:false,canSign:false,canBroadcast:false,
  stages:fields[0]===2n?['fixed checkpoint seed and order','ascending user claims','ranked market settlement and payments','user fee claims','fee conservation and completion','fixed processor reward','exact native burn']:['existing bounded maintenance or commitment']};
}
export function authorizeCheckpointProcessor(){requireQualifiedRandomSource();}
