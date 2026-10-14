// Archive the SDK into a new build directory; expose existing VM intrinsics there.
// Does not edit the source checkout or run a Node service.
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,cpSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
if(process.argv.length!==3)throw Error('usage: prepare-toolchain.mjs <fresh-output-directory>');
const out=resolve(process.argv[2]);if(existsSync(out))throw Error('Refusing to overwrite '+out);
const sdk=resolve(process.env.PSY_NODE_SOURCE??join(repo,'../psy-node'));
const head=execFileSync('git',['-C',sdk,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
for(const n of ['config.json','genesis_contracts.json'])if(!existsSync(join(sdk,'psy-genesis',n)))throw Error('Missing public SDK build input '+n);
mkdirSync(out);const workspace=join(out,'workspace'),node=join(workspace,'psy-node');mkdirSync(node,{recursive:true});
const archive=execFileSync('git',['-C',sdk,'archive','HEAD'],{maxBuffer:256*1024*1024});
const unpack=spawnSync('tar',['-xf','-','-C',node],{input:archive,stdio:['pipe','inherit','inherit']});if(unpack.status!==0)throw Error('SDK archive failed');
for(const n of ['config.json','genesis_contracts.json'])copyFileSync(join(sdk,'psy-genesis',n),join(node,'psy-genesis',n));
const patch=readFileSync(join(repo,'token/compiler/private_intrinsics.patch'));
const patched=spawnSync('patch',['-d',node,'-p1'],{input:patch,stdio:['pipe','inherit','inherit']});if(patched.status!==0)throw Error('Compiler intrinsic patch failed');
const crate=join(workspace,'psy-template/token/wide/private/vm-tests');cpSync(join(here,'vm-tests'),crate,{recursive:true,filter:p=>!p.includes('/target')});
cpSync(join(here,'../vm-tests/tests'),join(workspace,'psy-template/token/wide/vm-tests/tests'),{recursive:true});
const target=resolve(process.env.CARGO_TARGET_DIR??join(out,'target'));
const built=spawnSync('cargo',['+nightly-2025-09-20','build','--offline','--release','--manifest-path',join(crate,'Cargo.toml'),'--bins'],{stdio:'inherit',env:{...process.env,CARGO_TARGET_DIR:target}});if(built.status!==0)throw Error('Isolated compiler build failed');
const sha=b=>createHash('sha256').update(b).digest('hex');
const info={sdkCommit:head,sdkArchiveSha256:sha(archive),intrinsicsPatchSha256:sha(patch),sourceCheckoutEdited:false,nodeDeployed:false,compiler:join(target,'release/compile_private'),fingerprintTool:join(target,'release/fingerprint'),manifest:join(crate,'Cargo.toml'),targetDirectory:target,lockSha256:sha(readFileSync(join(crate,'Cargo.lock')))};
writeFileSync(join(out,'toolchain.json'),JSON.stringify(info,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(info));
