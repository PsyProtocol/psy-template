import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {serviceSettings} from './service.mjs';
export async function loadCompositionConfig(file) {
 const root=dirname(resolve(file)),config=JSON.parse(await readFile(file,'utf8'));
 const paths=['intent','plan','policy','controllerAbi','controllerSource','controllerArtifact','tokenAbi','otherTokenAbi','nativeAbi','rpcConfig','wallet','runtimeDirectory'];
 const tools=['controllerCompiler','tokenCompiler','marketCompiler','componentInspector','baseKeyDriver'];
 const allowed=[...paths,...tools,'marketAbis','profile','network','sdkManifestHash','testnetProfile','vaultId','fingerprint','publicKeyHash','walletSha256','controllerBudget','ownerFeeReserve','proverThreads','assetMetadata','components','initialDeployment','service','coordinator'];
 assert.ok(Object.keys(config).every(k=>allowed.includes(k)),'unknown composition configuration');
 const path=p=>{assert.ok(typeof p==='string'&&p.length>0);return resolve(root,p);};
 for(const key of paths)config[key]=path(config[key]);
 assert.ok(Array.isArray(config.marketAbis)&&config.marketAbis.length===2);config.marketAbis=config.marketAbis.map(path);
 assert.ok(Array.isArray(config.components));
 for(const c of config.components)for(const key of ['source','artifact',...(c.role==='market'?['config','policy']:[])])c[key]=path(c[key]);
 for(const key of tools)config[key].file=path(config[key]?.file);
 if(config.initialDeployment){config.initialDeployment.request=path(config.initialDeployment.request);config.initialDeployment.verifier.file=path(config.initialDeployment.verifier.file);}
 if(config.coordinator){assert.deepEqual(Object.keys(config.coordinator).sort(),['authTokenFile','endpoint'].sort());
  config.coordinator.authTokenFile=path(config.coordinator.authTokenFile);}
 if(config.service)serviceSettings(config.service);
 return config;
}
