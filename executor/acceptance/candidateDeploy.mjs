// Fresh deployment only. Existing deployments are reconciled, never updated.
import assert from 'node:assert/strict';
import{existsSync}from'node:fs';import{join}from'node:path';
import{read,run,save,confirmDeploy}from'../../batching/admission/liveSupport.mjs';
import{registerMarket,reconcileRegisteredMarket}from'../../batching/admission/liveMarket.mjs';
import{compileAdmission}from'../../batching/admission/build.mjs';
const[base,original,ordinaryBinary,compactBinary,admissionMode='single-v1']=process.argv.slice(2);assert.ok(['single-v1','all-four-v1'].includes(admissionMode));assert.ok(compactBinary,'BASE ORIGINAL ORDINARY_BINARY COMPACT_BINARY');
const config=join(base,'public/rpc.json'),env={PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'},secret=join(original,'.secrets/bob-bundled-profile-v1.json');
const owner=read(join(original,'attempts/deploy-amm-v1/included.json')).leaf.deployer;
const oldDependencies=read(join(original,'markets-v1/amm/live-registration.json')).contracts.filter(b=>b.contract.contractId!==2468);
for(const market of ['amm','orderbook','bondingcurve','nftmarket']){
 const build=join(base,'markets-v1',market);
 if(market==='bondingcurve'&&!existsSync(build)){
  const source=join(original,'markets-v1/amm'),cfg=read(join(original,'markets-v1/bondingcurve/config.json'));cfg.target=read(join(base,'markets-v1/amm/live-registration.json')).vaultId;
  compileAdmission({market,compiler:'/tmp/psy-market-staged-compiler-v3-20261020.bin',native:source+'/native.json',tokenA:source+'/token-a.json',tokenB:source+'/token-b.json',nft:source+'/nft.json',config:cfg,out:build});
 }
 const out=join(base,'attempts','deploy-'+market+'-v1');
 if(!existsSync(join(out,'receipt.json'))){assert.ok(!existsSync(out),'partial deployment requires inspection');const t=await run(ordinaryBinary,['deploy',config,secret,join(build,'compiled/compilation_artifact.json'),out],join(base,'deploy-'+market+'-v1.log'),env);save(join(out,'timing.json'),t);}
 const deployment=existsSync(join(out,'included.json'))?read(join(out,'included.json')):await confirmDeploy(config,out,owner);
 if(!existsSync(join(build,'live-registration.json'))){
  const dependencies=market==='nftmarket'?read('/tmp/psy-market-nft-recovery-live-20261020-v2/markets-v1/nftmarket/live-registration.json').contracts.filter(b=>b.contract.contractId!==2472):oldDependencies;
  if(existsSync(join(base,'attempts/register-'+market+'-vault-v1/receipt.json')))await reconcileRegisteredMarket({base,config,build,deployment,dependencies});
  else {assert.ok(!existsSync(join(base,'attempts/register-'+market+'-vault-v1')),'partial registration requires inspection');await registerMarket({base,config,build,deployment,dependencies,compactBinary,env,admissionMode});}
 }
 console.log(new Date().toISOString(),'fresh deployment and registration',market,deployment.contractId,read(join(build,'live-registration.json')).vaultId);
}
save(join(base,'public/deployments-complete-v1.json'),{completedAt:new Date().toISOString(),oldContractUpdates:false,markets:['amm','orderbook','bondingcurve','nftmarket'].map(k=>read(join(base,'markets-v1',k,'live-registration.json')))});
