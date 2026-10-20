import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {makeBatchPolicy,witness,signingRequest,operationCalls,validateFields} from './policy.mjs';
import {planSettlement,operation,timeCompare,bookCompare} from './planner.mjs';
import {bindRequest} from '../../executor/requestBinding.mjs';import {losslessJson,FEE_ESCROW as F} from '../../amm/u124/client.mjs';
const root=process.env.BATCH_BUILD;if(!root)throw Error('BATCH_BUILD must reference freshly compiled four-market artifacts');
const read=async p=>JSON.parse(await readFile(`${root}/${p}`));
const token=(await read('token/compilation_artifact.json')).abi,nft=(await read('nft/compilation_artifact.json')).abi;
const row=(owner,more={})=>({owner:BigInt(owner),kind:1n,nonce:1n,order_checkpoint:100n,done:0n,deadline:200n,cancelled:0n,side:0n,x:1000000n,y:1n,z:1n,paid_a:1000000n,paid_b:0n,fee_delta:F,...more});
for(const market of['amm','orderbook','bondingcurve','nftmarket']){
 const artifact=await read(`${market}/compiled/compilation_artifact.json`),config=await read(`${market}/config.json`),policy=await read(`${market}/policy.json`);
 test(`${market}: frozen ABI, regenerated policy, every whole-stack request binding`,()=>{
  assert.deepEqual(policy,makeBatchPolicy(market,1000,config,artifact.abi,token,nft));assert.equal(artifact.state_tree_height,31);
  for(const op of policy.operations){const args=operation(policy,op.name,{payer:200n,peer:201n,x:(1n<<80n)+17n,y:23n,z:31n,lots:1n,nonce:2n,peerNonce:3n});const fields=witness({mode:op.maintenance?4:2,batch:op.maintenance?0n:1n,root:op.maintenance?[0n,0n,0n,0n]:[1n<<63n,2n,3n,4n],operations:[args],burn:0n});
   const request=signingRequest(policy,fields),text=losslessJson(request),kind=op.maintenance?'batch_maintenance':'batch_settle';assert.equal(request.contract_calls.length,39);assert.equal(bindRequest(text,policy,kind).branch,kind);
   for(const i of[0,1,9,18,27,37,38]){const bad=structuredClone(request);bad.contract_calls[i].contract_id+=1n;assert.throws(()=>bindRequest(losslessJson(bad),policy),/full registered policy/);}
   const unused=[...fields];unused[20]=1n;if(market!=='orderbook'||op.maintenance)assert.throws(()=>signingRequest(policy,unused),/unused batch header/);
  }
  assert.ok(!artifact.abi.contract.state.some(f=>f.name==='batch_index'),'bounded membership lookup');
 });
 test(`${market}: commit and expiry bind canonical modes and padding`,()=>{
  for(const mode of[1,3]){const fields=witness({mode,batch:1n,...(mode===1?{users:[200n,201n],nonces:[2n,1n],expiry:120n,sponsor:300n}:{}),burn:0n});const r=signingRequest(policy,fields);assert.equal(bindRequest(losslessJson(r),policy,mode===1?'batch_commit':'batch_expire').request.contract_calls.length,39);const bad=structuredClone(r);bad.contract_calls.push(bad.contract_calls[0]);assert.throws(()=>bindRequest(losslessJson(bad),policy));}
 });
 if(market==='amm')test('AMM planner uses the second progressive reserve and refunds partial funding',()=>{
  const rows=[row(201),row(200)],pool={reserve_a:1000000000n,reserve_b:1000000000n,total_shares:1000000000n},p=planSettlement({market,config,policy,rows,pool,cutoff:100n});assert.equal(p.operations[0][1],200n);assert.equal(p.operations[1][1],201n);assert.ok(p.operations[0][5]>p.operations[1][5]);assert.equal(p.state.reserve_a,pool.reserve_a+2000000n);
  const q=planSettlement({market,config,policy,rows:[row(200,{paid_a:17n,paid_b:23n,fee_delta:0n})],pool,cutoff:100n});assert.equal(q.operations[0][0],BigInt(policy.operations.find(o=>o.name==='refund_funding_3').branch));
 });
 if(market==='orderbook')test('Book planner ranks integer prices and carries unmatched orders',()=>{const rows=[row(200,{x:10n,y:10n,paid_a:10n}),row(201,{x:10n,y:20n,paid_a:10n}),row(202,{side:1n,x:20n,y:10n,paid_a:0n,paid_b:20n}),row(203,{side:1n,x:10n,y:10n,paid_a:0n,paid_b:10n})];const p=planSettlement({market,config,policy,rows,pool:{},cutoff:100n});assert.equal(p.operations.length,1);assert.equal(p.operations[0][1],200n);assert.equal(p.operations[0][2],202n);assert.deepEqual(p.rank,[0n,1n,2n,3n]);assert.equal(bookCompare(rows[2],rows[3]),-1);});
 if(market==='bondingcurve')test('Curve limit orders use successive sold lots and quote change',()=>{const unit=BigInt(config.unit),max=2n*unit;const rows=[row(200,{lots:1n,x:max,paid_a:0n,paid_b:max,limit_mode:1n}),row(201,{lots:1n,x:max,paid_a:0n,paid_b:max,limit_mode:1n})],p=planSettlement({market,config,policy,rows,pool:{phase:1n,sold_lots:0n,quote_reserve:0n},cutoff:100n});assert.equal(p.state.sold_lots,2n);assert.ok(p.operations[0][3]<p.operations[1][3]);assert.ok(p.operations[0][7]>p.operations[1][7]);});
 if(market==='nftmarket')test('NFT planner selects one buyer and refunds the loser',()=>{const rows=[row(200,{kind:1n,price:1000000n,paid_a:0n,nft_sent:1n,nft_claimed:0n,nft_matches:1n}),row(201,{kind:2n,price:1000000n,seller:200n,listing_nonce:1n,nft_sent:0n,nft_claimed:0n}),row(203,{kind:2n,price:1000000n,seller:200n,listing_nonce:1n,nft_sent:0n,nft_claimed:0n})],p=planSettlement({market,config,policy,rows,pool:{},cutoff:100n});assert.equal(p.operations.length,2);assert.equal(p.operations[0][2],201n);assert.equal(p.operations[1][1],203n);});
}
