import{readFileSync,readdirSync,writeFileSync}from'node:fs';
import{receiptReader}from'/Users/geir/Downloads/QED资料/litepaper/psy-template/executor/chainReceipts.mjs';
const dir='/private/tmp/psy-launchamm-staging-20261005',reader=await receiptReader(dir+'/l2-local-prover-config.json'),subs=[];
for(const name of readdirSync(dir)){
 if(/^mcp-.*\.json$/.test(name)){
  const v=JSON.parse(readFileSync(dir+'/'+name)),leaf=v.data?.endUserLeafHash??v.data?.error?.match(/deterministic leaf ([0-9a-f]{64})/)?.[1];
  const userId=name.startsWith('mcp-charlie-')?861696:name.startsWith('mcp-alice-')?1882112:name.startsWith('mcp-bob-')?1283072:null;
  if(leaf&&userId)subs.push({source:name,userId,endUserLeafHash:leaf});
 }
 if(/-submit\.log$/.test(name)){
  const text=readFileSync(dir+'/'+name,'utf8'),m=text.match(/submitted (curve vault|launch pool vault) transaction ([0-9a-f]{64})/);
  if(m)subs.push({source:name,userId:m[1]==='curve vault'?1297920:773632,endUserLeafHash:m[2]});
 }
}
for(const scope of readdirSync(dir+'/executor-runtime')){
 for(const name of readdirSync(dir+'/executor-runtime/'+scope)){
  if(!name.endsWith('-broadcast-result.json'))continue;
  const v=JSON.parse(readFileSync(dir+'/executor-runtime/'+scope+'/'+name));
  if(v.outcome?.endUserLeafHash)subs.push({source:'executor-runtime/'+scope+'/'+name,userId:v.scope.vaultId,endUserLeafHash:v.outcome.endUserLeafHash});
 }
}
const unique=new Map(subs.map(x=>[x.userId+':'+x.endUserLeafHash,x]));
const previouslyVerified=new Map();
for(const name of readdirSync(dir).filter(x=>/^receipts-\d+\.json$/.test(x))){
 for(const item of JSON.parse(readFileSync(dir+'/'+name)).matched??[]){
  if(item.status==='included'&&item.receipt?.data?.status==='included'&&item.receipt.data.content_hash===item.contentHash&&item.receipt.data.owner_user_id===item.userId)
   previouslyVerified.set(item.userId+':'+item.endUserLeafHash,{...item,reusedVerificationFrom:name});
 }
}
const matched=[],unmatched=[];
for(const sub of unique.values()){const result=previouslyVerified.get(sub.userId+':'+sub.endUserLeafHash)??await reader(sub);(result.status==='included'?matched:unmatched).push({...sub,...result});}
const file=dir+'/receipts-'+Date.now()+'.json';writeFileSync(file,JSON.stringify({matched,unmatched},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({saved:file,matched:matched.length,unmatched}));
