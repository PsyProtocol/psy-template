// Build a fresh policy/resource candidate, reusing exact reviewed bytecode.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync,constants} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {accountInitializedCollection,validateAccountInitialization} from '../../nft/account-initialization.mjs';
import {makeNftBootstrapPolicy} from './nft-bootstrap-policy.mjs';
import {makeExitPolicy} from './exit-policy.mjs';
import {validateSuiteArtifactValues} from '../market-suite/build.mjs';
const [input,collectionSource,compiler,compilerSha256,output]=process.argv.slice(2);assert.equal(process.argv.length,7,'REVIEWED_CURRENT_FIXTURES COLLECTION_SOURCE FROZEN_COMPILER SHA256 FRESH_OUTPUT');
const root=resolve(input),out=resolve(output);assert.ok(!existsSync(out),'fresh candidate required');
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>readFileSync(join(root,p));
const build=JSON.parse(read('BUILD.json'));
assert.equal(build.sdkCommit,'01b8f2b0a077367a7b9879baba1a72aea8ab5510');
const old=JSON.parse(read('nftmarket/stream-policy.json'));assert.equal(old.version,19);
const config=JSON.parse(read('nftmarket/config.json')),artifact=JSON.parse(read('nftmarket/compiled/compilation_artifact.json'));
const dependencies=validateSuiteArtifactValues(Object.fromEntries(Object.entries({native:'native.json',tokenA:'token/compilation_artifact.json',tokenB:'token/compilation_artifact.json',nft:'nft/compilation_artifact.json'}).map(([k,p])=>[k,JSON.parse(read(p))])));
assert.deepEqual(old,makeExitPolicy('nftmarket',old.market_id,config,artifact,dependencies.tokenA,dependencies.nft,'sdk-audit-20261102-v1'),'exact reviewed v19 predecessor');
assert.match(compilerSha256,/^[a-f0-9]{64}$/);assert.equal(sha(readFileSync(compiler)),compilerSha256,'reviewed compiler bytes');
mkdirSync(out);const files={};
const compile=(source,name)=>{
 const path=join(out,name+'.psy.rs');writeFileSync(path,source,{flag:'wx'});
 const target=join(out,name),r=spawnSync(resolve(compiler),[path,target],{encoding:'utf8',timeout:60000,maxBuffer:1000000});
 writeFileSync(join(out,name+'.log'),(r.stdout??'')+(r.stderr??'')+(r.error?.message??''),{flag:'wx'});
 assert.equal(r.status,0,'preserve failed collection compilation');assert.equal(sha(readFileSync(compiler)),compilerSha256);
 return readFileSync(join(target,'compilation_artifact.json'));
};
const source=readFileSync(collectionSource,'utf8'),control=compile(source,'collection-control');
assert.equal(sha(control),sha(read('nft/compilation_artifact.json')),'exact original collection source reproduced');
const nextBytes=compile(accountInitializedCollection(source),'collection-account');
const collection=JSON.parse(nextBytes);validateAccountInitialization(dependencies.nft,collection);
const next=makeNftBootstrapPolicy(old.market_id,config,artifact,dependencies.tokenA,collection,'sdk-audit-20261102-v1');
for(const name of ['native.json','token/compilation_artifact.json','nftmarket/config.json','nftmarket/main.psy.rs','nftmarket/compiled/compilation_artifact.json']){
 const target=join(out,name);mkdirSync(resolve(target,'..'),{recursive:true});copyFileSync(join(root,name),target,constants.COPYFILE_EXCL);files[name]=sha(read(name));
}
mkdirSync(join(out,'nft'));writeFileSync(join(out,'nft/compilation_artifact.json'),nextBytes,{flag:'wx'});files['nft/compilation_artifact.json']=sha(nextBytes);
for(const[name,value]of [['nftmarket/policy.json',next.base],['nftmarket/stream-policy.json',next],['BUILD.json',{schema:1,sdkCommit:build.sdkCommit,clientCommit:'7058070057c3242b5d8b29e1a31d498aaa4202c0',version:21,market:'nftmarket',originalPolicySha256:sha(read('nftmarket/stream-policy.json')),files,marketBytecodeChanged:false,collectionBytecodeChanged:true,collectionAccountVersion:1,compilerSha256,originalCollectionSha256:sha(control),collectionSourceSha256:sha(Buffer.from(source)),accountSourceSha256:sha(Buffer.from(accountInitializedCollection(source))),registeredKeyChanged:true,fullUpsVerified:false,broadcast:false,liveAuthorization:false}]])writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:out,version:21,marketBytecodeChanged:false,newKeyRequired:true,fullUpsVerified:false,broadcast:false}));
