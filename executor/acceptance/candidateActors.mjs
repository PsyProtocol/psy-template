// Two new owned QA actors, public evidence only. Wallet files stay in .secrets.
import assert from'node:assert/strict';import{existsSync}from'node:fs';import{join}from'node:path';
import{read,run,save,confirmRegistration}from'../../batching/admission/liveSupport.mjs';import{publicState}from'../publicState.mjs';
const[base,binary]=process.argv.slice(2);assert.ok(binary);const config=join(base,'public/rpc.json'),env={PSY_MARKET_TESTNET_PROFILE:'staging-bundled-regtest-20261020-v1',RAYON_NUM_THREADS:'2'};
for(const name of ['charlie','dave']){
 const secret=join(base,'.secrets',name+'.json'),pub=join(base,'public',name+'-identity.json'),out=join(base,'attempts','register-'+name+'-v1');
 if(!existsSync(pub)){assert.ok(!existsSync(secret),'partial create requires inspection');await run(binary,['create',config,secret,pub],join(base,'create-'+name+'-v1.log'),env);}
 if(!existsSync(join(out,'receipt.json'))){assert.ok(!existsSync(out),'partial registration requires inspection');await run(binary,['register',config,secret,out],join(base,'register-'+name+'-v1.log'),env);}
 if(!existsSync(join(base,'public',name+'-registration-v1.json'))){
  const pk=read(pub).publicKeyHash;let ids=[];for(let i=0;i<120;i++){ids=await(await publicState(config)).userIds(pk);assert.ok(ids.length<=1);if(ids.length)break;await new Promise(r=>setTimeout(r,10000));}assert.equal(ids.length,1);
  const receipt=await confirmRegistration(config,ids[0],pk);save(join(base,'public',name+'-registration-v1.json'),{userId:ids[0],publicKeyHash:pk,...receipt});
 }
 console.log(name,read(join(base,'public',name+'-registration-v1.json')).userId);
}
