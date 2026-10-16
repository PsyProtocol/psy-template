// Offline security suite. No network submission or modification of Node sources.
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2);
if(args.length!==4||args[0]!=='--artifacts'||args[2]!=='--out')throw Error('Usage: node tests/security/run-six-contracts.mjs --artifacts /absolute/prepared/directory --out /absolute/fresh/results');
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const artifacts=resolve(args[1]),out=resolve(args[3]);
if(existsSync(out))throw Error('Refusing to overwrite security results');
const required=['token/compilation_artifact.json','private-token/compilation_artifact.json','nft/compilation_artifact.json','market/compiled/compilation_artifact.json','vm-markets/amm/compilation_artifact.json','vm-markets/orderbook/compilation_artifact.json','vm-markets/bondingcurve/compilation_artifact.json','inputs.json'];
for(const file of required)if(!existsSync(resolve(artifacts,file)))throw Error(`Missing prepared artifact: ${file}`);
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const inputs=JSON.parse(readFileSync(resolve(artifacts,'inputs.json')));
for(const [path,digest] of Object.entries(inputs.sources))if(hash(resolve(repo,path))!==digest)throw Error(`Source changed since compilation: ${path}`);
if(!inputs.products || Object.keys(inputs.products).length===0)throw Error('Missing frozen product manifest');
for(const [path,digest] of Object.entries(inputs.products))if(hash(resolve(artifacts,path))!==digest)throw Error(`Prepared product changed: ${path}`);
mkdirSync(out,{recursive:true});
const env={...process.env,U124_BUILD:resolve(artifacts,'vm-markets'),NFT_MARKET_BUILD:artifacts,TOKEN_WIDE_ARTIFACT:resolve(artifacts,'token/compilation_artifact.json'),TOKEN_WIDE_PRIVATE_ARTIFACT:resolve(artifacts,'private-token/compilation_artifact.json')};
const result={node:process.version,compilerInputs:inputs,artifacts:Object.fromEntries(required.map(p=>[p,hash(resolve(artifacts,p))])),suites:[],broadcast:false,productionReady:false};
function run(name,command,argv,extra={}){
 console.log(`Running ${name}`);const fd=openSync(resolve(out,name+'.log'),'wx');
 const child=spawnSync(command,argv,{cwd:repo,env:{...env,...extra},stdio:['ignore',fd,fd]});closeSync(fd);
 result.suites.push({name,status:child.status,signal:child.signal,error:child.error?.message});
 writeFileSync(resolve(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');
 if(child.error||child.status!==0)throw Error(`${name} failed; see ${resolve(out,name+'.log')}`);
}
const dirs=['amm','amm/contract','amm/wide','amm/u124','orderbook','bondingcurve','bondingcurve/contract','launchamm','executor','tests/security','token/wide','token/wide/private','nft-marketplace','nft-marketplace/tests'];
const js=dirs.flatMap(dir=>readdirSync(resolve(repo,dir)).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>`${dir}/${n}`));
run('javascript',process.execPath,['--test',...js]);
const cargo=['+nightly-2025-09-20','test','--offline','--locked','--release'];
run('six-contracts-sdkey','cargo',[...cargo,'--manifest-path','amm/u124/vm-tests/Cargo.toml','--lib','--test','markets','--test','nft_market','--test','nft_sdkey','--test','nft_layout','--test','sdkey_proof','--','--test-threads=1']);
run('private-and-public-ft','cargo',[...cargo,'--manifest-path','token/wide/private/vm-tests/Cargo.toml','--test','privacy','--test','public_token','--test','test_policy','--','--test-threads=1'],{TOKEN_WIDE_ARTIFACT:env.TOKEN_WIDE_PRIVATE_ARTIFACT});
console.log(`Completed offline suites: ${out}. Explicit optional bootstrap/sandbox fixtures remain separate; consult the logs for ignored tests.`);
