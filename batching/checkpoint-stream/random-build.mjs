import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {generateRandomStream} from './random-generate.mjs';
import {makeStreamPolicy} from './build-policy.mjs';
const [compiler,input,output]=process.argv.slice(2);assert.ok(compiler&&input&&output);
const read=async p=>JSON.parse(await readFile(p,'utf8'));const out=resolve(output);await mkdir(out);
for(const name of ['native.json','token','nft'])await cp(join(input,name),join(out,name),{recursive:true,errorOnExist:true,force:false});
try{await cp(join(input,'token-b'),join(out,'token-b'),{recursive:true,errorOnExist:true,force:false});}catch(e){if(e.code!=='ENOENT')throw e;}
for(const market of ['amm','bondingcurve']){
 const c=await read(join(input,market,'config.json'));assert.equal(String(c.networkMagic),'1384803358401154921');
 const dir=join(out,market);await mkdir(dir);const source=join(dir,'main.psy.rs');await writeFile(source,generateRandomStream(market,c),{flag:'wx'});await writeFile(join(dir,'config.json'),JSON.stringify(c,null,2)+'\n',{flag:'wx'});
 const result=spawnSync(compiler,[source,join(dir,'compiled'),String(c.assetA),String(c.assetB)],{encoding:'utf8',maxBuffer:4000000});await writeFile(join(dir,'compile.log'),(result.stdout??'')+(result.stderr??''),{flag:'wx'});assert.equal(result.status,0,'new random stream candidate compilation');
 const artifact=await read(join(dir,'compiled/compilation_artifact.json')),token=await read(join(out,'token/compilation_artifact.json')),nft=await read(join(out,'nft/compilation_artifact.json'));
 const p=makeStreamPolicy(market,1000,c,artifact,token,nft,{random:true,window:256});
 await writeFile(join(dir,'policy.json'),JSON.stringify(p.base,null,2)+'\n',{flag:'wx'});await writeFile(join(dir,'stream-policy.json'),JSON.stringify(p,null,2)+'\n',{flag:'wx'});
}
