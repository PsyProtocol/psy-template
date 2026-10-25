import {ReadUnavailable} from './readRetry.mjs';
import {readTogether} from './readConcurrency.mjs';

// Re-read the entire head set after exhausted transport retries. Never keep a
// successful sibling from the failed set, and never retry a transaction here.
export async function checkpointHeads(realms,rpc,{onRecovery=()=>{}}={}){
 for(let attempt=0;attempt<2;attempt++){
  try{return await readTogether(realms.map(r=>rpc(r.rpc_url[0],'psy_get_latest_l2_block_state',{})));}
  catch(error){
   if(!(error instanceof ReadUnavailable)||attempt===1)throw error;
   try{await onRecovery({schema:1,event:'checkpoint-head-read-recovery',attempt:2,scope:'fresh complete read set only; no proof, signature or broadcast retry'});}catch{/* telemetry cannot change read semantics */}
  }
 }
}
