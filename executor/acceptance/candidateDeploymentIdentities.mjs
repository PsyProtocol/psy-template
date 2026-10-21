// Distinct owned deployment identities prevent semantic receipt-hash reuse.
// These keys never receive assets or register as trading users. No keys printed.
import assert from 'node:assert/strict';import {existsSync,mkdirSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {read,run,save} from '../../batching/admission/liveSupport.mjs';
import {deploymentProfiles} from './deploymentProfiles.mjs';
const [base]=process.argv.slice(2),tools=read(join(base,'public/candidate-toolchain-v4.json')),binary=tools.ordinaryBinary,sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');assert.equal(sha(binary),tools.ordinaryBinarySha256);
const releaseFile=join(base,'public/deployment-identity-release-v1.json');assert.ok(!existsSync(releaseFile),'identity release already exists; inspect instead of regenerating');
const secretDir=join(base,'.secrets');if(!existsSync(secretDir))mkdirSync(secretDir,{mode:0o700});
const markets=['amm','orderbook','bondingcurve','nftmarket'],profiles=[];
for(let i=0;i<markets.length;i+=2){const results=await Promise.allSettled(markets.slice(i,i+2).map(async market=>{
 const walletPath=join(secretDir,'deploy-'+market+'.json'),publicIdentity=join(base,'public','deploy-'+market+'-identity.json');
 if(!existsSync(publicIdentity)){assert.ok(!existsSync(walletPath),'partial identity creation requires inspection');await run(binary,['create',join(base,'public/rpc.json'),walletPath,publicIdentity],join(base,'create-deploy-'+market+'-v1.log'),{PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'});}
 const p=read(publicIdentity);assert.match(p.publicKeyHash,/^[0-9a-f]{64}$/);assert.equal(p.schema,'isolated-market-wallet-v1');assert.equal(p.networkMagic,'1384803358401154921');
 // Compare only public metadata. The secret object is never saved or logged.
 assert.deepEqual(read(walletPath).public,p,'private file public identity differs');
 return {market,walletPath,publicIdentity,publicIdentitySha256:sha(publicIdentity),publicKeyHash:p.publicKeyHash};
 }));for(const r of results)if(r.status==='fulfilled')profiles.push(r.value);const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
assert.equal(new Set(profiles.map(p=>p.publicKeyHash)).size,4);
deploymentProfiles({version:1,profiles},base);
const file=join(base,'public/deployment-identities-v1.json');save(file,{version:1,profiles,scope:'four distinct owned deployment keys; no trading registration, funds, policy expansion or secret values'});
save(releaseFile,{version:1,profilesSha256:sha(file),ordinaryBinarySha256:tools.ordinaryBinarySha256,networkMagic:'1384803358401154921',createdAt:new Date().toISOString()});
