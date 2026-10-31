// Uses preserved compiler output only; no compilation, signer or network.
import test from'node:test';import assert from'node:assert/strict';
import{readFileSync,writeFileSync,mkdirSync,cpSync,existsSync}from'node:fs';import{join}from'node:path';
import{bindMarketSuite,validateSuiteArtifacts}from'./build.mjs';
const source=process.env.MARKET_SUITE_SAVED_BUILD,out=process.env.MARKET_SUITE_ADVERSARIAL_OUT;assert.ok(source&&out,'preserved build and fresh output required');mkdirSync(out);
const read=p=>JSON.parse(readFileSync(p,'utf8')),ids={amm:6000,bondingcurve:6001,orderbook:6002,nftmarket:6003};
test('omitting a required artifact hash cannot turn a partial manifest into verified binding',()=>{
 const copy=join(out,'missing-entry');cpSync(source,copy,{recursive:true,errorOnExist:true,force:false});const m=read(join(copy,'BUILD.json'));delete m.files['amm/compiled/compilation_artifact.json'];writeFileSync(join(copy,'BUILD.json'),JSON.stringify(m));const target=join(out,'missing-entry-bound');assert.throws(()=>bindMarketSuite({build:copy,marketIds:ids,out:target}));assert.equal(existsSync(target),false);
});
test('an ambiguous duplicate actual dependency selector is rejected despite a matching ABI entry',()=>{
 const paths=Object.fromEntries(['native','tokenA','tokenB','nft'].map(k=>[k,join(source,'dependencies',k+'.json')])),bad=read(paths.tokenA);bad.circuit_definitions.push(structuredClone(bad.circuit_definitions.find(d=>d.name==='transfer')));const file=join(out,'duplicate-transfer.json');writeFileSync(file,JSON.stringify(bad),{flag:'wx'});assert.throws(()=>validateSuiteArtifacts({...paths,tokenA:file}));
});
