// Shared by every state snapshot in this process, including concurrent vaults.
export const READ_RPC_LIMIT=4;
let active=0;const waiting=[];
export async function withReadSlot(read){
 await new Promise(resolve=>{if(active<READ_RPC_LIMIT){active++;resolve();}else waiting.push(resolve);});
 try{return await read();}
 finally{const next=waiting.shift();if(next)next();else active--;}
}

export async function readTogether(reads){
 const results=await Promise.allSettled(reads),failure=results.find(x=>x.status==='rejected');
 if(failure)throw failure.reason;return results.map(x=>x.value);
}

// A fixed number of row readers avoids queuing one promise per enrolled user.
// Preserve input order (which determines planner priority) and drain in-flight
// reads on error before rejecting the scan. A partial scan cannot reach a planner.
export async function mapReads(values,read,concurrency=4){
 if(!Number.isSafeInteger(concurrency)||concurrency<1)throw Error('invalid read concurrency');
 const results=new Array(values.length);let cursor=0,failed=false;
 const workers=Array.from({length:Math.min(concurrency,values.length)},async()=>{
  while(!failed&&cursor<values.length){
   const index=cursor++;
   try{results[index]=await read(values[index],index);}catch(error){failed=true;throw error;}
  }
 });
 const outcomes=await Promise.allSettled(workers),failure=outcomes.find(x=>x.status==='rejected');
 if(failure)throw failure.reason;return results;
}
