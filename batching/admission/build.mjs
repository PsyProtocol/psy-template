// Compile one market before its coordinator-assigned ID is known. Rebind only
// the policy after deployment; the contract source uses ctx.contract_id.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync,constants} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateConfig} from '../../amm/u124/build.mjs';
import {validateU124TokenAbi} from '../../executor/u124Abi.mjs';
import {validateNftAbi} from '../../nft-marketplace/abi.mjs';
import {generateAdmission} from './generate.mjs';
import{withBulkAdmission}from'./bulk.mjs';
import {makeAdmissionPolicy} from './prepare.mjs';
const kinds=['amm','orderbook','bondingcurve','nftmarket'];
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
export function compileAdmission({market,compiler,native,tokenA,tokenB,nft,config,out}){
 assert.ok(kinds.includes(market),'market kind');out=resolve(out);compiler=resolve(compiler);assert.ok(!existsSync(out),'fresh output required');
 const domain=spawnSync(compiler,['network-magic'],{encoding:'utf8'});assert.equal(domain.status,0,'compiler domain');assert.match(domain.stdout.trim(),/^\d+$/);assert.equal(config.networkMagic,domain.stdout.trim(),'explicit compiler/config domain');
 if(market==='nftmarket'){assert.ok(Number.isSafeInteger(config.nftId)&&config.nftId>=5&&config.nftId<16777216);assert.ok(Number.isSafeInteger(config.tokenId)&&config.tokenId>=5&&config.tokenId<16777216&&config.nftId!==config.tokenId);}
 else {validateConfig(config);assert.ok(!config.bootstrap,'automatic launch-AMM bootstrap unavailable');}
 const a=json(tokenA),b=json(tokenB),n=json(nft),ps=json(native);
 for(const t of[a,b]){validateU124TokenAbi(t.abi);assert.equal(t.state_tree_height,31);}
 validateNftAbi(n.abi,n.state_tree_height);assert.equal(ps.state_tree_height,32);
 for(const name of['claim','transfer'])assert.equal(a.abi.contract.methods.find(m=>m.name===name).method_id,b.abi.contract.methods.find(m=>m.name===name).method_id,'FT method identities');
 for(const[name,id,count]of[['simple_claim',2293029357,1],['simple_transfer',354447671,2],['simple_burn',2923993647,1]])assert.ok(ps.circuit_definitions.some(d=>d.name===name&&d.method_id===id&&d.circuit_inputs.length===count),'native method shape '+name);
 mkdirSync(out,{recursive:true});
 const source=resolve(out,'main.psy.rs');writeFileSync(source,generateAdmission(market,config),{flag:'wx'});
 for(const[name,path]of[['token-a',tokenA],['token-b',tokenB],['nft',nft],['native',native]])copyFileSync(path,resolve(out,name+'.json'),constants.COPYFILE_EXCL);
 save(resolve(out,'config.json'),config);
 const ids=market==='nftmarket'?[config.nftId,config.tokenId,1]:[config.assetA,config.assetB,0];
 const r=spawnSync(compiler,[source,resolve(out,'compiled'),...ids.map(String)],{encoding:'utf8',maxBuffer:8e6});writeFileSync(resolve(out,'compile.log'),(r.stdout??'')+(r.stderr??''),{flag:'wx'});assert.equal(r.status,0,'market compilation failed; original log preserved');
 const files=['main.psy.rs','config.json','token-a.json','token-b.json','nft.json','native.json','compiled/compilation_artifact.json'];
 const report={schema:1,market,networkMagic:config.networkMagic,compilerSha256:sha(compiler),files:Object.fromEntries(files.map(p=>[p,sha(resolve(out,p))])),marketId:null,sourceUsesRuntimeContractId:true,initialLayoutProofVerified:false,fullUpsVerified:false,runtimeDependenciesVerified:false,broadcast:false};
 save(resolve(out,'BUILD.json'),report);return report;
}
export function bindAdmission({build,marketId,out,admissionMode='single-v1'}){
 assert.ok(['single-v1','all-four-v1'].includes(admissionMode),'admission mode');build=resolve(build);out=resolve(out);assert.ok(!existsSync(out),'fresh policy output required');const report=json(resolve(build,'BUILD.json'));
 assert.equal(report.schema,1);assert.ok(kinds.includes(report.market));for(const[p,h]of Object.entries(report.files))assert.equal(sha(resolve(build,p)),h,'changed build input '+p);
 const config=json(resolve(build,'config.json')),assetIds=report.market==='nftmarket'?[config.nftId,config.tokenId]:[config.assetA,config.assetB];
 assert.ok(Number.isSafeInteger(marketId)&&marketId>=5&&marketId<16777216&&!assetIds.includes(marketId),'distinct actual market ID');
 const a=json(resolve(build,'compiled/compilation_artifact.json')),token=json(resolve(build,'token-a.json')),nft=json(resolve(build,'nft.json'));
 assert.equal(readFileSync(resolve(build,'main.psy.rs'),'utf8'),generateAdmission(report.market,config),'source/config binding');
 const basePolicy=makeAdmissionPolicy(report.market,marketId,config,a.abi,token.abi,nft.abi),policy=admissionMode==='all-four-v1'?withBulkAdmission(basePolicy):basePolicy;mkdirSync(out,{recursive:true});save(resolve(out,'policy.json'),policy);
 save(resolve(out,'BOUND.json'),{schema:1,market:report.market,marketId,...(admissionMode==='single-v1'?{}:{admissionMode}),buildManifestSha256:sha(resolve(build,'BUILD.json')),policySha256:sha(resolve(out,'policy.json')),registrationVerified:false,onChainRootsVerified:false,broadcast:false});return policy;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [mode,...args]=process.argv.slice(2),o={};assert.equal(args.length%2,0,'flag/value pairs');for(let i=0;i<args.length;i+=2){assert.ok(args[i].startsWith('--'));assert.ok(!Object.hasOwn(o,args[i].slice(2)),'duplicate option');o[args[i].slice(2)]=args[i+1];}
 if(mode==='compile')console.log(JSON.stringify(compileAdmission({market:o.market,compiler:o.compiler,native:o.native,tokenA:o['token-a'],tokenB:o['token-b'],nft:o.nft,config:json(o.config),out:o.out})));
 else if(mode==='bind')console.log(JSON.stringify(bindAdmission({build:o.build,marketId:Number(o['market-id']),out:o.out,admissionMode:o['admission-mode']??'single-v1'}).market_id));
 else throw Error('compile --market KIND --compiler BIN --native JSON --token-a JSON --token-b JSON --nft JSON --config JSON --out FRESH | bind --build DIR --market-id ID --out FRESH');
}
