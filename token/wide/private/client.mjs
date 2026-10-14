// Secrets remain in the caller's memory. Never log or persist bundles in public evidence.
import {randomBytes} from 'node:crypto';
import {encodeAmount,tokenCall} from '../arithmetic.mjs';
import {createTokenCallBuilder} from '../callBuilder.mjs';
import {NOTE_ROOT_SLOTS,PRIVATE_FINGERPRINT} from './constants.mjs';
const P=18446744069414584321n,EMPTY=()=>[0n,0n,0n,0n];
export function felt(value){if(typeof value==='number'){if(!Number.isSafeInteger(value))throw new TypeError('unsafe Number; use BigInt');value=BigInt(value);}if(typeof value!=='bigint'||value<0n||value>=P)throw new RangeError('canonical Felt required');return value;}
function hash(value){if(!Array.isArray(value)||value.length!==4)throw new TypeError('four Felt hash required');return value.map(felt);}
const same=(a,b)=>a.every((x,i)=>x===b[i]);
const isZero=a=>a.every(x=>x===0n);
const positive=value=>{const limbs=encodeAmount(value);if(value===0n)throw new RangeError('positive amount required');return limbs;};
export const emptyProof=()=>({siblings:Array.from({length:16},EMPTY),index:0});
function proof(value){if(!value||!Array.isArray(value.siblings)||value.siblings.length!==16||!Number.isSafeInteger(value.index)||value.index<0||value.index>=65536)throw new RangeError('16 siblings and a 16-bit proof index required');return [...value.siblings.flatMap(hash),value.index];}
export function createPrivateTokenCallBuilder(contractId){
 const pub=createTokenCallBuilder(contractId);
 if(contractId>=16777216)throw new RangeError('contract ID exceeds proof tree capacity');
 return {...pub,
  privateTransfer:(receiver,value,secrets)=>{const limbs=positive(value);if(!Array.isArray(secrets)||secrets.length!==2)throw new TypeError('two note secret hashes required');return tokenCall(contractId,'private_transfer',[...hash(receiver),...limbs,...secrets.flatMap(hash)]);},
  privateClaim:({receiver,amount,userTreeRoot,checkpointId,random0,random1,nullifiers,proofs})=>{
   const limbs=positive(amount);if(!Array.isArray(nullifiers)||nullifiers.length!==2||!Array.isArray(proofs)||proofs.length!==2)throw new TypeError('two nullifiers and two proofs required');
   const ns=nullifiers.map(hash),ps=proofs.map(proof);
   for(let i=0;i<2;i++)if(limbs[i]===0n&&(!isZero(ns[i])||ps[i].some(x=>x!==0n&&x!==0)))throw new RangeError('zero limb must use an empty proof');
   if(limbs.every(x=>x!==0n)&&same(ns[0],ns[1]))throw new RangeError('distinct nullifiers required');
   return tokenCall(contractId,'private_claim',[...hash(receiver),...limbs,...hash(userTreeRoot),felt(checkpointId),felt(random0),felt(random1),...ns.flat(),...ps.flat()]);
  }
 };
}
function randomFelt(){for(;;){const value=randomBytes(8).readBigUInt64LE();if(value<P)return value;}}
// hashProvider must implement the SDK's Poseidon hashNoPad and twoToOne, returning BigInt hashes.
export async function preparePrivateTransfer({contractId,recipient,amount,hashProvider}){
 if(!Number.isSafeInteger(recipient)||recipient<1||recipient>=16777216)throw new RangeError('invalid recipient');
 const limbs=positive(amount),random0=randomFelt(),random1=randomFelt();
 const receiver=hash(await hashProvider.hashNoPad([BigInt(recipient),1337n,random0,random1]));
 const notes=[],secretHashes=[EMPTY(),EMPTY()];
 for(let limb=0;limb<2;limb++){
  if(limbs[limb]===0n)continue;
  const nullifierSecret=Array.from({length:4},randomFelt),noteSecret=Array.from({length:4},randomFelt);
  const nullifier=hash(await hashProvider.hashNoPad(nullifierSecret));
  const noteSecretHash=hash(await hashProvider.hashNoPad([...nullifierSecret,...noteSecret]));secretHashes[limb]=noteSecretHash;
  const inner=hash(await hashProvider.twoToOne(receiver,[limbs[limb],0n,0n,0n]));
  const commitment=hash(await hashProvider.twoToOne(inner,noteSecretHash));
  notes.push({limb,amount:limbs[limb],noteRootSlot:NOTE_ROOT_SLOTS[limb],nullifierSecret,noteSecret,nullifier,commitment});
 }
 if(notes.length===2&&same(notes[0].nullifier,notes[1].nullifier))throw new Error('nullifier collision; generate fresh notes');
 const call=createPrivateTokenCallBuilder(contractId).privateTransfer(receiver,amount,secretHashes);
 return {call,bundle:{contractId,recipient,amount,receiver,random0,random1,notes}};
}
// proveNote binds the requested commitment to a coherent confirmed checkpoint.
// Append ALL proofs first, then fetch BOTH paths against the final session root.
export async function preparePrivateClaim({bundle,userTreeRoot,checkpointId,hashProvider,proveNote,addSessionProof,getSessionPath}){
 const {contractId,recipient,amount,receiver,random0,random1}=bundle;
 createPrivateTokenCallBuilder(contractId);
 const limbs=positive(amount),root=hash(userTreeRoot),cp=felt(checkpointId);
 const expectedReceiver=hash(await hashProvider.hashNoPad([felt(recipient),1337n,felt(random0),felt(random1)]));
 if(!same(hash(receiver),expectedReceiver))throw new Error('bundle receiver mismatch');
 const seen=new Set(),indices=[],ns=[EMPTY(),EMPTY()],proofs=[emptyProof(),emptyProof()];
 for(const note of bundle.notes){
  const limb=note.limb;if(![0,1].includes(limb)||seen.has(limb)||limbs[limb]===0n||felt(note.amount)!==limbs[limb]||note.noteRootSlot!==NOTE_ROOT_SLOTS[limb])throw new Error('invalid denomination note');seen.add(limb);
  const nullifier=hash(await hashProvider.hashNoPad(hash(note.nullifierSecret)));
  if(!same(nullifier,hash(note.nullifier)))throw new Error('bundle nullifier mismatch');
  const secretHash=hash(await hashProvider.hashNoPad([...hash(note.nullifierSecret),...hash(note.noteSecret)]));
  const commitment=hash(await hashProvider.twoToOne(hash(await hashProvider.twoToOne(receiver,[limbs[limb],0n,0n,0n])),secretHash));
  if(!same(commitment,hash(note.commitment)))throw new Error('bundle commitment mismatch');
  const pi=hash(await hashProvider.hashNoPad([...receiver,limbs[limb],...root,cp,BigInt(NOTE_ROOT_SLOTS[limb]),BigInt(contractId),...nullifier]));
  const inclusion=await proveNote({...note,contractId,receiver,userTreeRoot:root,checkpointId:cp});
  if(!same(hash(inclusion.publicInputs),pi)||!same(hash(inclusion.fingerprint),PRIVATE_FINGERPRINT.map(BigInt)))throw new Error('native note proof binding mismatch');
  indices.push({limb,index:await addSessionProof(inclusion),pi});ns[limb]=nullifier;
 }
 for(let i=0;i<2;i++)if((limbs[i]!==0n)!==seen.has(i))throw new Error('missing denomination note');
 let sessionRoot;
 for(const {limb,index,pi} of indices){
  const path=await getSessionPath(index);if(path.index!==index)throw new Error('session index mismatch');proof(path);
  let current=hash(await hashProvider.twoToOne(PRIVATE_FINGERPRINT.map(BigInt),pi));
  for(let level=0;level<16;level++){const sibling=hash(path.siblings[level]);current=hash(await hashProvider.twoToOne((index>>level)&1?sibling:current,(index>>level)&1?current:sibling));}
  if(!same(current,hash(path.root))||(sessionRoot&&!same(sessionRoot,current)))throw new Error('session paths must share the final authenticated root');sessionRoot=current;proofs[limb]=path;
 }
 return {call:createPrivateTokenCallBuilder(contractId).privateClaim({receiver,amount,userTreeRoot:root,checkpointId:cp,random0,random1,nullifiers:ns,proofs}),sessionRoot};
}
