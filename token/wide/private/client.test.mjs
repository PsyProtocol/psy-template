import test from 'node:test';import assert from 'node:assert/strict';
import {createPrivateTokenCallBuilder,preparePrivateTransfer,preparePrivateClaim,emptyProof} from './client.mjs';
import {MAX_AMOUNT,RADIX,losslessJson} from '../arithmetic.mjs';
import {PRIVATE_METHOD_INPUTS,checkPrivateTokenArtifact} from './artifactGate.mjs';
import {NOTE_ROOT_SLOTS,PRIVATE_FINGERPRINT} from './constants.mjs';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const Z=[0n,0n,0n,0n],H=[1n,2n,3n,4n];
// A deterministic non-Poseidon hash tests sequencing/encoding only; Rust tests use real Poseidon proofs.
const fakeHash={hashNoPad:async values=>{const b=createHash('sha256').update(values.join(',')).digest();return Array.from({length:4},(_,i)=>b.readBigUInt64LE(i*8)%18446744069414584321n);},twoToOne:async(a,b)=>fakeHash.hashNoPad([...a,...b])};
test('private builders preserve all 124 bits and encode the 14/151-Felt ABI',()=>{
 const b=createPrivateTokenCallBuilder(42),p={siblings:Array.from({length:16},()=>H),index:3};
 const t=b.privateTransfer(H,MAX_AMOUNT,[H,H]);assert.equal(t.inputs.length,PRIVATE_METHOD_INPUTS.private_transfer);assert.deepEqual(t.inputs.slice(4,6),[RADIX-1n,RADIX-1n]);
 const c=b.privateClaim({receiver:H,amount:MAX_AMOUNT,userTreeRoot:H,checkpointId:100n,random0:1n,random1:2n,nullifiers:[H,[2n,3n,4n,5n]],proofs:[p,p]});assert.equal(c.inputs.length,151);assert.match(losslessJson(c),/4611686018427387903/);assert.equal(b.transfer(200,1n).method_name,'transfer');
});
test('empty limbs, indices, duplicate nullifiers and unsafe hashes are rejected',()=>{
 const b=createPrivateTokenCallBuilder(42),base={receiver:H,amount:1n,userTreeRoot:H,checkpointId:100n,random0:1n,random1:2n,nullifiers:[H,Z],proofs:[emptyProof(),emptyProof()]};
 assert.equal(b.privateClaim(base).inputs.length,151);
 assert.throws(()=>b.privateTransfer(H,0n,[H,H]));assert.throws(()=>b.privateTransfer([Number(1n<<62n),0n,0n,0n],1n,[H,H]));
 assert.throws(()=>b.privateClaim({...base,nullifiers:[H,H]}));assert.throws(()=>b.privateClaim({...base,amount:RADIX+1n,nullifiers:[H,H]}));
 assert.throws(()=>b.privateClaim({...base,proofs:[{...emptyProof(),index:65536},emptyProof()]}));assert.throws(()=>createPrivateTokenCallBuilder(16777216));
});
async function fixture(amount){
 const {bundle,call}=await preparePrivateTransfer({contractId:42,recipient:300,amount,hashProvider:fakeHash});
 const leaves=[],events=[];const root=H,cp=100n;
 const proveNote=async n=>({fingerprint:PRIVATE_FINGERPRINT.map(BigInt),publicInputs:await fakeHash.hashNoPad([...bundle.receiver,n.amount,...root,cp,BigInt(n.noteRootSlot),42n,...n.nullifier])});
 const addSessionProof=async p=>{events.push('add');leaves.push(await fakeHash.twoToOne(p.fingerprint,p.publicInputs));return leaves.length-1;};
 const getSessionPath=async index=>{events.push('path');let current=leaves[index];let zero=Z;const siblings=[];for(let i=0;i<16;i++){const sibling=i===0?(leaves[1-index]??zero):zero;siblings.push(sibling);current=await fakeHash.twoToOne((index>>i)&1?sibling:current,(index>>i)&1?current:sibling);zero=await fakeHash.twoToOne(zero,zero);}return {index,siblings,root:current};};
 return {bundle,call,root,cp,proveNote,addSessionProof,getSessionPath,events};
}
test('both native proofs are added before paths are fetched from the final session',async()=>{
 const x=await fixture(10n**27n+7n);
 const result=await preparePrivateClaim({bundle:x.bundle,userTreeRoot:x.root,checkpointId:x.cp,hashProvider:fakeHash,proveNote:x.proveNote,addSessionProof:x.addSessionProof,getSessionPath:x.getSessionPath});
 assert.deepEqual(x.events,['add','add','path','path']);assert.equal(result.call.inputs.length,151);assert.deepEqual(x.bundle.notes.map(n=>n.noteRootSlot),NOTE_ROOT_SLOTS);assert.notDeepEqual(x.bundle.notes[0].nullifier,x.bundle.notes[1].nullifier);
});
test('single-limb notes use the fixed denomination even when session index is zero',async()=>{
 for(const amount of [1n,RADIX]){const x=await fixture(amount);const r=await preparePrivateClaim({bundle:x.bundle,userTreeRoot:x.root,checkpointId:x.cp,hashProvider:fakeHash,proveNote:x.proveNote,addSessionProof:x.addSessionProof,getSessionPath:x.getSessionPath});assert.equal(r.call.inputs.length,151);assert.equal(x.bundle.notes.length,1);assert.equal(x.bundle.notes[0].limb,amount===1n?0:1);assert.deepEqual(x.events,['add','path']);}
});
test('incorrect proof public inputs and stale session paths cannot produce a claim',async()=>{
 const x=await fixture(RADIX+1n),args={bundle:x.bundle,userTreeRoot:x.root,checkpointId:x.cp,hashProvider:fakeHash,proveNote:x.proveNote,addSessionProof:x.addSessionProof,getSessionPath:x.getSessionPath};
 await assert.rejects(preparePrivateClaim({...args,proveNote:async()=>({fingerprint:PRIVATE_FINGERPRINT.map(BigInt),publicInputs:Z})}),/binding mismatch/);
 await assert.rejects(preparePrivateClaim({...args,getSessionPath:async index=>({...await x.getSessionPath(index),root:Z})}),/final authenticated root/);
});
test('compiled artifact gate rejects changed denomination layout or verifier fingerprint',{skip:!process.env.TOKEN_WIDE_PRIVATE_ARTIFACT},()=>{
 const path=process.env.TOKEN_WIDE_PRIVATE_ARTIFACT;
 const a=JSON.parse(readFileSync(path));assert.equal(checkPrivateTokenArtifact(a,{fingerprint:PRIVATE_FINGERPRINT}).valid,true);
 const bad=structuredClone(a);bad.abi.contract.state.find(f=>f.name==='private_note_root_high').offset-=4;assert.throws(()=>checkPrivateTokenArtifact(bad));assert.throws(()=>checkPrivateTokenArtifact(a,{fingerprint:[0,0,0,0]}));
});
