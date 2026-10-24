// Durable, explicitly owned QA instances. No old deployment or wallet policy
// mutation. Ordinary signers stay serialized; formal market UPSs use journals.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {read,save,ordinary,confirmUps} from '../../batching/admission/liveSupport.mjs';
import {LiveMarket} from '../../batching/admission/liveMarket.mjs';
import {publicState} from '../publicState.mjs';
import {sha256} from '../requestBinding.mjs';
import {sponsorCalls} from '../../batching/v2/client.mjs';
import {parseLosslessJson,FEE_ESCROW as F} from '../../amm/u124/client.mjs';
export const SDK='0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425';
export async function threeMarketCase(base,{toolManifest='TOOLS.json'}={}) {
 assert.match(toolManifest,/^TOOLS(?:-v[1-9][0-9]*)?\.json$/);
 const pin=read(join(base,'public/CASE.json')),tools=read(join(base,'public',toolManifest));
 assert.equal(pin.schema,1);assert.equal(tools.sdkManifestSha256,SDK);
 for(const tool of Object.values(tools.binaries))assert.equal(sha256(readFileSync(tool.file)),tool.sha256,'selected application changed');
 const config=join(base,'public/rpc.json'),env={PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'};
 const actors=Object.fromEntries(Object.entries(pin.actors).map(([name,a])=>[name,{...a,secret:join(base,'.secrets',a.secretName)}]));
 actors.trader=actors.buyer;
 const markets=['orderbook','bondingcurve','nftmarket'].map(kind=>{const build=join(base,'markets-v1',kind),registration=read(join(build,'live-registration.json'));return new LiveMarket({base,config,build,registration,policy:read(join(build,'bound/policy.json')),contracts:registration.contracts,ordinaryBinary:tools.binaries.ordinary.file,compactBinary:tools.binaries.compact.file,env,actors});});
 const bindings=new Map(markets.flatMap(m=>m.contracts).map(b=>[b.contract.contractId,b]));
 const s=await publicState(config);for(const a of Object.values(pin.actors))assert.deepEqual(await s.userIds(a.publicKeyHash),[a.id]);
 for(const [asset,issuer]of [[2483,pin.actors.bob.id],[2484,pin.actors.buyer.id]]){assert.equal(await s.slot(issuer,asset,3),1n,'QA token administration renounced');assert.equal(await s.slot(issuer,asset,33554445),18n,'canonical live decimals');}
 const user=async(actor,label,calls)=>{
  const a=actors[actor];assert.ok(a);const out=join(base,'attempts',label),input=join(base,'public',label+'.json');
  if(existsSync(out)){assert.ok(existsSync(join(out,'preflight.json')),'partial original ordinary attempt; reconcile, never replace');const p=parseLosslessJson(readFileSync(join(out,'preflight.json'),'utf8'));assert.equal(p.inputSha256,sha256(readFileSync(input)));assert.equal(p.core.new_user_leaf.user_id,BigInt(a.id));assert.equal(p.core.new_user_leaf.public_key,a.publicKeyHash);if(!existsSync(join(out,'included.json')))await confirmUps(config,out);return out;}
  assert.ok(!existsSync(input),'original input exists; inspect before replacement');
  return ordinary({base,config,binary:tools.binaries.ordinary.file,secret:a.secret,name:label,calls:typeof calls==='function'?await calls():calls,bindings,env});
 };
 const by=Object.fromEntries(markets.map(m=>[m.kind,m]));
 const at=(s,m,u,n,i=0)=>{const f=m.abi.contract.state.find(f=>f.name===n);assert.ok(f,n);return s.slot(u,m.id,f.offset+i);};
 const fund=(ms,label,purpose=2)=>user('sponsor',label,async()=>{const s=await publicState(config),calls=[];for(const m of ms)calls.push(...sponsorCalls({marketId:BigInt(m.id),abi:m.abi,vaultId:BigInt(m.vault),nonce:await at(s,m,actors.sponsor.id,'sponsor_nonce')+1n,purpose:BigInt(purpose),amount:purpose===1?2n*F:F}));return calls;});
 const baseline=read(join(base,'public/BASELINE-DRIVER.json'));assert.equal(sha256(readFileSync(baseline.file)),baseline.sha256);
 return {base,pin,tools,config,env,actors,markets,by,bindings,user,fund,at,baselineBinary:baseline.file,binary:tools.binaries.compact.file,binarySha256:tools.binaries.compact.sha256,ordinaryBinary:tools.binaries.ordinary.file,token:read(join(by.orderbook.build,'token-a.json')).abi,nft:read(join(by.nftmarket.build,'nft.json')).abi};
}
