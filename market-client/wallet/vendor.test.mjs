// Reproduction tests only. No network, verifier activation or financial work.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'../..');
test('vendor requires pinned RPC bytes even when both selected configs agree',()=>{
 const staged=mkdtempSync(join(root,'market-client/reviewed/.vendor-test-'));
 const output=mkdtempSync(join(tmpdir(),'market-vendor-test-'));
 try{
  const markets=join(staged,'markets'),amm=join(staged,'amm');
  cpSync(join(root,'market-client/reviewed/mainnet-beta-markets-20261027-v3'),markets,{recursive:true});
  cpSync(join(root,'market-client/reviewed/mainnet-beta-amm-20261027-v2'),amm,{recursive:true});
  const run=name=>spawnSync(process.execPath,[join(root,'market-client/wallet/vendor.mjs'),join(output,name),markets,amm],{encoding:'utf8'});
  assert.equal(run('valid').status,0);
  for(const dir of [markets,amm]){
   const p=join(dir,'rpc-config.json'),v=JSON.parse(readFileSync(p));
   v.networks.testnet.coordinator_configs[0].rpc_url=['https://substituted.invalid'];
   writeFileSync(p,JSON.stringify(v));
  }
  const rejected=run('rejected');assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/Reviewed RPC configuration changed/);
  assert.equal(existsSync(join(output,'rejected')),false);
 }finally{rmSync(staged,{recursive:true,force:true});rmSync(output,{recursive:true,force:true});}
});
