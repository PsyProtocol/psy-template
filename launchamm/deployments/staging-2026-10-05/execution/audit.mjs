import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {publicState} from '/Users/geir/Downloads/QED资料/litepaper/psy-template/executor/publicState.mjs';
import {decodeFeltSlot} from '/Users/geir/Downloads/QED资料/litepaper/psy-template/orderbook/matcherCore.mjs';
const dir='/private/tmp/psy-launchamm-staging-20261005';
const initial=JSON.parse(readFileSync('/Users/geir/Downloads/QED资料/litepaper/psy-template/launchamm/deployments/staging-2026-10-05/initial-snapshot.json'));
const s=await publicState(dir+'/l2-local-prover-config.json');
const users=[1882112,1283072,861696,1297920,773632,591872],assets=[0,1494];
async function limited(items,fn){let cursor=0;const out=[];await Promise.all(Array.from({length:4},async()=>{while(cursor<items.length){const i=cursor++;out[i]=await fn(items[i]);}}));return out;}
async function snapshot(checkpoint){
 const cache=new Map();
 async function slot(userId,contractId,offset){const leafId=Math.floor(offset/4),key=[userId,contractId,leafId].join(':');if(!cache.has(key)){
  const realm=s.network.realm_configs.find(x=>x.id===Math.floor(userId/s.network.users_per_realm));
  cache.set(key,s.rpc(realm.rpc_url[0],'psy_get_user_contract_state_tree_leaf_hash',{checkpoint_id:checkpoint,user_id:userId,contract_id:contractId,leaf_id:leafId}));
 }return decodeFeltSlot(await cache.get(key),offset);}
 const balances=await limited(users.flatMap(userId=>assets.map(asset=>({userId,asset}))),async x=>({...x,balance:await slot(x.userId,x.asset,0)}));
 const transfers=await limited(users.flatMap(from=>users.filter(to=>to!==from).flatMap(to=>assets.map(asset=>({from,to,asset})))),async x=>{
  const sent=await slot(x.from,x.asset,3+x.to*2),claimed=await slot(x.to,x.asset,4+x.from*2);
  if(claimed>sent)throw Error('invalid claim cursor');return {...x,sent,claimed,pending:sent-claimed};
 });
 const totals=Object.fromEntries(assets.map(asset=>[asset,balances.filter(x=>x.asset===asset).reduce((n,x)=>n+x.balance,0n)+transfers.filter(x=>x.asset===asset).reduce((n,x)=>n+x.pending,0n)]));
 return {checkpoint,balances,pending:transfers.filter(x=>x.pending>0n),totals};
}
const before=await snapshot(initial.checkpoint),after=await snapshot(s.checkpoint);
const receiptFile=readdirSync(dir).filter(x=>/^receipts-\d+\.json$/.test(x)).sort((a,b)=>Number(b.match(/\d+/)[0])-Number(a.match(/\d+/)[0]))[0];
if(!receiptFile)throw Error('collect receipts first');const receipts=JSON.parse(readFileSync(dir+'/'+receiptFile));
const relevant=receipts.matched.filter(x=>x.checkpoint>before.checkpoint&&x.checkpoint<=after.checkpoint);
const fees=relevant.reduce((n,x)=>n+BigInt(x.receipt.data.result?.fees_collected??0),0n);
const abi=JSON.parse(readFileSync(dir+'/pool-v2-candidate/abi.json'));
const pool=await s.fields(773632,1503,abi,['phase','reserve_psy','reserve_token','total_shares','psy_unit','token_unit','source_curve','source_vault']);
const shareOffset=abi.contract.state.find(x=>x.name==='shares').offset;
const shares=await limited(users,async userId=>({userId,shares:await s.slot(773632,1503,shareOffset+userId)}));
const orders=await limited(users.slice(0,3),async userId=>({userId,pool:await s.fields(userId,1503,abi,['order_kind','order_nonce']),curve:await s.fields(userId,66,abi,['order_kind','order_nonce'])}));
const obAbi=JSON.parse(readFileSync('/Users/geir/Downloads/QED资料/litepaper/psy-template/orderbook/contract/target/abi.json'));
const obOrder=await s.fields(861696,64,obAbi,['order_kind','order_nonce']);
const checks={nativeConservation:before.totals[0]===after.totals[0]+fees,launchTokenConservation:before.totals[1494]===after.totals[1494]&&after.totals[1494]===6000000000n,
 noPendingTransfers:after.pending.length===0,lpSharesConservation:shares.reduce((n,x)=>n+x.shares,0n)+1000n===pool.total_shares,
 allPoolOrdersClosed:orders.every(x=>x.pool.order_kind===0n),allCurveOrdersClosed:orders.every(x=>x.curve.order_kind===0n),orderbookOrderClosed:obOrder.order_kind===0n,
 allRecordedSubmissionsIncluded:receipts.unmatched.length===0};
const result={at:new Date().toISOString(),before,after,receiptFile,relevantReceiptCount:relevant.length,fees,pool,shares,orders,obOrder,checks};
const file=dir+'/audit-'+Date.now()+'.json';writeFileSync(file,JSON.stringify(result,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({saved:file,checks,fees:fees.toString(),pool},(_k,v)=>typeof v==='bigint'?v.toString():v));
