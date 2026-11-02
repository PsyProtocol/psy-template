// Build an application compiler against the exact selected, unpatched SDK.
// No Node checkout, branch following, dependency update or financial operation.
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,constants} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
const args=process.argv.slice(2);
if(args.length!==3||args[1]!=='--source')throw Error('usage: prepare-toolchain.mjs <fresh-output-directory> --source <frozen-sdk-source-root>');
const out=resolve(args[0]),source=resolve(args[2]);
if(existsSync(out))throw Error('Refusing to overwrite '+out);
const selected=JSON.parse(readFileSync(join(repo,'batching/dependencies/selected.json')));
const freezePath=join(repo,selected.sourceManifest),freeze=JSON.parse(readFileSync(freezePath));
const sha=b=>createHash('sha256').update(b).digest('hex');
if(sha(readFileSync(freezePath))!==selected.sourceManifestSha256)throw Error('Selected source manifest changed');
execFileSync('python3',[join(here,'prepare_selected_toolchain.py'),'--source',source,'--out',join(out,'application')],{stdio:'inherit'});
const app=join(out,'application'),target=resolve(process.env.CARGO_TARGET_DIR??join(out,'target'));
const env={...process.env,PSY_NETWORK:'testnet',PSY_CONFIG_PATH:join(source,'psy-sdk/psy-genesis/config.json'),
 CARGO_TARGET_DIR:target,CARGO_BUILD_JOBS:process.env.CARGO_BUILD_JOBS??'2',RAYON_NUM_THREADS:process.env.RAYON_NUM_THREADS??'2'};
const command=['+nightly-2025-09-20','build','--offline','--locked','--release','--features','sdk-audit-v1','--bin','compile_private','--bin','private_fingerprint'];
const result=spawnSync('cargo',command,{cwd:app,env,encoding:'utf8',maxBuffer:32*1024*1024,timeout:900000});
writeFileSync(join(out,'compile.log'),(result.stdout??'')+'\n'+(result.stderr??''),{flag:'wx'});
if(result.error||result.status!==0)throw Error('Selected application compiler build failed; original log retained: '+join(out,'compile.log'));
for(const pin of freeze.sourcePins)for(const[name,digest]of Object.entries(pin.sourceFiles)){
 if(sha(readFileSync(join(source,pin.path,name)))!==digest)throw Error('Pinned source changed during build: '+pin.path+'/'+name);
}
const bin=join(out,'bin');mkdirSync(bin);
for(const name of ['compile_private','private_fingerprint'])copyFileSync(join(target,'release',name),join(bin,name),constants.COPYFILE_EXCL);
const info={schema:1,profile:'private-context-dpn-v2',sdkBranch:selected.sdkBranch,sdkCommit:selected.sdkCommit,
 clientCommit:selected.clientCommit,sourceManifestSha256:selected.sourceManifestSha256,
 sourceCheckoutEdited:false,sdkSourcePatches:[],nodeDeployed:false,
 compiler:join(bin,'compile_private'),fingerprintTool:join(bin,'private_fingerprint'),
 compilerSha256:sha(readFileSync(join(bin,'compile_private'))),fingerprintToolSha256:sha(readFileSync(join(bin,'private_fingerprint'))),
 applicationSourcesSha256:sha(readFileSync(join(app,'PRIVATE-COMPILER-SOURCE.json'))),
 manifest:join(app,'Cargo.toml'),targetDirectory:target,lockSha256:sha(readFileSync(join(app,'Cargo.lock'))),
 fullUpsVerified:false,broadcast:false};
writeFileSync(join(out,'toolchain.json'),JSON.stringify(info,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(info));
