import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {sha256} from './requestBinding.mjs';
import {storeL1EvidencePacket,inspectStoredL1Evidence,validateL1InclusionReport} from './l1Evidence.mjs';

test('inclusion report cannot promote finality or change exact native inputs',()=>{
 const files=Object.fromEntries(['statement','header','proof','code'].map(n=>[n,'a'.repeat(64)]));
 const r={schema:1,kind:'execution-state-inclusion-inspection-v1',sdkCommit:'c92880c8b6e2c8d392f19368bc8801a2584fd427',chainIdClaim:11155111,blockHash:'0x'+'0'.repeat(64),stateRoot:'0x'+'1'.repeat(64),address:'0x'+'2'.repeat(40),headerProfile:'ethereum-amsterdam-23-v1',executionHeaderHashVerified:true,legacy21FieldHash:'0x'+'3'.repeat(64),legacy21FieldHashMatches:false,accountMptVerified:true,runtimeCodeHashVerified:true,runtimeCodeHash:'0x'+'4'.repeat(64),storage:[{slot:'0x'+'0'.repeat(64),valueWord:'0x'+'1'.repeat(64),proofNodes:1,storageMptVerified:true}],headerConsensusVerified:false,runtimeSourceIdentityVerified:false,storageLayoutSemanticsVerified:false,chainInstanceAuthenticated:false,finalityVerified:false,seedSecrecyAuthenticated:false,qualifiedRandomness:false,originalAnchorReplaced:false,canSign:false,canBroadcast:false,proofsGenerated:0,financialOperations:0,inspectionPassed:true,...Object.fromEntries(Object.entries(files).map(([n,v])=>[n+'Sha256',v]))};
 assert.equal(validateL1InclusionReport(r,{files}),r);
 for(const field of ['headerConsensusVerified','finalityVerified','qualifiedRandomness','canSign','canBroadcast','originalAnchorReplaced'])assert.throws(()=>validateL1InclusionReport({...r,[field]:true},{files}));
 assert.throws(()=>validateL1InclusionReport({...r,proofSha256:'b'.repeat(64)},{files}));
 assert.throws(()=>validateL1InclusionReport({...r,externalVerifier:'https://example.invalid'},{files}));
});

test('stored public packet is immutable and restart detects changed bytes before native work',async()=>{
 const root=await mkdtemp(join(tmpdir(),'psy-l1-evidence-test-'));
 try{
  const files={};for(const name of ['statement','header','proof','code']){files[name]=join(root,name+'.json');await writeFile(files[name],JSON.stringify({testOnly:name}));}
  const statementSha256=sha256(await readFile(files.statement)),directory=join(root,'packet');
  const saved=await storeL1EvidencePacket({directory,statementSha256,files});
  await assert.rejects(storeL1EvidencePacket({directory,statementSha256,files}),/EEXIST/);
  await writeFile(join(directory,'proof.json'),'changed');
  await assert.rejects(inspectStoredL1Evidence({directory,packetSha256:saved.packetSha256,runtimeDirectory:join(root,'runtime'),report:join(root,'report.json')}),/stored inclusion packet changed/);
  const partial=join(root,'partial');await mkdir(partial);
  await assert.rejects(inspectStoredL1Evidence({directory:partial,packetSha256:saved.packetSha256,runtimeDirectory:join(root,'runtime'),report:join(root,'partial-report.json')}),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true});}
});
