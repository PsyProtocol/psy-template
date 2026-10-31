// Review preserved actual compiler outputs without compiling them again.
import test from'node:test';import assert from'node:assert/strict';
import{readFileSync,writeFileSync,mkdirSync,existsSync,cpSync}from'node:fs';import{join,dirname}from'node:path';
import{validateSuiteArtifacts,bindMarketSuite}from'./build.mjs';
const build=process.env.MARKET_SUITE_REVIEW_BUILD,out=process.env.MARKET_SUITE_REVIEW_OUT;
assert.ok(build&&out,'explicit preserved build and fresh review output required');mkdirSync(out);
const read=p=>JSON.parse(readFileSync(p,'utf8')),paths=Object.fromEntries(['native','tokenA','tokenB','nft'].map(role=>[role,join(build,'dependencies',role+'.json')]));
test('preserved candidate dependencies satisfy actual function/ABI binding, and all four IDs rebind without recompile',()=>{
 validateSuiteArtifacts(paths);const ids={amm:4000,bondingcurve:4001,orderbook:4002,nftmarket:4003};const result=bindMarketSuite({build,marketIds:ids,out:join(out,'bound-v1')});assert.deepEqual(result.marketIds,ids);assert.equal(result.fullUpsVerified,false);assert.equal(result.liveAuthorization,false);
 for(const market of Object.keys(ids)){const policy=read(join(out,'bound-v1',market,'stream-policy.json'));assert.equal(policy.base.market_id,ids[market]);for(const value of Object.values(policy.stream))assert.equal(value.contract_id,ids[market]);}
});
test('matching ABI shapes do not hide a changed actual FT or NFT function identity',()=>{
 for(const[role,name]of[['tokenA','transfer'],['tokenB','claim'],['nft','acknowledge']]){const bad=read(paths[role]);bad.circuit_definitions.find(m=>m.name===name).method_id+=1;const file=join(out,role+'-identity.json');writeFileSync(file,JSON.stringify(bad),{flag:'wx'});assert.throws(()=>validateSuiteArtifacts({...paths,[role]:file}),/actual dependency function\/ABI identity/);}
});
test('distinct FT selector identities are rejected even when each ABI matches its own bytecode',()=>{
 const bad=read(paths.tokenB),name='transfer';bad.abi.contract.methods.find(m=>m.name===name).method_id+=1;bad.circuit_definitions.find(m=>m.name===name).method_id+=1;const file=join(out,'different-ft-selector.json');writeFileSync(file,JSON.stringify(bad),{flag:'wx'});assert.throws(()=>validateSuiteArtifacts({...paths,tokenB:file}),/shared FT method identity/);
});
test('late binding rejects a profile-label substitution before creating output',()=>{
 // Use a fresh BUILD manifest reference only; the preserved artifacts stay intact.
 const manifest=read(join(build,'BUILD.json'));manifest.markets.amm.profile='source-covered-producer-random-stream-v1';
 // Relative artifact paths must remain within the review directory. Copies are
 // explicit public data and do not change the original fixture or request.
 const copy=join(out,'profile-substitution');mkdirSync(copy);
 for(const path of Object.keys(manifest.files)){const target=join(copy,path);mkdirSync(dirname(target),{recursive:true});cpSync(join(build,path),target);}
 writeFileSync(join(copy,'BUILD.json'),JSON.stringify(manifest),{flag:'wx'});const target=join(out,'invalid-bound');assert.throws(()=>bindMarketSuite({build:copy,marketIds:{amm:4000,bondingcurve:4001,orderbook:4002,nftmarket:4003},out:target}),/exact profile/);assert.equal(existsSync(target),false);
});
test('wrong client/backend/domain declarations reject before any artifact or bound output is adopted',()=>{
 for(const[name,field,value]of[['client','clientCommit','0'.repeat(40)],['backend','backendCommit','0'.repeat(40)],['network','networkMagic','1'],['chain','chainRootAt1','0'.repeat(64)]]){
  const manifest=read(join(build,'BUILD.json'));manifest[field]=value;const copy=join(out,'invalid-'+name);mkdirSync(copy);writeFileSync(join(copy,'BUILD.json'),JSON.stringify(manifest),{flag:'wx'});
  const target=join(out,'invalid-bound-'+name);assert.throws(()=>bindMarketSuite({build:copy,marketIds:{amm:4000,bondingcurve:4001,orderbook:4002,nftmarket:4003},out:target}),e=>e.code==='ERR_ASSERTION');assert.equal(existsSync(target),false);
 }
});
