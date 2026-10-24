// One new independent publisher after a historical-occurrence receipt rejection.
// No replay, funding, registration or alteration of the original deployment.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';import {join} from 'node:path';
import {read,save,run} from '../../batching/admission/liveSupport.mjs';
import {freshDeploymentReceipt} from '../../batching/admission/freshDeployment.mjs';
import {publicState} from '../../executor/publicState.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {ordinaryRelease} from './applicationRelease.mjs';
import {controllerDirectory} from './controllerDirectory.mjs';
const[base]=process.argv.slice(2),home=join(controllerDirectory(base),'service-recovery'),old=join(home,'attempts/deploy-controller-v1');
const marker=join(home,'public/SELECTED-DEPLOYMENT-v1.json');assert.ok(!existsSync(marker));
const before=read(join(old,'before.json')),hash=read(join(old,'receipt.json')).receipt,config=join(base,'public/rpc.json');
const n=read(config).networks.sepolia,url=n.api_services_url[0].replace(/\/$/,'');
const response=await fetch(url+'/api/v1/transaction/hash/'+hash,{signal:AbortSignal.timeout(20000)});assert.equal(response.ok,true);
const receipt=await response.json();assert.equal(receipt.success,true);assert.equal(receipt.data.content_hash,hash);assert.equal(receipt.data.tx_type,'DeployContract');
assert.throws(()=>freshDeploymentReceipt(before,receipt.data),/historical deployment/);
save(join(home,'public/DEPLOYMENT-OCCURRENCE-REJECTED-v1.json'),{checkedAt:new Date().toISOString(),before,receipt,
 originalRequestSha256:sha256(readFileSync(join(old,'request.json'))),scope:'historical receipt cannot identify this fresh occurrence; original request quarantined, never replayed or used for a key/funding'});
const s=await publicState(config);assert.equal(s.network.fees.deploy_contract_fee,0,'independent unfunded publisher requires zero-fee initial deployment');
const tools=read(join(base,'public/toolchain-v1.json')),ordinary=ordinaryRelease(base,tools.binaries.isolated_wallet),name='service-publisher-v1';
const secret=join(base,'.secrets',name+'.json'),identity=join(home,'public/publisher-identity-v1.json');
assert.ok(!existsSync(secret)&&!existsSync(identity),'existing publisher requires exact reconciliation');
await run(ordinary.file,['create',config,secret,identity],join(home,'publisher-create-v1.log'),
 {PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'});
const publisher=read(identity);assert.notEqual(publisher.publicKeyHash,read(join(old,'intent.json')).deployer);
save(marker,{schema:1,label:'deploy-controller-independent-v1',originalLabel:'deploy-controller-v1',
 publicKeyHash:publisher.publicKeyHash,secretName:name,artifactSha256:sha256(readFileSync(join(home,'build/compiled/compilation_artifact.json'))),
 originalRequestSha256:sha256(readFileSync(join(old,'request.json'))),originalContentHash:hash,
 scope:'one independent zero-asset deployment; fresh public identity, no ordinary-user registration/faucet needed; not a replay or proof that the original was discarded'});
console.log('independent zero-asset publisher prepared; original remains quarantined');
