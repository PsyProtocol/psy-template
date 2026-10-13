// Local repair candidate only. Preserve the deployed v1 source and artifacts.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const input=new URL('../contract/src/main.psy.rs',import.meta.url);
let source=readFileSync(input,'utf8');
if(createHash('sha256').update(source).digest('hex')!=='520e0341e510fd8063b97146015bd60ec6087734207b88070dd4f33523516400')throw Error('Deployed v1 source differs');
const old='ctx.users[sender].contract_state::<Self::ABI>(4).other_user_info[ctx.user_id].amount_sent';
if(source.split(old).length!==3)throw Error('Expected swap and refund reads');
source=source.replaceAll(old,'ctx.users[sender].contract_state::<Self::ABI>(asset).other_user_info[ctx.user_id].amount_sent');
source='// UNDEPLOYED v2 candidate: asset-selected foreign-state reads.\n'+source;
const output=new URL('./contract/src/main.psy.rs',import.meta.url);
if(process.argv.includes('--check')){if(readFileSync(output,'utf8')!==source)throw Error('v2 source differs');}
else{mkdirSync(new URL('./contract/src/',import.meta.url),{recursive:true});writeFileSync(output,source,{flag:'wx'});}
console.log(createHash('sha256').update(source).digest('hex'));
