// Report and process-ownership tests; process doubles are NOT native proof evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {validateDeliveryReport,verifyCheckpointDelivery} from './checkpointDelivery.mjs';
import {sha256} from './requestBinding.mjs';
import {requireQualifiedRandomSource} from '../batching/random-order/sourceGate.mjs';
function report(pin){return {schema:1,requestedManifestSha256:pin,inspectionPassed:false,runtimeIdentityAuthenticated:false,snapshotProvenanceAuthenticated:false,chainDomainAuthenticated:false,historyPrefixAnchored:false,finalityVerified:false,causalSealVerified:false,qualifiedSource:false,randomAuthorization:false,broadcast:false,financialOperations:0,proofsGenerated:0};}
test('a delivery report can never promote runtime, finality, seed or financial authority',()=>{
 const pin='a'.repeat(64),r=report(pin);assert.equal(validateDeliveryReport(r,pin).broadcast,false);
 for(const field of ['runtimeIdentityAuthenticated','snapshotProvenanceAuthenticated','chainDomainAuthenticated','historyPrefixAnchored','finalityVerified','causalSealVerified','qualifiedSource','randomAuthorization','broadcast'])assert.throws(()=>validateDeliveryReport({...r,[field]:true},pin));
 for(const change of [{requestedManifestSha256:'b'.repeat(64)},{financialOperations:1},{proofsGenerated:1},{inspectionPassed:true},{schema:2}])assert.throws(()=>validateDeliveryReport({...r,...change},pin));
 const conditionallyValid=validateDeliveryReport({...r,inspectionPassed:true,deliveryManifestSha256:pin},pin);
 assert.throws(()=>requireQualifiedRandomSource(conditionallyValid),{code:'RANDOM_SOURCE_UNAVAILABLE'});
});
test('owned actual native rejection retains exact intent and cannot be replaced by a supplied report',{
 skip:!process.env.CHECKPOINT_DELIVERY_BINARY||!process.env.CHECKPOINT_DELIVERY_FIXTURE
},async()=>{
 const root=await mkdtemp(join(tmpdir(),'checkpoint-delivery-native-'));
 try{
  const directory=process.env.CHECKPOINT_DELIVERY_FIXTURE,driver=process.env.CHECKPOINT_DELIVERY_BINARY;
  const manifestSha256=sha256(await readFile(join(directory,'delivery.json'))),driverSha256=sha256(await readFile(driver));
  const options={directory,driver,manifestSha256,driverSha256,runtimeDirectory:join(root,'runtime'),report:join(root,'report.json')};
  await assert.rejects(verifyCheckpointDelivery(options),{code:'CHECKPOINT_DELIVERY_REJECTED'});
  const result=JSON.parse(await readFile(options.report,'utf8'));validateDeliveryReport(result,manifestSha256);assert.equal(result.inspectionPassed,false);assert.match(result.error,/No such file/);
  const intent=await readFile(options.report+'.intent.json','utf8'),retained=await readFile(options.report,'utf8');
  const copied=JSON.parse(intent);assert.equal(copied.driverSha256,driverSha256);assert.equal(copied.manifestSha256,manifestSha256);
  await assert.rejects(verifyCheckpointDelivery(options),{code:'EEXIST'});
  assert.equal(await readFile(options.report,'utf8'),retained);assert.equal(await readFile(options.report+'.intent.json','utf8'),intent);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('review pins and interrupted owner leases reject before the native process starts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'checkpoint-delivery-route-'));
 try{
  const input=join(root,'input');await mkdir(input);const bytes='{}';await writeFile(join(input,'delivery.json'),bytes);
  const driver=join(root,'not-a-native-driver');await writeFile(driver,'ownership test double; never execute');
  const options={directory:input,manifestSha256:sha256(bytes),driver,driverSha256:sha256(await readFile(driver)),runtimeDirectory:join(root,'runtime'),report:join(root,'report.json')};
  await assert.rejects(verifyCheckpointDelivery({...options,manifestSha256:'f'.repeat(64)}),/manifest differs/);
  await assert.rejects(verifyCheckpointDelivery({...options,driverSha256:'f'.repeat(64)}),/reviewed walletSha256/);
  const lease=join(options.runtimeDirectory,'checkpoint-delivery-locks',options.manifestSha256);await mkdir(lease,{recursive:true});const owner='{"pid":1,"host":"interrupted-owner-test"}\n';await writeFile(join(lease,'owner.json'),owner);
  await assert.rejects(verifyCheckpointDelivery(options),{code:'EEXIST'});assert.equal(await readFile(join(lease,'owner.json'),'utf8'),owner);
 }finally{await rm(root,{recursive:true,force:true});}
});
