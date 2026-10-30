// Operator-owned read-only evidence route. No signer, RPC or transaction admission.
import assert from 'node:assert/strict';
import {mkdir,open,readFile,lstat,unlink,rmdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {hostname} from 'node:os';
import {pathToFileURL} from 'node:url';
import {sealDriver} from './sealedDriver.mjs';
import {publishFile} from './durableFile.mjs';
import {runDurableSubmission} from './driverProcess.mjs';
import {sha256} from './requestBinding.mjs';

const deniedFields=['runtimeIdentityAuthenticated','snapshotProvenanceAuthenticated','chainDomainAuthenticated','historyPrefixAnchored','finalityVerified','causalSealVerified','qualifiedSource','randomAuthorization','broadcast'];
export function validateDeliveryReport(report,manifestSha256){
 assert.equal(report.schema,1);assert.equal(report.requestedManifestSha256,manifestSha256);
 assert.equal(typeof report.inspectionPassed,'boolean');
 for(const field of deniedFields)assert.equal(report[field],false,`delivery cannot authorize ${field}`);
 assert.equal(report.financialOperations,0);assert.equal(report.proofsGenerated,0);
 if(report.inspectionPassed)assert.equal(report.deliveryManifestSha256,manifestSha256);
 return report;
}
async function boundedJson(path,limit){
 const metadata=await lstat(path);assert.ok(metadata.isFile()&&metadata.size<=limit,'bounded regular public JSON required');
 const file=await open(path,'r');try{
  const opened=await file.stat();assert.equal(opened.dev,metadata.dev);assert.equal(opened.ino,metadata.ino);
  const bytes=Buffer.alloc(limit+1);let size=0;
  while(size<bytes.length){const {bytesRead}=await file.read(bytes,size,bytes.length-size,null);if(!bytesRead)break;size+=bytesRead;}
  assert.ok(size<=limit,'public JSON limit');return {value:JSON.parse(bytes.subarray(0,size).toString('utf8')),sha256:sha256(bytes.subarray(0,size))};
 }finally{await file.close();}
}
export async function verifyCheckpointDelivery(options){
 for(const pin of [options.manifestSha256,options.driverSha256])assert.match(pin??'',/^[0-9a-f]{64}$/,'reviewed manifest and native driver pins required');
 const directory=resolve(options.directory),report=resolve(options.report),runtimeDirectory=resolve(options.runtimeDirectory);
 const manifest=await boundedJson(join(directory,'delivery.json'),32768);
 assert.equal(manifest.sha256,options.manifestSha256,'reviewed delivery manifest differs');
 const driver=await sealDriver({wallet:options.driver,walletSha256:options.driverSha256,runtimeDirectory});
 const locks=join(runtimeDirectory,'checkpoint-delivery-locks');await mkdir(locks,{recursive:true,mode:0o700});
 // A separate read-only artifact lease is never a vault/account admission lock.
 // Interrupted leases fail closed for explicit owner/log review; no fake vault ID.
 const lease=join(locks,options.manifestSha256);await mkdir(lease,{mode:0o700});
 let ownerSaved=false;
 try{
  await publishFile(join(lease,'owner.json'),JSON.stringify({schema:1,pid:process.pid,host:hostname(),manifestSha256:options.manifestSha256,driverSha256:driver.sha256,report,financialOperations:0})+'\n');ownerSaved=true;
  await publishFile(report+'.intent.json',JSON.stringify({schema:1,kind:'checkpoint-delivery-verification-intent',manifestSha256:options.manifestSha256,driverSha256:driver.sha256,financialOperations:0,proofsGenerated:0,broadcast:false})+'\n');
  await driver.check();
  let processError;
  try{await runDurableSubmission(driver.file,['verify',directory,options.manifestSha256,report],{env:process.env,timeout:120000,logFile:report+'.native.log'});}catch(error){processError=error;}
  // The native verifier rereads and hashes every member. A webpage's report or
  // resource address is not an accepted argument to this operator-only route.
  await driver.check();
  const result=validateDeliveryReport((await boundedJson(report,131072)).value,options.manifestSha256);
  if(processError||!result.inspectionPassed){const error=Error('Checkpoint delivery rejected; retain native report and intent');error.code='CHECKPOINT_DELIVERY_REJECTED';throw error;}
  return result;
 }finally{
  if(ownerSaved)await unlink(join(lease,'owner.json'));
  await rmdir(lease);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [directory,manifestSha256,driver,driverSha256,runtimeDirectory,report,...extra]=process.argv.slice(2);
 if(!report||extra.length)throw Error('DELIVERY_DIRECTORY REVIEWED_MANIFEST_SHA256 NATIVE_DRIVER REVIEWED_DRIVER_SHA256 RUNTIME_DIRECTORY FRESH_REPORT required');
 verifyCheckpointDelivery({directory,manifestSha256,driver,driverSha256,runtimeDirectory,report}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
