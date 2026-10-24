// Preserve exact prepared work across restarts. An unknown broadcast always
// wins over new planning; a valid old proof is not regenerated for a new window.
export async function selectCompositionAction(adapter,journal){
 const pending=await journal.unresolved();if(pending.length)return{status:'unresolved',tasks:pending.map(r=>r.taskId)};
 const rows=await journal.records(),closed=new Set(rows.filter(r=>['included','not-submitted'].includes(r.status)).map(r=>r.taskId));
 let scan;
 for(const r of [...rows].reverse())if(r.status==='planned'&&!closed.has(r.taskId)){
  const proof=rows.findLast(p=>p.taskId===r.taskId&&p.status==='proved')?.proof;
  if(proof&&await adapter.isCurrent(r.task)&&await adapter.validateProof(r.task,proof))return{status:'selected',task:r.task,reusedPreparedProof:true};
  if(adapter.renewFeePreparation){
   scan??=await adapter.scan();
   if(scan.action){const task=await adapter.renewFeePreparation(r.task,scan.action);if(task)return{status:'selected',task,checkpoint:scan.checkpoint,reusedPreparedProof:false,reusedPreparedFee:true};}
  }else if(!proof&&adapter.validateFeePreparation&&await adapter.validateFeePreparation(r.task))return{status:'selected',task:r.task,reusedPreparedProof:false,reusedPreparedFee:true};
 }
 scan??=await adapter.scan();if(!scan.action)return{status:'idle',...scan};
 return{status:'selected',task:await adapter.quote(scan.action),checkpoint:scan.checkpoint,reusedPreparedProof:false};
}
