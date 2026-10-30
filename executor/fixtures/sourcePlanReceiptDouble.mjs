// TEST ONLY: coordination receipt double. No native Merkle/proof verification.
import {readFile} from 'node:fs/promises';import {join} from 'node:path';
import {losslessJson,parseLosslessJson} from '../../amm/u124/client.mjs';
import {sha256} from '../requestBinding.mjs';
import {SOURCE_PLAN_RECEIPT_PREFIX} from '../sourcePlanReceipt.mjs';
export async function sourcePlanReceiptDouble(args,outputNames){
 const inputs={};for(const[name,index]of [['review',0],['snapshot',1],['draw',3],['policy',4],...(args[6]?[['acceptedSeal',6]]:[])])inputs[name]=sha256(await readFile(args[index]));
 const outputs={};for(const name of outputNames)outputs[name]=sha256(await readFile(join(args[5],name+'.json')));
 const plan=parseLosslessJson(await readFile(join(args[5],'plan.json'),'utf8'));
 return {stdout:SOURCE_PLAN_RECEIPT_PREFIX+losslessJson({schema:1,kind:'source-stream-plan-receipt-v1',profile:plan.profile,historyRoot:args[2],inputs,outputs,financialOperations:0,proofsGenerated:0,canSign:false,canBroadcast:false,finalityVerified:false,seedSecrecyAuthenticated:false,qualifiedRandomness:false})+'\n',stderr:''};
}
