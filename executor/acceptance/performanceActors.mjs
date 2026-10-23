// Explicit owned QA actor bootstrap, not a replacement for any lost payment.
// Each registration is attempted at most once; partial output requires review.
import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {readFile,mkdir} from 'node:fs/promises';import {join} from 'node:path';
import {assertDurableRuntimeDirectory} from '../runtimeStorage.mjs';import {sha256} from '../requestBinding.mjs';
import {read,save,run} from '../../batching/admission/liveSupport.mjs';import {publicState} from '../publicState.mjs';
const[base]=process.argv.slice(2);assertDurableRuntimeDirectory(base);
const tools=read(join(base,'public/toolchain-v1.json'));assert.equal(tools.sdkManifestSha256,'0afb4c65116cddcaca450b406a06503d65b63d38a004d8e773c6e5fa363bd425');
const binary=tools.binaries.isolated_wallet.file,expected=tools.binaries.isolated_wallet.sha256,config=join(base,'public/rpc.json'),env={PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'};
for(const name of ['performance-owner','performance-recipient']){
 assert.equal(sha256(await readFile(binary)),expected);await mkdir(join(base,'.secrets'),{recursive:true,mode:0o700});
 const secret=join(base,'.secrets',name+'.json'),pub=join(base,'public',name+'-identity.json'),out=join(base,'attempts','register-'+name+'-v1');
 if(!existsSync(pub)){assert.ok(!existsSync(secret),'partial wallet creation requires review');const timing=await run(binary,['create',config,secret,pub],join(base,'create-'+name+'-v1.log'),env);save(join(base,'public',name+'-create-timing-v1.json'),timing);}
 if(!existsSync(join(out,'receipt.json'))){assert.ok(!existsSync(out),'partial registration: reconcile original public identity, never blindly register again');const timing=await run(binary,['register',config,secret,out],join(base,'register-'+name+'-v1.log'),env);save(join(out,'timing.json'),timing);}
 const s=await publicState(config),pk=read(pub).publicKeyHash,ids=await s.userIds(pk);assert.ok(ids.length<=1);
 save(join(base,'public',name+'-registration-observation-v1.json'),{at:new Date().toISOString(),publicKeyHash:pk,userIds:ids,checkpoint:s.checkpoint,status:ids.length?'registered-public-identity-observed':'registration-awaiting-public-observation',scope:'registration acknowledgement plus current public identity mapping, not indexed inclusion/fee proof or completed market acceptance'});
}
