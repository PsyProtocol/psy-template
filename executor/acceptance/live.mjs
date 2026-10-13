import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile as callback} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {walletClient} from './walletClient.mjs';
import {scanAmm} from '../../amm/chainReader.mjs';
import {scanOrderbook} from '../../orderbook/rpcReader.mjs';
import {quoteExactIn,quoteRemoveLiquidity} from '../../amm/referenceMath.mjs';
import {receiptReader} from '../chainReceipts.mjs';
import {ExecutionJournal} from '../journal.mjs';
import {captureBalances} from './balances.mjs';
const execFile=promisify(callback),stringify=x=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
const directory=resolve(process.argv[2]??'executor/operations/staging-2026-10-11');
const resume=process.argv[3]==='--resume-after-usdt-settlement';
if(process.argv[3]&&!resume)throw Error('unknown acceptance resume point');
const evidence=join(directory,'acceptance');await mkdir(evidence,{recursive:true,mode:0o700});
const a=JSON.parse(await readFile(join(directory,'amm.json'),'utf8')),o=JSON.parse(await readFile(join(directory,'orderbook.json'),'utf8'));
const A=1882112,B=1283072,C=861696,F=1000100000;
const policies={[A]:'baed5675cf9ab3d1',[B]:'094c8ccc9162869b',[C]:'13e22a773a1016ad'};
const owner=(s,u)=>s.orders.find(x=>(x.payerId??x.sellerId)===u),nonce=(s,u)=>Number(owner(s,u).nonce+1n);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const save=(name,data)=>writeFile(join(evidence,name+'.json'),stringify(data),{flag:'wx',mode:0o600});
const stage=name=>console.log(JSON.stringify({stage:name,time:new Date().toISOString()}));
const journal=options=>new ExecutionJournal({directory:options.runtimeDirectory,network:options.network,vaultId:options.vaultId,fingerprint:options.fingerprint});
let client;const receipts=[],monitorStop=new AbortController();
async function wallet(id,u,tool,args){
 await save('request-'+id,{user:u,tool,args});stage(id);
 const data=await client.call(u,policies[u],tool,args);await save('wallet-'+id,data);
 const leaf=data.endUserLeafHash??data.error?.match(/deterministic leaf ([0-9a-f]{64})/)?.[1];
 assert.match(leaf??'',/^[0-9a-f]{64}$/,'wallet mutation must record a deterministic leaf');
 const reader=await receiptReader(a.rpcConfig),started=Date.now();
 while(Date.now()-started<900000){
  const result=await reader({userId:u,endUserLeafHash:leaf});
  if(result.status==='included'){await save('receipt-'+id,result);receipts.push(result);client.confirmed();stage(id+' included');return result;}
  await sleep(5000);
 }
 throw Error('wallet receipt unresolved; mutations paused: '+id);
}
const call=(id,u,c,m,inputs=[])=>wallet(id,u,'call_contract',{contract_id:c,method_name:m,inputs});
const pay=(id,u,v,psy,usd=0)=>wallet(id,u,'claim_batch',{transfers:[{to_user_id:v,amount:psy,token:'PSY'},...(usd?[{to_user_id:v,amount:usd,token:'USDT'}]:[])]});
const claim=(id,u,v,tokens)=>wallet(id,u,'claim_batch',{public_claims:tokens.map(token=>({sender_user_id:v,token}))});
let crashTested=false;
async function monitorCrash(){
 const started=Date.now();
 while(!monitorStop.signal.aborted&&Date.now()-started<900000){
  const pending=await journal(a).unresolved();
  const attempt=pending.find(x=>x.task.submission.contract_calls[0]?.method_name==='swap'&&x.task.submission.contract_calls[0]?.inputs[0]===A);
  if(attempt){
   await execFile('/bin/launchctl',['kill','SIGKILL',`gui/${process.getuid()}/xyz.psy.executor.staging`]);
   crashTested=true;await save('controlled-service-crash',{taskId:attempt.taskId,time:new Date().toISOString()});stage('controlled crash after durable broadcast intent');return;
  }
  await sleep(500);
 }
 if(!monitorStop.signal.aborted)throw Error('no broadcast intent observed for controlled crash');
}
async function settlement(id,options,expected){
 const scan=options.kind==='amm'?scanAmm:scanOrderbook,started=Date.now();stage('wait service '+id);
 while(Date.now()-started<900000){
  const s=await scan(options);
  if(expected(s)&&!(await journal(options).unresolved()).length){await save('settled-'+id,s);stage('service settled '+id);return s;}
  const status=JSON.parse(await readFile(join(directory,'runtime/status.json'),'utf8')).vaults.find(x=>x.vaultId===options.vaultId);
  if(status.status==='halted')throw Error('service halted: '+status.lastError);
  await sleep(3000);
 }
 throw Error('service did not reconcile '+id);
}
const consumed=(u,n)=>s=>owner(s,u).consumedNonce===BigInt(n);
try{
 let s=await scanAmm(a),ob=await scanOrderbook(o);
 let initialBalances,n,psy,usd,quote,out;
 if(resume){
  const failure=JSON.parse(await readFile(join(evidence,'failure.json'),'utf8'));
  assert.equal(failure.message,'service halted: HTTP 500');
  assert.ok([...s.orders,...ob.orders].every(x=>x.kind===0n||(x.payerId===C&&x.kind===1n&&x.asset===4n)));
  assert.equal(owner(s,C).nonce,owner(s,C).consumedNonce);assert.equal(owner(s,B).ownedShares,1000000n);
  assert.equal((await journal(a).unresolved()).length,0);
  const records=await journal(a).records();assert.equal(records.filter(x=>x.status==='included').length,3);
  for(const name of (await readdir(evidence)).filter(x=>x.startsWith('receipt-')))receipts.push(JSON.parse(await readFile(join(evidence,name),'utf8')));
  assert.equal(receipts.length,9); // LP open/pay/close, PSY swap complete, USDT open/pay.
  initialBalances=JSON.parse(await readFile(join(evidence,'balances-before.json'),'utf8'));
  const request=JSON.parse(await readFile(join(evidence,'request-amm-usdt-open.json'),'utf8'));
  n=request.args.inputs.at(-1);assert.equal(owner(s,C).nonce,BigInt(n));
  const prior=JSON.parse(await readFile(join(evidence,'settled-amm-psy.json'),'utf8'));
  quote=quoteExactIn({reserveIn:BigInt(prior.pool.reserveUsdt),reserveOut:BigInt(prior.pool.reservePsy),amountIn:BigInt(request.args.inputs[2]),minAmountOut:1n});
  assert.equal(s.pool.reservePsy,quote.nextReserveOut);assert.equal(s.pool.reserveUsdt,quote.nextReserveIn);
  crashTested=Boolean(JSON.parse(await readFile(join(evidence,'controlled-service-crash.json'),'utf8')).taskId);
  await save('resumed-after-http500',{time:new Date().toISOString(),checkpoint:s.checkpoint,ordinaryReceipts:receipts.length});
  client=await walletClient(a.rpcConfig);
 }else{
 assert.ok([...s.orders,...ob.orders].every(x=>x.kind===0n),'all test intents must be closed before starting');
 assert.ok(s.orders.every(x=>x.ownedShares===0n));assert.equal(s.pool.totalShares,1000n);
 await save('baseline',{amm:s,orderbook:ob});
 initialBalances=await captureBalances(a.rpcConfig);assert.equal(initialBalances.pending.length,0);await save('balances-before',initialBalances);
 client=await walletClient(a.rpcConfig);
 stage('AMM liquidity and both swap directions');
 n=nonce(s,B);psy=Number(s.pool.reservePsy*1000n);usd=Number(s.pool.reserveUsdt*1000n);
 await call('amm-add-open',B,a.contractId,'open_add',[a.vaultId,psy,usd,1000000,s.checkpoint+1000,n]);
 await pay('amm-add-pay',B,a.vaultId,F+psy,usd);
 s=await settlement('amm-add',a,consumed(B,n));assert.equal(owner(s,B).ownedShares,1000000n);
 await call('amm-add-close',B,a.contractId,'close_add');
 s=await scanAmm(a);n=nonce(s,A);
 quote=quoteExactIn({reserveIn:s.pool.reservePsy,reserveOut:s.pool.reserveUsdt,amountIn:10000n,minAmountOut:1n});out=Number(quote.amountOut);
 await call('amm-psy-open',A,a.contractId,'open_swap',[a.vaultId,0,10000,out,s.checkpoint+1000,n]);
 const crashMonitor=monitorCrash().then(()=>null,error=>error);
 await pay('amm-psy-pay',A,a.vaultId,F+10000);
 const crashError=await crashMonitor;if(crashError)throw crashError;
 s=await settlement('amm-psy',a,consumed(A,n));assert.equal(s.pool.reserveUsdt,quote.nextReserveOut);assert.equal(s.pool.reservePsy,quote.nextReserveIn);
 await claim('amm-psy-claim',A,a.vaultId,['USDT']);await call('amm-psy-close',A,a.contractId,'close_psy_swap');
 s=await scanAmm(a);n=nonce(s,C);quote=quoteExactIn({reserveIn:s.pool.reserveUsdt,reserveOut:s.pool.reservePsy,amountIn:BigInt(out),minAmountOut:1n});
 await call('amm-usdt-open',C,a.contractId,'open_swap',[a.vaultId,4,out,Number(quote.amountOut),s.checkpoint+1000,n]);await pay('amm-usdt-pay',C,a.vaultId,F,out);
 }
 s=await settlement('amm-usdt',a,consumed(C,n));assert.equal(s.pool.reservePsy,quote.nextReserveOut);assert.equal(s.pool.reserveUsdt,quote.nextReserveIn);
 await claim('amm-usdt-claim',C,a.vaultId,['PSY']);await call('amm-usdt-close',C,a.contractId,'close_usdt_swap');
 s=await scanAmm(a);n=nonce(s,B);const shares=owner(s,B).ownedShares,remove=quoteRemoveLiquidity({...s.pool,shares});
 await call('amm-remove-open',B,a.contractId,'open_remove',[a.vaultId,Number(shares),Number(remove.amountPsy),Number(remove.amountUsdt),s.checkpoint+1000,n]);await pay('amm-remove-fee',B,a.vaultId,F);
 s=await settlement('amm-remove',a,consumed(B,n));assert.equal(owner(s,B).ownedShares,0n);assert.equal(s.pool.totalShares,1000n);
 await claim('amm-remove-claim',B,a.vaultId,['PSY','USDT']);await call('amm-remove-close',B,a.contractId,'close_remove');
 stage('Orderbook matching and expiry refunds');
 ob=await scanOrderbook(o);const na=nonce(ob,A),nb=nonce(ob,B),deadline=ob.checkpoint+1000;
 await call('ob-psy-open',A,o.contractId,'open_sell',[o.vaultId,0,1000,1000,deadline,na]);await pay('ob-psy-pay',A,o.vaultId,F+1000);
 await call('ob-usdt-open',B,o.contractId,'open_sell',[o.vaultId,4,1000,1000,deadline,nb]);await pay('ob-usdt-pay',B,o.vaultId,F,1000);
 await settlement('ob-match',o,s=>consumed(A,na)(s)&&consumed(B,nb)(s));
 await claim('ob-psy-claim',A,o.vaultId,['USDT']);await claim('ob-usdt-claim',B,o.vaultId,['PSY']);await call('ob-psy-close',A,o.contractId,'close_psy_order');await call('ob-usdt-close',B,o.contractId,'close_usdt_order');
 ob=await scanOrderbook(o);n=nonce(ob,C);
 await call('ob-refund-open',C,o.contractId,'open_sell',[o.vaultId,4,1000,10000000,ob.checkpoint+45,n]);await pay('ob-refund-pay',C,o.vaultId,F,1000);
 await settlement('ob-refund',o,consumed(C,n));await claim('ob-refund-claim',C,o.vaultId,['USDT']);await call('ob-refund-close',C,o.contractId,'close_usdt_order');
 s=await scanAmm(a);n=nonce(s,A);
 await call('amm-refund-open',A,a.contractId,'open_swap',[a.vaultId,0,1000,10000000,s.checkpoint+45,n]);await pay('amm-refund-pay',A,a.vaultId,F+1000);
 await settlement('amm-refund',a,s=>owner(s,A).settledPsy===owner(s,A).sentPsy);await claim('amm-refund-claim',A,a.vaultId,['PSY']);await call('amm-refund-close',A,a.contractId,'close_psy_swap');
 const af=await scanAmm(a),of=await scanOrderbook(o);assert.ok([...af.orders,...of.orders].every(x=>x.kind===0n));assert.ok(af.orders.every(x=>x.ownedShares===0n));
 assert.ok(crashTested,'controlled restart must have been exercised');
 const finalBalances=await captureBalances(a.rpcConfig);assert.equal(finalBalances.pending.length,0);await save('balances-after',finalBalances);
 const publicReceipts=[];
 for(const options of [a,o])publicReceipts.push(...(await journal(options).records()).filter(x=>x.status==='included').map(x=>x.result));
 const fees=[...receipts,...publicReceipts].reduce((n,x)=>n+BigInt(x.receipt.data.result.fees_collected),0n);
 assert.equal(finalBalances.totals.pusdt,initialBalances.totals.pusdt);
 assert.equal(BigInt(finalBalances.totals.psy)+fees,BigInt(initialBalances.totals.psy));
 assert.equal(publicReceipts.length,7);
 await save('result',{status:'passed',ordinaryWalletTransactions:receipts.length,publicSettlements:publicReceipts.length,fees:String(fees),crashTested,amm:af,orderbook:of});stage('acceptance completed');
}catch(error){await save(resume?'failure-resume':'failure',{message:error.message,time:new Date().toISOString()});console.error(error.message);process.exitCode=1;}
finally{monitorStop.abort();if(client)await client.close();}
