// Client-supplied ordinary funding and explicitly non-authorizing resource
// construction can overlap. Neither outcome implies the other was rolled back.
export async function overlapFundingAndWarmup(fund,warm) {
 if(typeof fund!=='function'||typeof warm!=='function')throw Error('funding and guarded resource warmup required');
 const tasks=[fund,warm].map(async fn=>{const startedAt=new Date().toISOString(),start=performance.now();try{return{value:await fn(),startedAt,finishedAt:new Date().toISOString(),wallMilliseconds:performance.now()-start};}catch(error){throw Object.assign(Error(error.message,{cause:error}),{startedAt,finishedAt:new Date().toISOString(),wallMilliseconds:performance.now()-start});}});
 const results=await Promise.allSettled(tasks);
 if(results.some(r=>r.status==='rejected'))throw Object.assign(new AggregateError(results.filter(r=>r.status==='rejected').map(r=>r.reason),'funding/resource preparation stopped; reconcile the original funding, never retry automatically'),{outcomes:results.map(r=>({status:r.status,startedAt:(r.value??r.reason).startedAt,finishedAt:(r.value??r.reason).finishedAt,wallMilliseconds:(r.value??r.reason).wallMilliseconds}))});
 return{funding:results[0].value,warmup:results[1].value};
}
