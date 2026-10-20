// Fresh offline fixtures. No deployment, account creation, or RPC access.
import{mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync}from'node:fs';
import{resolve}from'node:path';import{fileURLToPath}from'node:url';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';
import{generateBatch}from'./generate.mjs';import{makeBatchPolicy}from'./policy.mjs';
import{fixture}from'../../amm/u124/generate.mjs';
export function prepare({compiler,assets,native,out}){
 compiler=resolve(compiler);assets=resolve(assets);out=resolve(out);if(existsSync(out))throw Error('fresh batch output required');
 const magic=spawnSync(compiler,['network-magic'],{encoding:'utf8'});if(magic.status!==0||!/^\d+\s*$/.test(magic.stdout))throw Error('compiler network magic');
 const networkMagic=magic.stdout.trim();mkdirSync(out,{recursive:true});
 for(const n of['token','nft']){mkdirSync(resolve(out,n));copyFileSync(resolve(assets,n,'compilation_artifact.json'),resolve(out,n,'compilation_artifact.json'));}
 const nativeArtifact=JSON.parse(readFileSync(resolve(native)));if(nativeArtifact.state_tree_height!==32||!nativeArtifact.circuit_definitions?.some(d=>d.name==='simple_burn'))throw Error('native artifact required');
 copyFileSync(resolve(native),resolve(out,'native.json'));
 const token=JSON.parse(readFileSync(resolve(out,'token/compilation_artifact.json'))),nft=JSON.parse(readFileSync(resolve(out,'nft/compilation_artifact.json')));
 const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');const records=[];
 for(const market of['amm','orderbook','bondingcurve','nftmarket']){
  const c=market==='nftmarket'?{nftId:41,tokenId:42,networkMagic}:{...fixture,networkMagic};
  const p=resolve(out,market);mkdirSync(p);const source=resolve(p,'main.psy.rs');writeFileSync(source,generateBatch(market,c),{flag:'wx'});
  const compiled=resolve(p,'compiled');const args=[source,compiled,...(market==='nftmarket'?['41','42','1']:['42','43','0'])];const r=spawnSync(compiler,args,{encoding:'utf8'});writeFileSync(resolve(p,'compile.log'),r.stdout+r.stderr,{flag:'wx'});if(r.status!==0)throw Error(`${market}: ${r.stderr}`);
  const artifact=JSON.parse(readFileSync(resolve(compiled,'compilation_artifact.json')));writeFileSync(resolve(p,'policy.json'),JSON.stringify(makeBatchPolicy(market,1000,c,artifact.abi,token.abi,nft.abi),null,2)+'\n',{flag:'wx'});writeFileSync(resolve(p,'config.json'),JSON.stringify(c,null,2)+'\n',{flag:'wx'});
  records.push({market,sourceSha256:hash(source),artifactSha256:hash(resolve(compiled,'compilation_artifact.json')),policySha256:hash(resolve(p,'policy.json'))});
 }
 const result={compilerSha256:hash(compiler),networkMagic,records,fullUpsVerified:false,broadcast:false};writeFileSync(resolve(out,'PREPARED.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),v={};if(a.length!==8)throw Error('--compiler BIN --assets DIR --native ARTIFACT --out FRESH_DIR');for(let i=0;i<a.length;i+=2)v[a[i].slice(2)]=a[i+1];console.log(JSON.stringify(prepare(v)));}
