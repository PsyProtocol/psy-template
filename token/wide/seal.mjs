import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
const base=fileURLToPath(new URL('./',import.meta.url)),directory=join(base,'verification-2026-10-12');
const files=['arithmetic.mjs','arithmetic.test.mjs','artifactGate.mjs','build.mjs','callBuilder.mjs','callBuilder.test.mjs','generate.mjs','README.md','Dargo.toml','seal.mjs','src/main.psy.rs','src/arithmetic-probe.psy.rs','vm-tests/Cargo.toml','vm-tests/Cargo.lock','vm-tests/src/bin/compile.rs','vm-tests/tests/token.rs','vm-tests/tests/arithmetic_proof.rs'];
for(const file of files){const target=join(directory,'source',file);await mkdir(dirname(target),{recursive:true});await copyFile(join(base,file),target,constants.COPYFILE_EXCL);}
const report={sealedAt:new Date().toISOString(),artifact:'compiled-reviewed/compilation_artifact.json',amountEncoding:'low + high * 2^62',amountBits:124,publicMethods:20,issuerFixture:5,jsTests:5,vmTests:6,arithmeticProofTests:1,fullStateCfcVerified:false,fullUpsVerified:false,submitted:false,rejectedArtifacts:['compiled','compiled-final'],artifactReview:JSON.parse(await readFile(join(directory,'artifact-review.json'),'utf8'))};
// Keep the large canonical manifest in its original review file.
report.artifactReview={codeRoot:report.artifactReview.codeRoot,layoutRoot:report.artifactReview.layoutRoot,stateTreeHeight:report.artifactReview.stateTreeHeight};
await writeFile(join(directory,'summary.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
let names=[];async function walk(path,rel=''){for(const item of await readdir(path,{withFileTypes:true})){const name=rel?rel+'/'+item.name:item.name;if(item.isDirectory())await walk(join(path,item.name),name);else if(item.isFile()&&name!=='SHA256SUMS')names.push(name);}}
await walk(directory);names.sort();const lines=[];for(const name of names)lines.push(createHash('sha256').update(await readFile(join(directory,name))).digest('hex')+'  '+name);
await writeFile(join(directory,'SHA256SUMS'),lines.join('\n')+'\n',{flag:'wx'});console.log(JSON.stringify({files:names.length,submitted:false}));
