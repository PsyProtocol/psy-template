import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {scanAmm} from '/Users/geir/Downloads/QED资料/litepaper/psy-template/amm/chainReader.mjs';
import {scanOrderbook} from '/Users/geir/Downloads/QED资料/litepaper/psy-template/orderbook/rpcReader.mjs';
import {ExecutionJournal} from '/Users/geir/Downloads/QED资料/litepaper/psy-template/executor/journal.mjs';
const d='/private/tmp/psy-pusdt-tests-20261005';
const amm=JSON.parse(readFileSync(d+'/executor-amm.json')),ob=JSON.parse(readFileSync(d+'/executor-orderbook.json'));
const A=1882112,B=1283072,C=861696,P=499200,O=591872,F=1000100000;
const policies={[A]:'baed5675cf9ab3d1',[B]:'094c8ccc9162869b',[C]:'13e22a773a1016ad'};
const save=(name,data)=>writeFileSync(d+'/'+name+'-'+Date.now()+'.json',JSON.stringify(data,(_k,v)=>typeof v==='bigint'?v.toString():v,2),{flag:'wx'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const stage=name=>console.log(JSON.stringify({stage:name,at:new Date().toISOString()}));
let child,pending,ready;
function connect(){return new Promise((resolve,reject)=>{
 child=spawn(process.execPath,[d+'/mcp-rounds.mjs'],{stdio:['pipe','pipe','pipe']});child.stderr.on('data',()=>{});
 child.on('exit',code=>{if(pending)pending.reject(Error('MCP bridge exited '+code));if(!ready)reject(Error('bridge setup failed'));});
 createInterface({input:child.stdout}).on('line',line=>{let x;try{x=JSON.parse(line);}catch{return;}console.log(line);
 if(x.ready){ready=true;resolve();return;}if(!pending||x.id!==pending.id)return;
 if(x.error||x.isError||x.status==='unresolved'){pending.reject(Error('MCP failure '+JSON.stringify(x)));pending=undefined;}
 else if(x.status==='included'){pending.resolve(x);pending=undefined;}
 else if(x.data){pending.submission=x;if(!x.data.endUserLeafHash){pending.reject(Error('expected endcap leaf'));pending=undefined;}}
 });
 });}
async function q(id,user,tool,args){assert.ok(!pending);save('request-'+id,{id,user,tool,args});return new Promise((resolve,reject)=>{pending={id,resolve,reject};child.stdin.write(JSON.stringify({id,user:String(user),policy:policies[user],tool,args})+'\n');});}
const call=(id,u,c,m,inputs=[])=>q(id,u,'call_contract',{contract_id:c,method_name:m,inputs});
const pay=(id,u,c,v,n)=>call(id,u,c,'simple_transfer',[v,n]);
const claim=(id,u,v,c)=>q(id,u,'claim_all',{sender_user_ids:[v],token:c===0?'PSY':'USDT'});
const close=(id,u,c,m)=>call(id,u,c,m,[]);
const payBoth=(id,u,v,psy,usd)=>q(id,u,'claim_batch',{transfers:[{to_user_id:v,amount:psy,token:'PSY'},{to_user_id:v,amount:usd,token:'USDT'}]});
const claimBoth=(id,u,v)=>q(id,u,'claim_batch',{public_claims:[{sender_user_id:v,token:'PSY'},{sender_user_id:v,token:'USDT'}]});
const scanner=o=>o.kind==='amm'?scanAmm(o):scanOrderbook(o);
async function wait(o,name,predicate){stage('wait '+name);const j=new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,vaultId:o.vaultId,fingerprint:o.fingerprint});const start=Date.now();while(Date.now()-start<30*60*1000){const s=await scanner(o);if(predicate(s)&&!(await j.unresolved()).length){save('state-'+name,s);stage('settled '+name);return s;}await sleep(10000);}throw Error('settlement wait exceeded: '+name);}
const deadline=async(o,expired=false)=>(await scanner(o)).checkpoint+(expired?10:1000);
const owner=(s,u)=>s.orders.find(x=>(x.payerId??x.sellerId)===u);
const settled=(u,n)=>s=>owner(s,u).consumedNonce===BigInt(n);
const refunded=(u,n)=>s=>{const o=owner(s,u);return o.nonce===BigInt(n)&&o.sentPsy===o.settledPsy&&o.sentUsdt===o.settledUsdt;};
async function swap(id,u,asset,amount,nonce,expired=false){const dl=await deadline(amm,expired);await call(id+'-open',u,1758,'open_swap',[P,asset,amount,expired?10000000:1,dl,nonce]);if(asset===0)await pay(id+'-pay',u,0,P,F+amount);else await payBoth(id+'-pay',u,P,F,amount);const s=await wait(amm,id,expired?refunded(u,nonce):settled(u,nonce));await claim(id+'-claim',u,P,expired?asset:asset===0?4:0);await close(id+'-close',u,1758,asset===0?'close_psy_swap':'close_usdt_swap');return s;}
async function obRefund(id,u,asset,amount,nonce){await call(id+'-open',u,64,'open_sell',[O,asset,amount,10000000,await deadline(ob,true),nonce]);if(asset===0)await pay(id+'-pay',u,0,O,F+amount);else await payBoth(id+'-pay',u,O,F,amount);await wait(ob,id,settled(u,nonce));await claim(id+'-claim',u,O,asset);await close(id+'-close',u,64,asset===0?'close_psy_order':'close_usdt_order');}
async function lpRefund(id,u,asset,nonce){await call(id+'-open',u,1758,'open_add',[P,10000,10000,10000000,await deadline(amm,true),nonce]);if(asset===0)await pay(id+'-psy',u,0,P,F+10000);else await payBoth(id+'-pay',u,P,F,10000);await wait(amm,id,refunded(u,nonce));await claim(id+'-claim',u,P,asset);await close(id+'-close',u,1758,'close_add');}
try{
 await connect();
 stage('existing Orderbook second round and AMM initialization');
 await wait(ob,'ob-r2',s=>settled(A,2)(s)&&settled(B,2)(s));
 await claim('bob-ob-r2-claim',B,O,4);await close('bob-ob-r2-close',B,64,'close_psy_order');
 await claim('alice-ob-r2-claim',A,O,0);await close('alice-ob-r2-close',A,64,'close_usdt_order');
 const initial=await wait(amm,'amm-init',settled(B,1));assert.deepEqual(initial.pool,{reservePsy:1000000n,reserveUsdt:1000000n,totalShares:1000000n});assert.equal(owner(initial,B).ownedShares,999000n);await close('bob-amm-init-close',B,1758,'close_add');
 await obRefund('charlie-ob-usdt-refund',C,4,200000,2);
 await obRefund('alice-ob-psy-refund',A,0,1000,3);
 stage('AMM second liquidity provider');
 await call('alice-amm-add-open',A,1758,'open_add',[P,500000,500000,500000,await deadline(amm),1]);await payBoth('alice-amm-add-pay',A,P,F+500000,500000);
 let s=await wait(amm,'alice-amm-add',settled(A,1));assert.deepEqual(s.pool,{reservePsy:1500000n,reserveUsdt:1500000n,totalShares:1500000n});assert.equal(owner(s,A).ownedShares,500000n);await close('alice-amm-add-close',A,1758,'close_add');
 await call('alice-amm-remove-open',A,1758,'open_remove',[P,500000,500000,500000,await deadline(amm),2]);await pay('alice-amm-remove-fee',A,0,P,F);s=await wait(amm,'alice-amm-remove',settled(A,2));assert.deepEqual(s.pool,{reservePsy:1000000n,reserveUsdt:1000000n,totalShares:1000000n});assert.equal(owner(s,A).ownedShares,0n);await claimBoth('alice-amm-remove-claim',A,P);await close('alice-amm-remove-close',A,1758,'close_remove');
 stage('AMM bidirectional swaps');
 s=await swap('charlie-amm-psy-swap',C,0,10000,1);assert.equal(s.pool.reserveUsdt,990129n);await swap('bob-amm-usdt-swap',B,4,9871,2);
 stage('AMM expired swaps and partial LP refunds');
 await swap('charlie-amm-psy-refund',C,0,1000,2,true);await swap('alice-amm-usdt-refund',A,4,10000,3,true);
 await lpRefund('charlie-amm-psy-lp-refund',C,0,3);await lpRefund('charlie-amm-usdt-lp-refund',C,4,4);
 stage('AMM funded LP removal cancellation');
 const before=await scanAmm(amm);await call('bob-amm-cancel-open',B,1758,'open_remove',[P,1000,10000000,10000000,await deadline(amm,true),3]);await pay('bob-amm-cancel-fee',B,0,P,F);s=await wait(amm,'bob-amm-cancel',settled(B,3));assert.deepEqual(s.pool,before.pool);assert.equal(owner(s,B).ownedShares,owner(before,B).ownedShares);await close('bob-amm-cancel-close',B,1758,'close_remove');
 stage('AMM final LP withdrawal');
 await call('bob-amm-final-open',B,1758,'open_remove',[P,999000,1,1,await deadline(amm),4]);await pay('bob-amm-final-fee',B,0,P,F);s=await wait(amm,'bob-amm-final-remove',settled(B,4));assert.equal(s.pool.totalShares,1000n);assert.ok(s.orders.every(o=>o.ownedShares===0n));await claimBoth('bob-amm-final-claim',B,P);await close('bob-amm-final-close',B,1758,'close_remove');
 const af=await wait(amm,'amm-all-closed',s=>s.orders.every(o=>o.kind===0n)),of=await wait(ob,'ob-all-closed',s=>s.orders.every(o=>o.kind===0n));assert.ok([...af.orders,...of.orders].every(o=>o.kind===0n));save('final-amm',af);save('final-orderbook',of);save('rounds-result',{status:'completed',at:new Date().toISOString()});stage('all rounds completed');
 await q('restore-alice',A,'get_balance',{token:'USDT'}).catch(()=>{});
}catch(e){save('rounds-failure',{error:e.stack,at:new Date().toISOString()});console.error(e.stack);process.exitCode=1;}
finally{if(child){child.stdin.end();await new Promise(r=>child.once('exit',r));}}
