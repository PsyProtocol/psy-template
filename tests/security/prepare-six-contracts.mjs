import{mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync,readdirSync}from'node:fs';
import{resolve,dirname}from'node:path';
import{fileURLToPath}from'node:url';
import{createHash}from'node:crypto';
import{spawnSync}from'node:child_process';
import{pathToFileURL}from'node:url';
// No RPC, signing, deployment, or node-source writes. All products go to a
// fresh external directory; an existing output is deliberately rejected.
const repo=resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args=process.argv.slice(2);
if(args.length!==4 || args[0]!=="--compiler-bin" || args[2]!=="--out") throw Error("Usage: node tests/security/prepare-six-contracts.mjs --compiler-bin /absolute/frozen/bin --out /absolute/fresh/directory");
const bin=resolve(args[1]);const out=resolve(args[3]);
if(existsSync(out)) throw Error("Refusing to overwrite security artifacts");
for(const name of ['compile','compile_private','compile_market','compile_nft_market']) if(!existsSync(resolve(bin,name))) throw Error(`Missing compiler: ${name}`);
mkdirSync(out,{recursive:true});
function run(cmd,args){const p=spawnSync(cmd,args,{stdio:'inherit',cwd:repo});if(p.error||p.status!==0)throw Error(`Failed ${cmd}: ${p.error??p.status}`);}
run(bin+'/compile',[repo+'/token/wide/src/main.psy.rs',out+'/token']);
run(bin+'/compile',[repo+'/nft/src/main.psy.rs',out+'/nft']);
run(bin+'/compile_private',[repo+'/token/wide/private/src/main.psy.rs',out+'/private-token']);
const {build}=await import(pathToFileURL(repo+'/amm/u124/build.mjs'));
const config={assetA:42,assetB:43,issuer:5,target:400,cap:1000000,liquidity:1000000,threshold:1000000,unit:'1000000000000000000',base:'1000000000000000000',step:'100000000000000'};
build({config,out:out+'/markets',compiler:bin+'/compile_market',tokenA:out+'/token/compilation_artifact.json',tokenB:out+'/token/compilation_artifact.json',marketIds:{amm:1000,orderbook:1001,bondingcurve:1002}});
const {build:buildNft}=await import(pathToFileURL(repo+'/nft-marketplace/build.mjs'));
buildNft({config:{nftId:41,tokenId:42},marketId:1000,out:out+'/market',compiler:bin+'/compile_nft_market',nft:out+'/nft/compilation_artifact.json',token:out+'/token/compilation_artifact.json'});
run(process.execPath,[repo+'/nft-marketplace/samples.mjs',out+'/market/policy.json',out+'/market/policy-samples.json']);
const {operationCalls}=await import(pathToFileURL(repo+'/amm/u124/policy.mjs'));
const {losslessJson}=await import(pathToFileURL(repo+'/amm/u124/client.mjs'));
mkdirSync(out+'/vm-markets');
for(const market of['amm','orderbook','bondingcurve']){
 const dir=out+'/vm-markets/'+market;mkdirSync(dir);
 copyFileSync(out+'/markets/'+market+'/compiled/compilation_artifact.json',dir+'/compilation_artifact.json');
 copyFileSync(out+'/markets/'+market+'/policy.json',dir+'/policy.json');
 const policy=JSON.parse(readFileSync(dir+'/policy.json','utf8'));
 const n=10n**28n+17n,radix=1n<<62n;
 const samples=policy.branches.map(b=>{const fields=[BigInt(b.branch),200n,201n,n%radix,n/radix,0n,0n,0n,0n,0n,1n,1n,1000100000n];return{fields,calls:operationCalls(policy,fields)};});
 writeFileSync(dir+'/policy-samples.json',losslessJson(samples)+'\n',{flag:'wx'});
}
console.log(JSON.stringify({artifacts:out,sourceRepo:repo}));
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
// Bind all tracked executable sources and dependency locks, including market
// generators, shared integer DSL, policy builders, gates and test harnesses.
const tracked=spawnSync('git',['ls-files','-z'],{cwd:repo,encoding:'utf8'});
if(tracked.status!==0)throw Error('Cannot enumerate source inputs');
const sources=tracked.stdout.split('\0').filter(p=>p && (/\.(?:rs|mjs|psy)$/.test(p)||/(?:^|\/)Cargo\.(?:toml|lock)$/.test(p))).sort();
function products(dir,relative='') {return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
 const path=relative ? relative+'/'+e.name : e.name;
 return e.isDirectory()?products(resolve(dir,e.name),path):[path];
}).sort();}
const compilers=['compile','compile_private','compile_market','compile_nft_market'];
writeFileSync(out+'/inputs.json',JSON.stringify({sources:Object.fromEntries(sources.map(p=>[p,hash(resolve(repo,p))])),compilers:Object.fromEntries(compilers.map(p=>[p,hash(resolve(bin,p))])),products:Object.fromEntries(products(out).map(p=>[p,hash(resolve(out,p))]))},null,2)+'\n',{flag:'wx'});
