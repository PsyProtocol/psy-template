import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createCompositionBuildResources} from './buildResources.mjs';
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'build-cache-')),path=join(dir,'input');await writeFile(path,'original');
 const options={network:'sepolia',sdkManifestHash:'sdk',vaultId:123,fingerprint:'key',walletSha256:'wallet',marketAbis:[path,path],components:[],runtimeDirectory:dir};
 for(const key of ['intent','plan','policy','controllerAbi','controllerSource','controllerArtifact','tokenAbi','otherTokenAbi','nativeAbi','rpcConfig','wallet'])options[key]=path;
 for(const key of ['controllerCompiler','tokenCompiler','marketCompiler','componentInspector','baseKeyDriver'])options[key]={file:path,sha256:'pin'};
 const model={intent:{id:'intent'},plan:{registryHash:'registry'},policy:{calls:'exact'}};
 return {dir,path,options,model,close:()=>rm(dir,{recursive:true,force:true})};
}
test('verified immutable build closure coalesces work while every hit rechecks inputs and tool closure',async()=>{
 const x=await fixture(),events=[];let builds=0,checks=0;
 const verifier=async()=>{builds++;return{check:async()=>{checks++;},derived:{root:'pinned'}};};
 try{
  const c=createCompositionBuildResources({observe:e=>events.push(e),verifiers:{controller:verifier}});
  const [a,b]=await Promise.all([c.verifyControllerSource(x.options,x.model,{}),c.verifyControllerSource(x.options,x.model,{})]);
  assert.equal(a,b);assert.equal(builds,1);assert.ok(checks>=3);
  await c.verifyControllerSource(x.options,x.model,{});assert.equal(builds,1);assert.ok(events.some(e=>e.cacheHit));
  await writeFile(x.path,'changed');await assert.rejects(()=>c.verifyControllerSource(x.options,x.model,{}),/input changed/);
  assert.equal(builds,1,'changed artifacts cannot silently replace cached closure');
 }finally{await x.close();}
});
test('build resources reject changes to network, SDK, key, intent, registry or runtime scope',async()=>{
 const x=await fixture();try{
  const c=createCompositionBuildResources({verifiers:{controller:async()=>({check:async()=>{}})}});
  await c.verifyControllerSource(x.options,x.model,{});
  for(const edit of [{network:'other'},{sdkManifestHash:'other'},{walletSha256:'other'},
    {fingerprint:'other'},{vaultId:124},{runtimeDirectory:x.dir+'/other'}])
    await assert.rejects(()=>c.verifyControllerSource({...x.options,...edit},x.model,{}),/another/);
  for(const model of [{...x.model,intent:{id:'other'}},{...x.model,plan:{registryHash:'other'}},
    {...x.model,policy:{calls:'changed'}}])await assert.rejects(()=>c.verifyControllerSource(x.options,model,{}),/another/);
 }finally{await x.close();}
});
