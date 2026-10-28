// Offline fixture generation only. Input artifacts remain immutable; no SDK,
// Node, deployed contract, network identity or existing evidence is modified.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,cp,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {generateStream} from './generate.mjs';

export async function prepareStreamFixtures(input,output){
 input=resolve(input);output=resolve(output);assert.notEqual(input,output);
 await mkdir(output,{recursive:false});
 for(const name of ['native.json','token','nft'])await cp(join(input,name),join(output,name),{recursive:true,errorOnExist:true,force:false});
 try{await access(join(input,'token-b'));await cp(join(input,'token-b'),join(output,'token-b'),{recursive:true,errorOnExist:true,force:false});}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const market of ['amm','bondingcurve']){
  const config=JSON.parse(await readFile(join(input,market,'config.json'),'utf8'));
  assert.equal(String(config.networkMagic),'1384803358401154921','frozen test-network magic');
  const dir=join(output,market);await mkdir(dir);await writeFile(join(dir,'config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});
  await writeFile(join(dir,'main.psy.rs'),generateStream(market,config),{flag:'wx'});
 }
}
if(process.argv.length===4)await prepareStreamFixtures(process.argv[2],process.argv[3]);
