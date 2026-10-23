// Reviewable client intent boundary. Hashing is NOT a signature or an on-chain
// authorization proof; the dedicated controller/key must enforce these terms.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {integer,user,encodeAmount,swapQuote} from '../amm/u124/client.mjs';
const exactKeys=(o,keys)=>{assert.ok(o&&[Object.prototype,null].includes(Object.getPrototypeOf(o)),'plain record required');assert.deepEqual(Object.keys(o).sort(),[...keys].sort(),'unknown or missing intent fields');};
const hash=x=>{assert.match(x,/^[0-9a-f]{64}$/,'canonical hash required');return x;};
const positive=(n,max)=>{integer(n,max);assert.ok(n>0n,'positive integer required');return n;};
const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
function canonical(x){
 if(typeof x==='bigint')return ['u',x.toString()];
 if(typeof x==='string'||typeof x==='boolean'||x===null)return x;
 if(typeof x==='number'){assert.ok(Number.isSafeInteger(x)&&x>=0,'exact metadata integer');return ['n',String(x)];}
 if(Array.isArray(x))return ['a',x.map(canonical)];
 assert.ok(x&&[Object.prototype,null].includes(Object.getPrototypeOf(x)),'canonical record');
 return ['o',Object.keys(x).sort().map(k=>[k,canonical(x[k])])];
}
export const commitment=(domain,value)=>createHash('sha256').update(domain+'\0'+JSON.stringify(canonical(value))).digest('hex');
const decimals=d=>{assert.ok(Number.isInteger(d)&&d>=0&&d<=18,'verified U124 FT decimals must be 0..18');return d;};
export function units(text,d){
 decimals(d);assert.equal(typeof text,'string');assert.ok(text.length<=128,'decimal input length');assert.match(text,/^(0|[1-9]\d*)(?:\.\d+)?$/,'unsigned decimal string required');
 const [whole,fraction='']=text.split('.');assert.ok(fraction.length<=d,'excess fractional precision');
 const n=BigInt(whole)*10n**BigInt(d)+BigInt((fraction+'0'.repeat(d)).slice(0,d)||'0');integer(n);return n;
}
function asset(a){exactKeys(a,['id','decimals','amount']);user(a.id);decimals(a.decimals);positive(a.amount);encodeAmount(a.amount);}
export function createIntent(input){
 exactKeys(input,['version','domainHash','sdkManifestHash','registryHash','owner','nonce','receiver','expiresAtCheckpoint','maxNativeFees','input','output','markets','execution']);
 const v=structuredClone(input);assert.equal(v.version,1);for(const k of ['domainHash','sdkManifestHash','registryHash'])hash(v[k]);
 user(v.owner);user(v.receiver);assert.equal(v.receiver,v.owner,'v1 requires owner as final receiver');positive(v.nonce,(1n<<62n)-1n);positive(v.expiresAtCheckpoint,(1n<<32n)-1n);positive(v.maxNativeFees,(1n<<62n)-1n);
 exactKeys(v.execution,['controllerId','vaultId','fingerprint','publicKeyHash','codeRoot','layoutRoot','functionTreeRoot','stateTreeHeight','layoutFieldCount','layoutSlotCount']);
 user(v.execution.controllerId);user(v.execution.vaultId);assert.notEqual(v.execution.vaultId,v.owner,'dedicated execution account required');for(const k of ['fingerprint','publicKeyHash','codeRoot','layoutRoot','functionTreeRoot'])hash(v.execution[k]);positive(v.execution.stateTreeHeight,32n);integer(v.execution.layoutFieldCount,(1n<<32n)-1n);integer(v.execution.layoutSlotCount,(1n<<32n)-1n);
 asset(v.input);asset(v.output);assert.ok(Array.isArray(v.markets)&&v.markets.length===2);v.markets.forEach(user);assert.notEqual(v.markets[0],v.markets[1],'distinct market instances');
 return freeze({id:commitment('psy-composition-intent-v1',v),terms:v,atomic:false,authorization:'unsigned-client-intent'});
}
// Explicit immutable registry closure. Its digest must be approved by the user
// and later pinned by the controller/key; ABI equality alone is insufficient.
export function createRegistry(input){
 exactKeys(input,['domainHash','sdkManifestHash','markets']);hash(input.domainHash);hash(input.sdkManifestHash);assert.ok(Array.isArray(input.markets)&&input.markets.length===2);
 const v=structuredClone(input),ids=new Set(),vaults=new Set();
 for(const m of v.markets){
  exactKeys(m,['kind','marketId','vaultId','fingerprint','publicKeyHash','dependencies','assets']);assert.equal(m.kind,'amm');user(m.marketId);user(m.vaultId);assert.ok(!ids.has(String(m.marketId))&&!vaults.has(String(m.vaultId)),'distinct markets and vaults');ids.add(String(m.marketId));vaults.add(String(m.vaultId));hash(m.fingerprint);hash(m.publicKeyHash);
  assert.ok(Array.isArray(m.assets)&&m.assets.length===2);m.assets.forEach(a=>{exactKeys(a,['id','decimals']);user(a.id);decimals(a.decimals);});assert.notEqual(m.assets[0].id,m.assets[1].id);
  assert.ok(Array.isArray(m.dependencies));const required=[0n,m.marketId,...m.assets.map(a=>a.id)].sort((a,b)=>a<b?-1:a>b?1:0);
  assert.equal(new Set(required.map(String)).size,4,'market and assets must be distinct contracts');
  const actual=m.dependencies.map(d=>{exactKeys(d,['contractId','codeRoot','layoutRoot','functionTreeRoot','stateTreeHeight','layoutFieldCount','layoutSlotCount']);integer(d.contractId,16777215n);for(const k of ['codeRoot','layoutRoot','functionTreeRoot'])hash(d[k]);positive(d.stateTreeHeight,32n);integer(d.layoutFieldCount,(1n<<32n)-1n);integer(d.layoutSlotCount,(1n<<32n)-1n);return d.contractId;}).sort((a,b)=>a<b?-1:a>b?1:0);
  assert.deepEqual(actual,required,'exact complete dependency closure');m.dependencies.sort((a,b)=>a.contractId<b.contractId?-1:a.contractId>b.contractId?1:0);
 }
 v.markets.sort((a,b)=>a.marketId<b.marketId?-1:1);
 return freeze({hash:commitment('psy-composition-registry-v1',v),value:v});
}
export function planIntent({intent,registry,snapshots,checkpoint}){
 const i=createIntent(intent.terms),r=createRegistry(registry.value);assert.equal(i.id,intent.id,'intent substitution');assert.equal(r.hash,registry.hash,'registry substitution');assert.equal(i.terms.registryHash,r.hash);assert.ok(!r.value.markets.some(m=>m.vaultId===i.terms.execution.vaultId||m.marketId===i.terms.execution.controllerId),'dedicated composition scope');for(const k of ['domainHash','sdkManifestHash'])assert.equal(i.terms[k],r.value[k]);integer(checkpoint,(1n<<32n)-1n);assert.ok(checkpoint<i.terms.expiresAtCheckpoint,'intent expired');
 assert.ok(Array.isArray(snapshots)&&snapshots.length===2);let amount=i.terms.input.amount,assetIn=i.terms.input.id,assetDecimals=i.terms.input.decimals;const steps=[];
 for(const [j,marketId]of i.terms.markets.entries()){
  const m=r.value.markets.find(m=>m.marketId===marketId);assert.ok(m,'market not allowed');const side=m.assets.findIndex(a=>a.id===assetIn);assert.ok(side>=0,'route asset mismatch');assert.equal(m.assets[side].decimals,assetDecimals,'asset decimals mismatch');
  const s=snapshots[j];exactKeys(s,['marketId','vaultId','checkpoint','stateRoot','reserveA','reserveB']);assert.equal(s.marketId,marketId);assert.equal(s.vaultId,m.vaultId);assert.equal(s.checkpoint,checkpoint,'one snapshot checkpoint');hash(s.stateRoot);
  const reserves=side===0?[s.reserveA,s.reserveB]:[s.reserveB,s.reserveA],output=swapQuote(amount,...reserves);assert.ok(output>0n,'zero floor');const out=m.assets[1-side];
  steps.push({marketId,vaultId:m.vaultId,side,inputAsset:assetIn,input:amount,outputAsset:out.id,output,sourceRoot:s.stateRoot,requiresConfirmedClaimBeforeNextStep:true});amount=output;assetIn=out.id;assetDecimals=out.decimals;
 }
 assert.equal(assetIn,i.terms.output.id,'final asset mismatch');assert.equal(assetDecimals,i.terms.output.decimals,'final decimals mismatch');assert.ok(amount>=i.terms.output.amount,'slippage floor');
 return freeze({intentId:i.id,registryHash:r.hash,registry:r,snapshots:structuredClone(snapshots),sourceCheckpoint:checkpoint,steps,finalOutput:amount,receiver:i.terms.receiver,atomic:false,invokeSync:false,authorization:'quote-only-controller-and-SD-key-not-yet-proved',sourceAuthenticated:false,compensation:'return input before first trade, intermediate after first trade, output after second; executed trades are irreversible'});
}
// Recompute the complete advisory plan rather than trusting its intentId or a
// freshly recomputed local plan hash. Source authentication remains a separate
// mandatory gate; self-consistent supplied reserves are still only quotes.
export function validatePlan(intent,plan){
 const expected=planIntent({intent,registry:plan.registry,snapshots:plan.snapshots,checkpoint:plan.sourceCheckpoint});
 assert.deepEqual(plan,expected,'composition plan differs from committed registry and intent');return expected;
}
