// Real public WASM verification, not an extension approval or network claim.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
const [modulePath, fixturePath, output] = process.argv.slice(2);
assert.ok(modulePath && fixturePath && output, 'WASM module, public fixtures and fresh report required');
const native = createRequire(import.meta.url)(resolve(modulePath));
const bytes = readFileSync(join(fixturePath,'private-note-pack.json'));
const packet = JSON.parse(readFileSync(join(fixturePath,'packet.json')));
const context = JSON.parse(readFileSync(join(fixturePath,'context.json')));
const identity = JSON.parse(native.private_note_identity());
assert.equal(identity.packSha256,createHash('sha256').update(bytes).digest('hex'));
assert.equal(identity.available,true);
assert.equal(identity.claimAuthorized,false);
const verify=(p,c=context)=>JSON.parse(native.verify_private_ft_notes(JSON.stringify(p),JSON.stringify(c)));
const report=verify(packet);
assert.equal(report.verified,true);assert.equal(report.proofCount,2);
assert.equal(report.amount,(BigInt(packet.amount[0])+(BigInt(packet.amount[1])<<62n)).toString());
assert.equal(report.claimAuthorized,false);assert.equal(report.finalityVerified,false);
for(let i=0;i<2;i++){
 const p=structuredClone(packet);p.amount[i]='0';p.nullifiers[i]=['0','0','0','0'];p.proofs[i]=null;
 assert.equal(verify(p).proofCount,1);
}
let refused=0;
for(const key of ['owner','amount','user_tree_root','nullifiers','checkpoint','contract_id','proofs','verifier_b64']){
 const p=structuredClone(packet);
 if(['owner','amount','user_tree_root'].includes(key))p[key][0]='1';
 else if(key==='nullifiers')p.nullifiers[0][0]='1';
 else if(key==='proofs')p.proofs.reverse();
 else p[key]=key==='verifier_b64'?'page-supplied':'1';
 assert.throws(()=>verify(p));refused++;
}
for(const key of ['network_magic','chain_root_at_1','owner','checkpoint','contract_id','user_tree_root']){
 const c=structuredClone(context);if(['owner','user_tree_root'].includes(key))c[key][0]='1';else c[key]='0';
 assert.throws(()=>verify(packet,c));refused++;
}
const p=structuredClone(packet);p.proofs[0]=Buffer.concat([Buffer.from(p.proofs[0],'base64'),Buffer.from([0])]).toString('base64');
assert.throws(()=>verify(p));refused++;
writeFileSync(output,JSON.stringify({schema:1,scope:'Actual public WASM denomination-note verification; synthetic checkpoint only',validPackets:3,rejections:refused,packSha256:identity.packSha256,newProofs:0,financialOperations:0,extensionAcceptance:false,claimAuthorized:false,finalityVerified:false},null,2)+'\n',{flag:'wx'});
console.log('Actual WASM private-note verification: 3 accepted, '+refused+' refused; no signing or broadcast.');
