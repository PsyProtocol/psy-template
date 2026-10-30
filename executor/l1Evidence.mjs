// Operator-owned immutable L1 inclusion packets. Not transaction admission,
// consensus finality, a random oracle, or a DApp-provided verifier interface.
import assert from 'node:assert/strict';
import {mkdir,unlink,rmdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {hostname} from 'node:os';
import {pathToFileURL} from 'node:url';
import {readPublicBytes} from './sourcePlanReceipt.mjs';
import {publishFile} from './durableFile.mjs';
import {sha256} from './requestBinding.mjs';
import {sealDriver} from './sealedDriver.mjs';
import {runDurableSubmission,driverRecords} from './driverProcess.mjs';

const sdk='c92880c8b6e2c8d392f19368bc8801a2584fd427';
const names=['statement','header','proof','code'];
const exact=(v,keys)=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));assert.deepEqual(Object.keys(v).sort(),[...keys].sort());};
const pin=v=>assert.match(v??'',/^[a-f0-9]{64}$/,'reviewed byte digest required');
export async function storeL1EvidencePacket({directory,statementSha256,files}){
 pin(statementSha256);exact(files,names);directory=resolve(directory);
 const captures={};for(const name of names)captures[name]=await readPublicBytes(files[name],2097152);
 assert.equal(sha256(captures.statement),statementSha256,'reviewed statement differs');
 const manifest={schema:1,kind:'immutable-l1-inclusion-packet-v1',sdkCommit:sdk,files:Object.fromEntries(names.map(n=>[n,sha256(captures[n])])),canBroadcast:false,finalityVerified:false};
 // A partial packet without the final manifest is never admitted or silently
 // overwritten. Recovery uses a complete manifest or an explicit new directory.
 await mkdir(directory,{mode:0o700});
 for(const name of names)await publishFile(join(directory,name+'.json'),captures[name]);
 const bytes=Buffer.from(JSON.stringify(manifest)+'\n');await publishFile(join(directory,'packet.json'),bytes);
 return {packetSha256:sha256(bytes),manifest};
}
async function packet(directory,packetSha256){
 pin(packetSha256);const bytes=await readPublicBytes(join(directory,'packet.json'),32768);assert.equal(sha256(bytes),packetSha256);
 const manifest=JSON.parse(bytes.toString('utf8'));exact(manifest,['schema','kind','sdkCommit','files','canBroadcast','finalityVerified']);
 assert.equal(manifest.schema,1);assert.equal(manifest.kind,'immutable-l1-inclusion-packet-v1');assert.equal(manifest.sdkCommit,sdk);
 assert.equal(manifest.canBroadcast,false);assert.equal(manifest.finalityVerified,false);exact(manifest.files,names);
 for(const n of names){pin(manifest.files[n]);assert.equal(sha256(await readPublicBytes(join(directory,n+'.json'),2097152)),manifest.files[n],'stored inclusion packet changed');}
 return manifest;
}
export function validateL1InclusionReport(report,manifest){
 exact(report,['schema','kind','sdkCommit','chainIdClaim','blockHash','stateRoot','address','headerProfile','executionHeaderHashVerified','legacy21FieldHash','legacy21FieldHashMatches','accountMptVerified','runtimeCodeHashVerified','runtimeCodeHash','storage','headerConsensusVerified','runtimeSourceIdentityVerified','storageLayoutSemanticsVerified','chainInstanceAuthenticated','finalityVerified','seedSecrecyAuthenticated','qualifiedRandomness','originalAnchorReplaced','canSign','canBroadcast','proofsGenerated','financialOperations','inspectionPassed','statementSha256','headerSha256','proofSha256','codeSha256']);
 assert.equal(report.schema,1);assert.equal(report.kind,'execution-state-inclusion-inspection-v1');assert.equal(report.sdkCommit,sdk);
 assert.equal(report.chainIdClaim,11155111);assert.equal(report.headerProfile,'ethereum-amsterdam-23-v1');
 for(const k of ['inspectionPassed','executionHeaderHashVerified','accountMptVerified','runtimeCodeHashVerified'])assert.equal(report[k],true);
 for(const k of ['headerConsensusVerified','runtimeSourceIdentityVerified','storageLayoutSemanticsVerified','chainInstanceAuthenticated','finalityVerified','seedSecrecyAuthenticated','qualifiedRandomness','originalAnchorReplaced','canSign','canBroadcast'])assert.equal(report[k],false,'inclusion is not authority for '+k);
 for(const k of ['financialOperations','proofsGenerated'])assert.equal(report[k],0);
 for(const n of names)assert.equal(report[n+'Sha256'],manifest.files[n],'native report input binding');
 assert.ok(Array.isArray(report.storage)&&report.storage.length>0&&report.storage.length<=16);
 for(const row of report.storage){exact(row,['slot','valueWord','proofNodes','storageMptVerified']);assert.match(row.slot,/^0x[0-9a-f]{64}$/);assert.match(row.valueWord,/^0x[0-9a-f]{64}$/);assert.equal(row.storageMptVerified,true);}
 return report;
}
export async function inspectStoredL1Evidence(options){
 const directory=resolve(options.directory),runtimeDirectory=resolve(options.runtimeDirectory),report=resolve(options.report);
 const manifest=await packet(directory,options.packetSha256);pin(options.driverSha256);
 const driver=await sealDriver({wallet:options.driver,walletSha256:options.driverSha256,runtimeDirectory});
 const locks=join(runtimeDirectory,'l1-evidence-locks');await mkdir(locks,{recursive:true,mode:0o700});
 const lease=join(locks,options.packetSha256);await mkdir(lease,{mode:0o700});let ownerSaved=false;
 try{
  await publishFile(join(lease,'owner.json'),JSON.stringify({schema:1,pid:process.pid,host:hostname(),packetSha256:options.packetSha256,driverSha256:driver.sha256,financialOperations:0})+'\n');ownerSaved=true;
  await publishFile(report+'.intent.json',JSON.stringify({schema:1,kind:'read-only-l1-inclusion-inspection-intent-v1',packetSha256:options.packetSha256,driverSha256:driver.sha256,financialOperations:0,canBroadcast:false})+'\n');
  await driver.check();
  const result=await runDurableSubmission(driver.file,[join(directory,'statement.json'),manifest.files.statement,join(directory,'header.json'),join(directory,'proof.json'),join(directory,'code.json'),report],{env:process.env,timeout:120000,logFile:report+'.native.log'});
  await driver.check();await packet(directory,options.packetSha256);
  const records=driverRecords(result.stdout);assert.equal(records.length,1,'exactly one owned native inclusion report required');
  const bytes=await readPublicBytes(report,65536),value=JSON.parse(bytes.toString('utf8'));
  assert.deepEqual(value,records[0],'stored report differs from owned native output');validateL1InclusionReport(value,manifest);
  await publishFile(report+'.receipt.json',JSON.stringify({schema:1,packetSha256:options.packetSha256,driverSha256:driver.sha256,reportSha256:sha256(bytes),ownedOutputSha256:sha256(Buffer.from(result.stdout)),canBroadcast:false,finalityVerified:false})+'\n');
  return value;
 }finally{if(ownerSaved)await unlink(join(lease,'owner.json'));await rmdir(lease);}
}
export async function inspectL1EvidencePair({proxy,implementation}){
 // Both reports must originate in these owned native executions. A caller's
 // JSON assertion cannot replace either account proof or install a verifier.
 const a=await inspectStoredL1Evidence(proxy),b=await inspectStoredL1Evidence(implementation);
 assert.equal(a.blockHash,b.blockHash,'paired accounts must use one fixed header');
 assert.equal(a.stateRoot,b.stateRoot,'paired state roots differ');
 const location='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
 const rows=a.storage.filter(row=>row.slot===location);assert.equal(rows.length,1,'exact EIP-1967 location required');
 assert.match(rows[0].valueWord,/^0x0{24}[a-f0-9]{40}$/,'implementation location exceeds address width');
 assert.equal(b.address.toLowerCase(),'0x'+rows[0].valueWord.slice(-40),'implementation location/account substitution');
 return {schema:1,kind:'paired-l1-inclusion-inspection-v1',blockHash:a.blockHash,stateRoot:a.stateRoot,proxyAddress:a.address,implementationAddress:b.address,implementationSlotMatchesAccount:true,proxyAccountAndCodeVerified:true,implementationAccountAndCodeVerified:true,headerConsensusVerified:false,runtimeSourceIdentityVerified:false,storageLayoutSemanticsVerified:false,finalityVerified:false,qualifiedRandomness:false,canSign:false,canBroadcast:false,financialOperations:0,proofsGenerated:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [directory,packetSha256,driver,driverSha256,runtimeDirectory,report,...extra]=process.argv.slice(2);
 if(!report||extra.length)throw Error('PACKET_DIRECTORY REVIEWED_PACKET_SHA256 NATIVE_DRIVER REVIEWED_DRIVER_SHA256 RUNTIME_DIRECTORY FRESH_REPORT required');
 inspectStoredL1Evidence({directory,packetSha256,driver,driverSha256,runtimeDirectory,report}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
