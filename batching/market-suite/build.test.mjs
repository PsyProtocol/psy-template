import test from'node:test';import assert from'node:assert/strict';
import{readFileSync,writeFileSync,existsSync,cpSync}from'node:fs';import{join}from'node:path';
import{compileMarketSuite,bindMarketSuite,MARKETS}from'./build.mjs';
import{auditStreamArtifact}from'../checkpoint-stream/pair-artifact.mjs';
import{makePairOptimizedPolicy}from'../checkpoint-stream/pair-optimized-build-policy.mjs';
const specPath=process.env.MARKET_SUITE_SPEC,root=process.env.MARKET_SUITE_TEST_OUT;
assert.ok(specPath&&root,'explicit frozen MARKET_SUITE_SPEC and fresh MARKET_SUITE_TEST_OUT required');
const read=p=>JSON.parse(readFileSync(p,'utf8')),spec=read(specPath),build=join(root,'suite-v1');
const ids={amm:2000,bondingcurve:2001,orderbook:2002,nftmarket:2003};
test('four actual stream bytecodes compile and all new policies bind unique reviewed identities without finance',()=>{
 const report=compileMarketSuite({spec,out:build});assert.deepEqual(Object.keys(report.markets),MARKETS);assert.equal(report.financialOperations,0);assert.equal(report.fullUpsVerified,false);assert.equal(report.liveAuthorization,false);
 const bound=bindMarketSuite({build,marketIds:ids,out:join(root,'bound-v1')});assert.equal(bound.marketAssignmentsVerified,false);assert.equal(bound.newKeysRegistered,false);
 for(const market of MARKETS){
  const candidate=report.markets[market],policy=read(join(root,'bound-v1',market,'stream-policy.json'));
  assert.ok(candidate.foreignReadCommandsChecked>0);assert.equal(candidate.marketId,null);assert.equal(policy.market_id,ids[market]);assert.equal(policy.base.market_id,ids[market]);assert.equal(policy.version,['amm','bondingcurve'].includes(market)?5:9);assert.equal(policy.qualified_randomness,false);assert.equal(policy.live_authorization,false);
  for(const descriptor of Object.values(policy.stream))assert.equal(descriptor.contract_id,ids[market]);
  const visit=v=>{if(!v||typeof v!=='object')return;if(Object.hasOwn(v,'contract_id'))assert.ok([0,spec.config.assetA,spec.config.assetB,spec.config.nftId,ids[market]].includes(v.contract_id),'unreviewed call identity');for(const child of Object.values(v))if(typeof child==='object')visit(child);};visit(policy);
  assert.equal(policy.stream.finish_stream_settlement.input_count,7);if(['orderbook','nftmarket'].includes(market)){assert.equal(policy.stream.bind_pair_rejection.input_count,9);assert.equal(policy.scan_capacity,4);assert.equal(policy.page_capacity,2);}else assert.equal(policy.stream.claim_stream_member.input_count,2);
 }
 assert.throws(()=>compileMarketSuite({spec,out:build}),/fresh/);
});
test('cross-market aliases, omitted assignments and asset substitutions reject before bound output',()=>{
 for(const[caseName,changed]of [['duplicate',{...ids,orderbook:ids.amm}],['asset-alias',{...ids,nftmarket:spec.config.assetA}],['collection-alias',{...ids,amm:spec.config.nftId}],['missing',{amm:2000,bondingcurve:2001,orderbook:2002}],['range',{...ids,nftmarket:16777216}]]){const out=join(root,caseName);assert.throws(()=>bindMarketSuite({build,marketIds:changed,out}));assert.equal(existsSync(out),false);}
});
test('wrong SDK/domain, changed compiler and unreviewed NFT payment fail before compilation/output',()=>{
 for(const[name,changed]of [['sdk',{...spec,sdkCommit:'0'.repeat(40)}],['domain',{...spec,networkMagic:'1'}],['compiler',{...spec,compilers:{...spec.compilers,pair:{...spec.compilers.pair,sha256:'0'.repeat(64)}}}],['payment',{...spec,config:{...spec.config,tokenId:999}}],['random',{...spec,randomMode:true}],['extra-artifact',{...spec,artifacts:{...spec.artifacts,'../../injected':spec.artifacts.tokenA}}]]){const out=join(root,'bad-'+name);assert.throws(()=>compileMarketSuite({spec:changed,out}));assert.equal(existsSync(out),false);}
});
test('source/bytecode/config changes cannot reuse a saved suite binding',()=>{
 for(const[caseName,path]of [['source','amm/main.psy.rs'],['config','config.json'],['artifact','orderbook/compiled/compilation_artifact.json']]){const copy=join(root,'tampered-'+caseName);cpSync(build,copy,{recursive:true,errorOnExist:true,force:false});writeFileSync(join(copy,path),readFileSync(join(copy,path),'utf8')+'\n');assert.throws(()=>bindMarketSuite({build:copy,marketIds:ids,out:join(root,'tampered-bound-'+caseName)}),/changed build input/);}
});
test('independent bytecode height audit rejects a changed foreign-read proof dimension',()=>{
 const a=read(join(build,'amm/compiled/compilation_artifact.json'));let changed=false;
 for(const d of a.circuit_definitions){const constants=new Map(d.definitions.filter(n=>n.data_type===0&&n.op_type===1).map(n=>[n.index,n]));for(const c of d.state_commands){if(!c.type.startsWith('GetOtherUserContractStateSlot')&&!c.type.startsWith('GetSelfUserExternalContractStateSlot'))continue;const id=constants.get(c.contract_id)?.inputs[0];if(id!==spec.config.assetA&&id!==spec.config.assetB)continue;constants.get(c.contract_state_tree_height).inputs[0]=30;changed=true;break;}if(changed)break;}
 assert.equal(changed,true);assert.throws(()=>auditStreamArtifact('amm',spec.config,a),/foreign state height/);
});
test('late pair identities change complete descriptors while preserving the compiled bytes',()=>{
 for(const market of['orderbook','nftmarket']){
  const a=read(join(build,market,'compiled/compilation_artifact.json')),token=read(spec.artifacts.tokenA),nft=read(spec.artifacts.nft),first=makePairOptimizedPolicy(market,1000,spec.config,a,token,nft),second=makePairOptimizedPolicy(market,2004,spec.config,a,token,nft);
  assert.equal(first.market_id,1000);assert.equal(second.market_id,2004);assert.ok(Object.values(second.stream).every(x=>x.contract_id===2004));assert.equal(second.base.noop.contract_id,2004);
  for(const op of second.base.operations)for(const c of op.calls)if(c.method_name?.startsWith('recover_funding_'))assert.equal(c.contract_id,2004);
  assert.throws(()=>makePairOptimizedPolicy(market,spec.config.tokenId,spec.config,a,token,nft),/distinct/);
 }
});

test('historical v9 fixture policy bytes are unchanged at their original ID, so old evidence is not regenerated',()=>{
 const root=process.env.MARKET_SUITE_PAIR_REFERENCE;assert.ok(root,'explicit preserved v9 reference fixture required');
 for(const market of['orderbook','nftmarket']){
  const c=read(join(root,market,'config.json')),a=read(join(root,market,'compiled/compilation_artifact.json')),token=read(join(root,'token/compilation_artifact.json')),nft=read(join(root,'nft/compilation_artifact.json'));
  const policy=makePairOptimizedPolicy(market,1000,c,a,token,nft);
  assert.equal(JSON.stringify(policy,null,2)+'\n',readFileSync(join(root,market,'stream-policy.json'),'utf8'));
  assert.equal(JSON.stringify(policy.base,null,2)+'\n',readFileSync(join(root,market,'policy.json'),'utf8'));
 }
});
