import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,cp,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {generatePairOptimized} from './pair-optimized-generate.mjs';
const [input,output]=process.argv.slice(2).map(p=>resolve(p));assert.ok(input&&output&&input!==output);
// ABI-only review projections are not executable fixtures. Reject them before
// creating output or compiling a candidate.
for(const name of ['native.json','token/compilation_artifact.json','nft/compilation_artifact.json']) {
 const a=JSON.parse(await readFile(join(input,name),'utf8'));
 assert.ok(Array.isArray(a.circuit_definitions)&&a.circuit_definitions.length>0,`full bytecode required: ${name}`);
 assert.equal(a.state_tree_height,name==='native.json'?32:name.startsWith('nft/')?30:31);
}
await mkdir(output,{recursive:false});
for(const n of ['native.json','token','nft'])await cp(join(input,n),join(output,n),{recursive:true,errorOnExist:true,force:false});
try {await access(join(input,'token-b'));await cp(join(input,'token-b'),join(output,'token-b'),{recursive:true,errorOnExist:true,force:false});} catch(e) {if(e.code!=='ENOENT')throw e;}
for(const market of ['orderbook','nftmarket']){
 const c=JSON.parse(await readFile(join(input,market,'config.json'),'utf8'));assert.equal(String(c.networkMagic),'1384803358401154921');const dir=join(output,market);await mkdir(dir);await writeFile(join(dir,'config.json'),JSON.stringify(c,null,2)+'\n',{flag:'wx'});await writeFile(join(dir,'main.psy.rs'),generatePairOptimized(market,c),{flag:'wx'});
}
