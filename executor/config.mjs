import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

const kinds=['amm','orderbook','bondingcurve','launchamm','nftmarket'];
const paths=['rpcConfig','wallet','abi','driverConfig','runtimeDirectory','usersFile','policy'];
const allowed=new Set(['kind','name','network','contractId','vaultId','publicKeyHash','fingerprint','codeRoot','layoutRoot','walletSha256',
  ...paths,'users','intervalMs','receiptMaxPages','cli','pool','launch','automaticInitialize','automaticGraduation','profile','assetA','assetB','collection','paymentToken']);
export function validateUsers(users,vaultId){
  if(!Array.isArray(users)||users.length>10000||users.some(x=>!Number.isSafeInteger(x)||x<1||x>=16777216||x===vaultId))throw Error('users must contain at most 10000 valid payer IDs');
  return [...new Set(users)].sort((a,b)=>a-b);
}
export function validateOptions(input,base=process.cwd()){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('executor config must be an object');
  for(const key of Object.keys(input))if(!allowed.has(key))throw Error(`unknown executor config field: ${key}`);
  const o={...input};
  if(!kinds.includes(o.kind))throw Error('unsupported executor kind');
  if(o.profile!==undefined&&!['legacy','u124','nft-v3-u124'].includes(o.profile))throw Error('unsupported amount profile');
  if(o.kind==='nftmarket'){
    if(o.profile!=='nft-v3-u124'||o.assetA||o.assetB)throw Error('NFT marketplace requires nft-v3-u124 profile');
    for(const key of ['policy','driverConfig'])if(typeof o[key]!=='string'||!o[key])throw Error(`path required: ${key}`);
    for(const key of ['collection','paymentToken']){
      const a=o[key];if(!a||Object.keys(a).some(k=>!['contractId','codeRoot','layoutRoot','abi'].includes(k)))throw Error(`invalid ${key} binding`);
      if(!Number.isSafeInteger(a.contractId)||a.contractId<5||a.contractId>=16777216||a.contractId===o.contractId)throw Error(`invalid ${key} contract`);
      for(const hash of ['codeRoot','layoutRoot'])if(!/^[0-9a-f]{64}$/.test(a[hash]??''))throw Error(`explicit ${key} ${hash} required`);
      if(typeof a.abi!=='string'||!a.abi)throw Error(`${key} ABI required`);o[key]={...a,abi:resolve(base,a.abi)};
    }
    if(o.collection.contractId===o.paymentToken.contractId)throw Error('distinct NFT and FT required');
    if(!Number.isSafeInteger(o.contractId)||o.contractId<5||o.contractId>=16777216)throw Error('invalid NFT market contract ID');
  }else if(o.profile==='nft-v3-u124'||o.collection||o.paymentToken)throw Error('NFT bindings require nftmarket');
  if(o.profile==='u124'){
    if(!['amm','orderbook','bondingcurve'].includes(o.kind))throw Error('unsupported U124 market');
    for(const key of ['policy','driverConfig'])if(typeof o[key]!=='string'||!o[key])throw Error(`path required: ${key}`);
    for(const key of ['assetA','assetB']){
      const asset=o[key];
      if(!asset||Object.keys(asset).some(k=>!['contractId','codeRoot','layoutRoot','abi'].includes(k)))throw Error(`invalid ${key} binding`);
      if(!Number.isSafeInteger(asset.contractId)||asset.contractId<5||asset.contractId>=16777216)throw Error(`invalid ${key} contract`);
      for(const hash of ['codeRoot','layoutRoot'])if(!/^[0-9a-f]{64}$/.test(asset[hash]??''))throw Error(`explicit ${key} ${hash} required`);
      if(typeof asset.abi!=='string'||!asset.abi)throw Error(`${key} ABI required`);
      o[key]={...asset,abi:resolve(base,asset.abi)};
    }
    if(o.assetA.contractId===o.assetB.contractId)throw Error('distinct U124 assets required');
    if([o.assetA.contractId,o.assetB.contractId].includes(o.contractId))throw Error('market and asset contract IDs must be distinct');
  }else if(o.kind!=='nftmarket'&&(o.policy||o.assetA||o.assetB))throw Error('U124 binding requires profile u124');
  if(o.profile==='u124'||o.kind==='nftmarket')if(typeof o.walletSha256!=='string'||!/^[0-9a-f]{64}$/.test(o.walletSha256))throw Error('explicit reviewed walletSha256 required');
  if(typeof o.network!=='string'||!/^[a-zA-Z0-9_-]+$/.test(o.network))throw Error('explicit network required');
  if(!Number.isSafeInteger(o.contractId)||o.contractId<5||o.contractId>=16777216)throw Error('invalid contract ID');
  if(!Number.isSafeInteger(o.vaultId)||o.vaultId<1||o.vaultId>=16777216)throw Error('invalid vault ID');
  for(const key of ['publicKeyHash','fingerprint','codeRoot','layoutRoot'])if(!/^[0-9a-f]{64}$/.test(o[key]??''))throw Error(`explicit lowercase ${key} required`);
  for(const key of ['rpcConfig','wallet','abi','runtimeDirectory',...(['bondingcurve','launchamm'].includes(o.kind)?['driverConfig']:[])])
    if(typeof o[key]!=='string'||!o[key])throw Error(`path required: ${key}`);
  for(const key of paths)if(o[key]!==undefined){if(typeof o[key]!=='string'||!o[key])throw Error(`invalid path: ${key}`);o[key]=resolve(base,o[key]);}
  o.users=validateUsers(o.users??[],o.vaultId);
  o.intervalMs=o.intervalMs??10000;
  if(!Number.isSafeInteger(o.intervalMs)||o.intervalMs<1000||o.intervalMs>3600000)throw Error('intervalMs must be 1000..3600000');
  o.receiptMaxPages=o.receiptMaxPages??20;
  if(!Number.isSafeInteger(o.receiptMaxPages)||o.receiptMaxPages<1||o.receiptMaxPages>100)throw Error('receiptMaxPages must be 1..100');
  for(const key of ['automaticInitialize','automaticGraduation'])if(o[key]!==undefined&&typeof o[key]!=='boolean')throw Error(`boolean required: ${key}`);
  if(o.kind==='launchamm'&&(!o.pool||o.pool.poolUserId!==o.vaultId||o.pool.poolContractId!==o.contractId))throw Error('launch pool must match vault and contract');
  if(o.name!==undefined&&(typeof o.name!=='string'||!(/^[a-zA-Z0-9_-]{1,80}$/).test(o.name)))throw Error('invalid executor name');
  return o;
}
export async function loadOptions(file){return validateOptions(JSON.parse(await readFile(file,'utf8')),dirname(resolve(file)));}
export async function currentUsers(options){return options.usersFile?validateUsers(JSON.parse(await readFile(options.usersFile,'utf8')),options.vaultId):options.users;}
export async function loadService(file){
  const raw=JSON.parse(await readFile(file,'utf8')),base=dirname(resolve(file));
  for(const key of Object.keys(raw))if(!['vaults','maxConcurrentExecutions','statusFile','maxBackoffMs'].includes(key))throw Error(`unknown service config field: ${key}`);
  if(!Array.isArray(raw.vaults)||!raw.vaults.length||raw.vaults.some(x=>typeof x!=='string'))throw Error('vaults must list executor config paths');
  const vaults=await Promise.all(raw.vaults.map(x=>loadOptions(resolve(base,x))));
  const identities=vaults.map(x=>`${x.network}:${x.vaultId}`);
  if(new Set(identities).size!==vaults.length)throw Error('duplicate network/vault in service config');
  const maxConcurrentExecutions=raw.maxConcurrentExecutions??1,maxBackoffMs=raw.maxBackoffMs??300000;
  if(!Number.isSafeInteger(maxConcurrentExecutions)||maxConcurrentExecutions<1||maxConcurrentExecutions>vaults.length)throw Error('invalid execution concurrency');
  if(!Number.isSafeInteger(maxBackoffMs)||maxBackoffMs<1000||maxBackoffMs>3600000)throw Error('invalid maxBackoffMs');
  if(raw.statusFile!==undefined&&(typeof raw.statusFile!=='string'||!raw.statusFile))throw Error('invalid statusFile');
  return {vaults,maxConcurrentExecutions,maxBackoffMs,statusFile:raw.statusFile?resolve(base,raw.statusFile):null};
}
