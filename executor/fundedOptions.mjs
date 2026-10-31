import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const paths=['rpcConfig','wallet','abi','driverConfig','runtimeDirectory','policy','dependencyBindings','streamTask'];
const hashes=['publicKeyHash','fingerprint','codeRoot','layoutRoot','walletSha256'];
export function validateFundedOptions(input,base){
 const allowed=new Set(['profile','kind','name','network','contractId','vaultId',...paths,...hashes,'assetA','assetB','testnetProfile','proverThreads','intervalMs','receiptMaxPages']);
 for(const key of Object.keys(input))assert.ok(allowed.has(key),'unsupported funded stream option: '+key);
 const o={...input};assert.equal(o.profile,'source-funded-v14');assert.equal(o.network,'testnet');assert.equal(o.testnetProfile,'mainnet-beta-20261027-v1');assert.ok(['amm','bondingcurve'].includes(o.kind));
 for(const key of ['contractId','vaultId'])assert.ok(Number.isSafeInteger(o[key])&&o[key]>= (key==='contractId'?5:1)&&o[key]<2**24,key);
 for(const key of hashes)assert.match(o[key]??'',/^[a-f0-9]{64}$/);
 for(const key of paths){assert.ok(typeof o[key]==='string'&&o[key]);o[key]=resolve(base,o[key]);}
 for(const key of ['assetA','assetB']){const a=o[key];assert.ok(a&&Object.keys(a).every(k=>['contractId','codeRoot','layoutRoot','abi'].includes(k)));
  assert.ok(Number.isSafeInteger(a.contractId)&&a.contractId>=5&&a.contractId<2**24&&a.contractId!==o.contractId);
  assert.match(a.codeRoot??'',/^[a-f0-9]{64}$/);assert.match(a.layoutRoot??'',/^[a-f0-9]{64}$/);assert.ok(typeof a.abi==='string'&&a.abi);o[key]={...a,abi:resolve(base,a.abi)};
 }assert.notEqual(o.assetA.contractId,o.assetB.contractId);
 o.proverThreads??=2;assert.ok(Number.isSafeInteger(o.proverThreads)&&o.proverThreads>=1&&o.proverThreads<=32);
 o.intervalMs??=10000;assert.ok(Number.isSafeInteger(o.intervalMs)&&o.intervalMs>=1000&&o.intervalMs<=3600000);
 o.receiptMaxPages??=20;assert.ok(Number.isSafeInteger(o.receiptMaxPages)&&o.receiptMaxPages>=1&&o.receiptMaxPages<=100);
 o.users=[];return o;
}
