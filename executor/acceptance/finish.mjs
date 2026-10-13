// Resume only the two wallet steps after the already included AMM refund.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {walletClient} from './walletClient.mjs';
import {captureBalances} from './balances.mjs';
import {scanAmm} from '../../amm/chainReader.mjs';
import {scanOrderbook} from '../../orderbook/rpcReader.mjs';
import {ExecutionJournal} from '../journal.mjs';
import {receiptReader} from '../chainReceipts.mjs';
const directory=resolve(process.argv[2]),evidence=join(directory,'acceptance');
const json=async name=>JSON.parse(await readFile(join(evidence,name+'.json')));
const save=(name,data)=>writeFile(join(evidence,name+'.json'),JSON.stringify(data,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n',{flag:'wx',mode:0o600});
const stage=name=>console.log(JSON.stringify({stage:name,time:new Date().toISOString()}));
const a=JSON.parse(await readFile(join(directory,'amm.json'))),o=JSON.parse(await readFile(join(directory,'orderbook.json')));
const journal=config=>new ExecutionJournal({directory:config.runtimeDirectory,network:config.network,vaultId:config.vaultId,fingerprint:config.fingerprint});
let client;const ordinary=[];
try{
 const s=await scanAmm(a),request=await json('request-amm-refund-open'),alice=s.orders.find(x=>x.payerId===1882112);
 assert.equal(alice.kind,1n);assert.equal(alice.nonce,BigInt(request.args.inputs.at(-1)));
 assert.equal(alice.settledPsy,alice.sentPsy);assert.ok(alice.nonce>alice.consumedNonce);
 const records=await journal(a).records(),included=records.filter(x=>x.status==='included');assert.equal(included.length,5);
 const refund=records.find(x=>x.status==='broadcast-intent'&&x.task.kind==='refund');assert.ok(refund);
 const confirmed=included.find(x=>x.taskId===refund.taskId);assert.ok(confirmed);
 const change=confirmed.result.receipt.data.slot_updates.find(x=>x.contract_id===0&&x.slot_index===3+2*1882112);
 assert.equal(BigInt(change.new_value)-BigInt(change.old_value),1000n);
 for(const config of [a,o])assert.equal((await journal(config).unresolved()).length,0);
 for(const name of (await readdir(evidence)).filter(x=>x.startsWith('receipt-')))ordinary.push(JSON.parse(await readFile(join(evidence,name))));
 assert.equal(ordinary.length,29);
 await save('refund-observation-correction',{time:new Date().toISOString(),reason:'AMM refund advances settled payment watermark; swap consumedNonce remains unchanged until a later request. The original included refund is retained.',checkpoint:confirmed.result.checkpoint,taskId:refund.taskId});
 await save('settled-amm-refund',s);
 client=await walletClient(a.rpcConfig);const reader=await receiptReader(a.rpcConfig);
 async function wallet(id,tool,args){
  await save('request-'+id,{user:1882112,tool,args});stage(id);
  const data=await client.call(1882112,'baed5675cf9ab3d1',tool,args);await save('wallet-'+id,data);
  const leaf=data.endUserLeafHash;assert.match(leaf??'',/^[0-9a-f]{64}$/);
  const start=Date.now();
  while(Date.now()-start<900000){
   const r=await reader({userId:1882112,endUserLeafHash:leaf});
   if(r.status==='included'){await save('receipt-'+id,r);ordinary.push(r);client.confirmed();stage(id+' included');return;}
   await new Promise(resolve=>setTimeout(resolve,5000));
  }
  throw Error('wallet receipt unresolved: '+id);
 }
 await wallet('amm-refund-claim','claim_batch',{public_claims:[{sender_user_id:a.vaultId,token:'PSY'}]});
 await wallet('amm-refund-close','call_contract',{contract_id:a.contractId,method_name:'close_psy_swap',inputs:[]});
 const af=await scanAmm(a),of=await scanOrderbook(o);assert.ok([...af.orders,...of.orders].every(x=>x.kind===0n));assert.ok(af.orders.every(x=>x.ownedShares===0n));assert.equal(af.pool.totalShares,1000n);
 const before=await json('balances-before'),after=await captureBalances(a.rpcConfig);assert.equal(after.pending.length,0);await save('balances-after',after);
 const publicReceipts=[];for(const config of [a,o])publicReceipts.push(...(await journal(config).records()).filter(x=>x.status==='included').map(x=>x.result));
 assert.equal(ordinary.length,31);assert.equal(publicReceipts.length,7);
 const fees=[...ordinary,...publicReceipts].reduce((n,x)=>n+BigInt(x.receipt.data.result.fees_collected),0n);
 assert.equal(after.totals.pusdt,before.totals.pusdt);assert.equal(BigInt(after.totals.psy)+fees,BigInt(before.totals.psy));
 const crash=await json('controlled-service-crash');assert.ok(crash.taskId);
 await save('result',{status:'passed',ordinaryWalletTransactions:31,publicSettlements:7,fees:String(fees),crashTested:true,amm:af,orderbook:of});stage('acceptance completed');
}catch(error){await save('failure-finish',{message:error.message,time:new Date().toISOString()});console.error(error.message);process.exitCode=1;}
finally{if(client)await client.close();}
