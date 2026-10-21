// A task can have several explicitly inspected no-send attempts. Historical
// rejection must not mask a later pending transmission or exact inclusion.
export function latestBroadcastOutcome(records,taskId){
 const start=records.findLastIndex(r=>r.taskId===taskId&&r.status==='broadcast-intent');
 if(start<0)return null;
 return records.slice(start+1).findLast(r=>r.taskId===taskId&&['included','not-submitted'].includes(r.status))??null;
}
