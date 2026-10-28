// A candidate circuit statement, not a chain seal, entropy certificate or order.
// Hash limbs use SDK QHashOut display order: least-significant limb is last.
import assert from 'node:assert/strict';
import {requireQualifiedRandomSource} from './sourceGate.mjs';
const P=0xffffffff00000001n,MAX62=(1n<<62n)-1n;
const magic='1384803358401154921',zero='0'.repeat(64);
function object(value,keys){assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),'exact candidate fields required');}
function number(value,max,positive=true){assert.equal(typeof value,'string','canonical integer string required');assert.match(value,/^(0|[1-9]\d*)$/);const n=BigInt(value);assert.ok(n<=max&&(!positive||n>0n),'integer bound');return value;}
export function hashLimbs(hex){assert.equal(typeof hex,'string');assert.match(hex,/^[0-9a-f]{64}$/);const limbs=Array.from({length:4},(_,i)=>BigInt('0x'+hex.slice(48-16*i,64-16*i)));assert.ok(limbs.every(x=>x<P),'canonical Goldilocks hash');return limbs.map(String);}
function hash(value){assert.notEqual(value,zero,'nonzero scope hash required');return hashLimbs(value);}
const scalarKeys=['epoch','cutoff','sealByCheckpoint','drawCheckpoint','settleUntil','recoveryAt'];
const rootKeys=['sourceId','chainRootAt1','codeRoot','layoutRoot','functionRoot','keyFingerprint','publicKeyHash','queueRoot','batchRoot'];
const keys=['version','networkMagic','market','marketId','vaultId',...scalarKeys,'round','maxFee',...rootKeys,'members'];
export function encodeCandidateStatement(input){
 object(input,keys);assert.equal(input.version,1);assert.equal(input.networkMagic,magic);
 assert.ok(['amm','bondingcurve'].includes(input.market),'random candidate is only AMM or Curve');
 const v={...input};for(const key of scalarKeys)number(v[key],0xffffffffn);
 for(const key of ['marketId','vaultId'])number(v[key],0xffffffn);
 assert.notEqual(v.marketId,'0');assert.notEqual(v.vaultId,'0');
 number(v.round,MAX62);number(v.maxFee,MAX62);
 assert.ok(BigInt(v.cutoff)<BigInt(v.sealByCheckpoint)&&BigInt(v.sealByCheckpoint)<BigInt(v.drawCheckpoint),'actual seal inclusion must precede draw');
 assert.ok(BigInt(v.drawCheckpoint)<BigInt(v.settleUntil)&&BigInt(v.settleUntil)<BigInt(v.recoveryAt),'fixed execution and recovery bounds');
 assert.ok(Array.isArray(v.members)&&v.members.length>=1&&v.members.length<=4,'one through four members');
 let previous=0n;const members=v.members.map(m=>{object(m,['owner','nonce','termsRoot']);number(m.owner,0xffffffn);number(m.nonce,MAX62);assert.ok(BigInt(m.owner)>previous&&m.owner!==v.vaultId,'canonical unique member set');previous=BigInt(m.owner);hash(m.termsRoot);return Object.freeze({...m});});
 const encoded=['1',magic,v.market==='amm'?'1':'2',v.marketId,v.vaultId,v.epoch,v.cutoff,v.sealByCheckpoint,v.drawCheckpoint,v.round,v.settleUntil,v.recoveryAt,v.maxFee,String(members.length)];
 for(const key of rootKeys)encoded.push(...hash(v[key]));
 for(let i=0;i<4;i++)encoded.push(...(members[i]?[members[i].owner,members[i].nonce,...hashLimbs(members[i].termsRoot)]:Array(6).fill('0')));
 assert.equal(encoded.length,74);
 return Object.freeze({schema:1,scope:'candidate statement only; no chain seal or authorization',snapshot:Object.freeze({...v,members:Object.freeze(members)}),fields:Object.freeze(encoded)});
}
// Validate a future wire envelope, then reject execution. No caller-controlled
// verifier, success flag, resource URL, signature or Merkle path enables it.
export function validateBeaconEnvelope(candidate,envelope){
 const c=encodeCandidateStatement(candidate).snapshot;
 object(envelope,['format','sourceId','chainRootAt1','round','drawCheckpoint','sealIncludedCheckpoint','seed','beaconProof','sealInclusionProof','finalityProof']);
 assert.equal(envelope.format,'psy-market-beacon-certificate-v1');
 for(const key of ['sourceId','chainRootAt1','round','drawCheckpoint'])assert.equal(envelope[key],c[key],'beacon request identity changed');
 number(envelope.sealIncludedCheckpoint,0xffffffffn);
 assert.ok(BigInt(envelope.sealIncludedCheckpoint)>BigInt(c.cutoff)&&BigInt(envelope.sealIncludedCheckpoint)<=BigInt(c.sealByCheckpoint),'late or substituted seal inclusion');
 hashLimbs(envelope.seed);
 for(const key of ['beaconProof','sealInclusionProof','finalityProof']){const bytes=envelope[key];assert.equal(typeof bytes,'string');assert.ok(bytes.length>0&&bytes.length<=2000000);assert.match(bytes,/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);}
 return Object.freeze({...envelope,assurance:'unverified envelope; never execution authorization'});
}
export function authorizeRandomBatch(candidate,envelope){validateBeaconEnvelope(candidate,envelope);requireQualifiedRandomSource();}
