// Fresh synthetic fixtures only. No registration, deployment or RPC.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,cpSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {withBulkAdmission} from './bulk.mjs';
const [source,out]=process.argv.slice(2);assert.ok(source&&out&&!existsSync(out),'fresh fixture output required');mkdirSync(out);
for(const path of ['token','nft'])cpSync(join(source,path),join(out,path),{recursive:true,errorOnExist:true,force:false});
copyFileSync(join(source,'native.json'),join(out,'native.json'));
const records=[];const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
for(const market of ['amm','orderbook','bondingcurve','nftmarket']){
 const dir=join(out,market);mkdirSync(dir);
 for(const file of ['main.psy.rs','config.json'])copyFileSync(join(source,market,file),join(dir,file));
 cpSync(join(source,market,'compiled'),join(dir,'compiled'),{recursive:true,errorOnExist:true,force:false});
 const policy=withBulkAdmission(JSON.parse(readFileSync(join(source,market,'policy.json'))));
 writeFileSync(join(dir,'policy.json'),JSON.stringify(policy,null,2)+'\n',{flag:'wx'});
 records.push({market,sourcePolicySha256:sha(join(source,market,'policy.json')),policySha256:sha(join(dir,'policy.json')),sourceSha256:sha(join(dir,'main.psy.rs')),artifactSha256:sha(join(dir,'compiled/compilation_artifact.json'))});
}
writeFileSync(join(out,'BULK-FIXTURES.json'),JSON.stringify({schema:1,source,records,scope:'unregistered synthetic all-four admission proof fixtures',broadcast:false,fullUpsVerified:false},null,2)+'\n',{flag:'wx'});
