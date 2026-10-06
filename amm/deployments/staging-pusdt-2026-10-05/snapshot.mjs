import{readFileSync,writeFileSync,existsSync}from'node:fs';
import{publicState}from'/Users/geir/Downloads/QED资料/litepaper/psy-template/executor/publicState.mjs';
const d='/private/tmp/psy-pusdt-tests-20261005',s=await publicState(d+'/l2-local-prover-config.json');const ids=[1882112,1283072,861696,591872];
if(existsSync(d+'/executor-amm.json'))ids.push(JSON.parse(readFileSync(d+'/executor-amm.json')).vaultId);
const out={time:new Date().toISOString(),checkpoint:s.checkpoint,users:{},pending:[],totals:{}};
for(const id of ids)out.users[id]={psy:String(await s.slot(id,0,0)),pusdt:String(await s.slot(id,4,0))};
for(const asset of[0,4]){let total=ids.reduce((sum,id)=>sum+BigInt(out.users[id][asset===0?'psy':'pusdt']),0n);
 for(const sender of ids)for(const recipient of ids){if(sender===recipient)continue;const sent=await s.slot(sender,asset,3+2*recipient),claimed=await s.slot(recipient,asset,4+2*sender);if(sent<claimed)throw Error('claim cursor ahead of Outbox');const pending=sent-claimed;if(pending){total+=pending;out.pending.push({sender,recipient,asset,amount:String(pending)});}}
 out.totals[asset===0?'psy':'pusdt']=String(total);
}
const path=d+'/snapshot-'+Date.now()+'.json';writeFileSync(path,JSON.stringify(out,null,2),{flag:'wx'});console.log(JSON.stringify({saved:path,data:out}));
