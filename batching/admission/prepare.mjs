// Offline bounded admission candidate; never updates an existing artifact.
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {generateAdmission} from './generate.mjs';import {makeBatchPolicy} from '../v2/policy.mjs';
export function makeAdmissionPolicy(market,marketId,cfg,abi,tokenAbi,nftAbi){
 const spec=makeBatchPolicy(market,marketId,cfg,abi,tokenAbi,nftAbi);
 const get=(name,inputs)=>{const m=abi.contract.methods.find(x=>x.name===name);if(!m||m.input_felt_count!==inputs.length)throw Error('queue method ABI '+name);return {contract_id:marketId,method_id:m.method_id,method_name:name,inputs};};const w=witness=>({witness}),k=constant=>({constant:String(constant)});
 for(const[name,args]of [['start_epoch',[w(2),w(3)]],['admit_entry',[w(2),w(3)]],['seal_epoch',[w(2)]],['abort_empty_epoch',[w(2)]]]){
  const calls=[get('fund_gas',[w(1),k(1000100000)]),{contract_id:0,method_id:2293029357,method_name:'simple_claim',inputs:[w(1)]},get(name,args)];while(calls.length<9)calls.push(spec.noop);const op={branch:spec.operations.length+1,name,maintenance:true,calls};spec.operations.push(op);spec.branches.push({name,calls});
 }
 if(spec.operations.length>32)throw Error('queue policy operation capacity');
 return spec;
}
export function prepareAdmission({compiler,assets,out}){
 compiler=resolve(compiler);assets=resolve(assets);out=resolve(out);if(existsSync(out))throw Error('fresh output required');mkdirSync(out,{recursive:true});
 const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
 for(const n of ['token','nft']){mkdirSync(resolve(out,n));copyFileSync(resolve(assets,n,'compilation_artifact.json'),resolve(out,n,'compilation_artifact.json'));}copyFileSync(resolve(assets,'native.json'),resolve(out,'native.json'));
 const token=JSON.parse(readFileSync(resolve(out,'token/compilation_artifact.json'))),nft=JSON.parse(readFileSync(resolve(out,'nft/compilation_artifact.json'))),records=[];
 for(const market of ['amm','orderbook','bondingcurve','nftmarket']){
  const cfg=JSON.parse(readFileSync(resolve(assets,market,'config.json'))),dir=resolve(out,market);mkdirSync(dir);const src=resolve(dir,'main.psy.rs');writeFileSync(src,generateAdmission(market,cfg),{flag:'wx'});
  const r=spawnSync(compiler,[src,resolve(dir,'compiled'),...(market==='nftmarket'?['41','42','1']:['42','43','0'])],{encoding:'utf8',maxBuffer:8e6});writeFileSync(resolve(dir,'compile.log'),(r.stdout??'')+(r.stderr??''),{flag:'wx'});if(r.status!==0)throw Error(market+': '+r.stderr);
  const a=JSON.parse(readFileSync(resolve(dir,'compiled/compilation_artifact.json')));const spec=makeAdmissionPolicy(market,1000,cfg,a.abi,token.abi,nft.abi);
  writeFileSync(resolve(dir,'policy.json'),JSON.stringify(spec,null,2)+'\n',{flag:'wx'});writeFileSync(resolve(dir,'config.json'),JSON.stringify(cfg,null,2)+'\n',{flag:'wx'});records.push({market,sourceSha256:hash(src),artifactSha256:hash(resolve(dir,'compiled/compilation_artifact.json')),policySha256:hash(resolve(dir,'policy.json'))});
 }
 const report={schema:1,scope:'four-member opt-in authenticated admission candidate, not all market orders',compilerSha256:hash(compiler),records,broadcast:false,fullUpsVerified:false};writeFileSync(resolve(out,'PREPARED.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),opts={};if(args.length!==6)throw Error('--compiler BIN --assets FROZEN_V2 --out FRESH_DIR');for(let i=0;i<args.length;i+=2)opts[args[i].slice(2)]=args[i+1];console.log(JSON.stringify(prepareAdmission(opts)));}
