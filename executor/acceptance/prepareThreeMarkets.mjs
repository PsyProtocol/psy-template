// Initial deployments only; partial/unknown mutation always stops for exact
// reconciliation. Fresh QA NFT, existing owned QA FT; no old code updates.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,copyFileSync,constants,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {read,save,run,confirmDeploy,confirmRegistration,binding,contractBinding} from '../../batching/admission/liveSupport.mjs';
import {publicState} from '../publicState.mjs';
import {compileAdmission} from '../../batching/admission/build.mjs';
import {registerMarket,reconcileRegisteredMarket} from '../../batching/admission/liveMarket.mjs';
import {validateNftAbi} from '../../nft-marketplace/abi.mjs';
import {assertDurableRuntimeDirectory} from '../runtimeStorage.mjs';
import {sha256} from '../requestBinding.mjs';
import {SDK} from './threeMarketCase.mjs';
const[parent,base,release]=process.argv.slice(2);assertDurableRuntimeDirectory(base);assert.ok(parent&&release&&resolve(parent)!==resolve(base));
assert.ok(existsSync(join(parent,'public/PREPARATION-ACCEPTANCE-COMPLETE-v1.json')),'closed owner/asset source required');
for(const n of ['public','attempts','.secrets','assets','markets-v1'])mkdirSync(join(base,n),{recursive:true,mode:0o700});
const copy=(src,dst)=>{if(existsSync(dst))assert.ok(readFileSync(dst).equals(readFileSync(src)),'frozen fixture differs');else{mkdirSync(join(dst,'..'),{recursive:true});copyFileSync(src,dst,constants.COPYFILE_EXCL);}};
copy(join(parent,'public/rpc.json'),join(base,'public/rpc.json'));
copy(release,join(base,'public/TOOLS.json'));const tools=read(join(base,'public/TOOLS.json'));assert.equal(tools.sdkManifestSha256,SDK);
for(const t of Object.values(tools.binaries))assert.equal(sha256(readFileSync(t.file)),t.sha256);
const config=join(base,'public/rpc.json'),env={PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'},old=read(join(parent,'public/BOOTSTRAP-v1.json'));
const actors={};for(const [i,name]of ['bob','buyer'].entries()){const a=old.actors[i];copy(join(parent,'.secrets',a.name+'.json'),join(base,'.secrets',a.name+'.json'));chmodSync(join(base,'.secrets',a.name+'.json'),0o600);actors[name]={id:a.userId,publicKeyHash:a.identity.publicKeyHash,secretName:a.name+'.json'};}
const secret=join(base,'.secrets/sponsor.json'),pub=join(base,'public/sponsor-identity.json'),reg=join(base,'attempts/register-sponsor-v1');
if(!existsSync(pub)){assert.ok(!existsSync(secret),'partial creation');await run(tools.binaries.ordinary.file,['create',config,secret,pub],join(base,'create-sponsor-v1.log'),env);}
if(!existsSync(join(reg,'receipt.json'))){assert.ok(!existsSync(reg),'partial sponsor registration');await run(tools.binaries.ordinary.file,['register',config,secret,reg],join(base,'register-sponsor-v1.log'),env);}
let s=await publicState(config);const pk=read(pub).publicKeyHash;let ids=[];
for(let poll=0;poll<120;poll++){s=await publicState(config);ids=await s.userIds(pk);assert.ok(ids.length<=1,'ambiguous registration');if(ids.length)break;await new Promise(r=>setTimeout(r,10000));}
assert.equal(ids.length,1,'registration identity not yet observed; reconcile exact original');
actors.sponsor={id:ids[0],publicKeyHash:pk,secretName:'sponsor.json'};
const ri=join(base,'public/sponsor-registration-included.json');if(!existsSync(ri))save(ri,await confirmRegistration(config,ids[0],pk));
for(const a of Object.values(actors))assert.deepEqual(await s.userIds(a.publicKeyHash),[a.id]);
const caseFile=join(base,'public/CASE.json'),pin={schema:1,sdkManifestSha256:SDK,actors,assets:[2483,2484],legacyAssetVaults:[1012928,718016],ordinaryRoles:'explicitly owned QA wallets; sponsor never trades',existingPusdtUsed:false,oldContractUpdates:false};
if(existsSync(caseFile))assert.deepEqual(read(caseFile),pin);else save(caseFile,pin);
for(const n of ['token-a.json','token-b.json','native.json'])copy(join(parent,'pools/hop-1/build',n),join(base,'assets',n));
const source=readFileSync('nft/src/main.psy.rs','utf8').replace('const ISSUER_USER_ID: usize = 5;',`const ISSUER_USER_ID: usize = ${actors.bob.id};`),src=join(base,'assets/nft-source.psy.rs'),compiled=join(base,'assets/nft-compiled');
if(existsSync(src))assert.equal(readFileSync(src,'utf8'),source);else writeFileSync(src,source,{flag:'wx'});
if(!existsSync(compiled))await run(tools.binaries.nftCompiler.file,[src,compiled],join(base,'compile-nft-v1.log'),env);
const artifact=join(compiled,'compilation_artifact.json');validateNftAbi(read(artifact).abi,read(artifact).state_tree_height);
async function deploy(label,artifact){const out=join(base,'attempts','deploy-'+label+'-v1');if(!existsSync(join(out,'receipt.json'))){assert.ok(!existsSync(out),'partial initial deployment; preserve original');const t=await run(tools.binaries.ordinary.file,['deploy',config,join(base,'.secrets',actors.bob.secretName),artifact,out],join(base,'deploy-'+label+'-v1.log'),env);save(join(out,'timing.json'),t);}return existsSync(join(out,'included.json'))?read(join(out,'included.json')):confirmDeploy(config,out,actors.bob.publicKeyHash);}
const nft=await deploy('qa-nft',artifact);const nm=join(base,'public/NFT-DEPLOYMENT.json');if(!existsSync(nm))save(nm,nft);
s=await publicState(config);const dependencies=[await binding(s,0)];
for(const [id,file]of [[2483,'qa-a-deployment-v1.json'],[2484,'qa-b-deployment-v1.json']]){const d=read(join(parent,'public',file)),b=await binding(s,id);assert.deepEqual(b,contractBinding(id,d.leaf));dependencies.push(b);}
dependencies.push(await binding(s,nft.contractId));
for(const market of ['orderbook','bondingcurve','nftmarket']){
 const build=join(base,'markets-v1',market),config={assetA:2483,assetB:2484,issuer:actors.bob.id,target:1012928,cap:10,liquidity:10,unit:'1000000000000000000',base:'1000000000000000000',step:'100000000000000',threshold:10,networkMagic:BigInt(s.network.magic).toString(),...(market==='nftmarket'?{nftId:nft.contractId,tokenId:2483}:{})};
 if(!existsSync(build))compileAdmission({market,compiler:tools.binaries.compiler.file,native:join(base,'assets/native.json'),tokenA:join(base,'assets/token-a.json'),tokenB:join(base,'assets/token-b.json'),nft:artifact,config,out:build});
 const deployment=await deploy(market,join(build,'compiled/compilation_artifact.json'));
 if(!existsSync(join(build,'live-registration.json'))){const out=join(base,'attempts','register-'+market+'-vault-v1');if(existsSync(join(out,'receipt.json')))await reconcileRegisteredMarket({base,config:join(base,'public/rpc.json'),build,deployment,dependencies});else{assert.ok(!existsSync(out),'unknown market key registration');await registerMarket({base,config:join(base,'public/rpc.json'),build,deployment,dependencies,compactBinary:tools.binaries.compact.file,env});}}
 console.log(new Date().toISOString(),'fresh',market,deployment.contractId,read(join(build,'live-registration.json')).vaultId);
}
const marker=join(base,'public/PREPARED.json');if(!existsSync(marker))save(marker,{at:new Date().toISOString(),newNft:nft.contractId,markets:['orderbook','bondingcurve','nftmarket'].map(k=>read(join(base,'markets-v1',k,'live-registration.json'))),oldContractUpdates:false,ordersOpened:false});
