// Bounded, explicitly owned QA journey through the FORMAL core Executor.
// One external supervisor owns both account locks. Unknown results only reconcile.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process'; import {promisify} from 'node:util';
import {read,save,ordinary,confirmUps,binding,run} from '../../batching/admission/liveSupport.mjs';
import {decodeAmount,parseLosslessJson,swapQuote,FEE_ESCROW} from '../../amm/u124/client.mjs';
import {publicState} from '../publicState.mjs'; import {ordinaryResident} from '../ordinaryResident.mjs';
import {createPublicWalletAdapter} from '../publicWalletAdapter.mjs'; import {validateOptions} from '../config.mjs';
import {ExecutionJournal} from '../journal.mjs'; import {sha256} from '../requestBinding.mjs';
import {latestBroadcastOutcome} from './attemptOutcome.mjs'; import {freezeAppModules} from './sourceClosure.mjs';
import {planCoreAmmStage} from './coreAmmJourney.mjs';

export async function runCoreAmmJourney(base) {
  base=resolve(base);assert.equal(process.env.PSY_QA_OWNED_CASE,base,'external exclusive supervisor required');
  assert.equal(Number(process.env.PSY_QA_OWNER_PID),process.ppid,'one owned supervisor');
  const exact=p=>parseLosslessJson(readFileSync(p,'utf8')),root=join(base,'bound-core-v1'),
    config=join(base,'../markets-network-acceptance-20261111-v1/testnet-config-v1.json'),old=resolve(join(base,'../markets-network-acceptance-20261111-v1'));
  const revision=process.env.PSY_CORE_JOURNEY_REVISION??'v1';assert.ok(['v1','v2','v3'].includes(revision));
  const release=revision!=='v1'?read(join(base,'public/JOURNEY-RELEASE-v2.json')):null;
  if(release){assert.equal(release.priorSourceSha256,sha256(readFileSync(join(base,'public/core-journey-v1-SOURCE.json'))));assert.equal(release.issuerAdoptionSha256,sha256(readFileSync(join(base,'public/ISSUER-SETUP-ADOPTED-v2.json'))));}
  if(revision==='v3'){
    const repair=read(join(base,'public/JOURNEY-RELEASE-v3.json'));
    assert.equal(repair.priorSourceSha256,sha256(readFileSync(join(base,'public/core-journey-v2-SOURCE.json'))));
    assert.equal(repair.failedPhase,'start-compact-session');assert.equal(repair.broadcastMayHaveBeenAttempted,false);
    for(const[p,h]of Object.entries(repair.files))assert.equal(sha256(readFileSync(join(base,p))),h);
    const failed=join(base,repair.failureDirectory);assert.deepEqual(readdirSync(failed),['failure.json']);
    const f=read(join(failed,'failure.json'));assert.equal(f.phase,repair.failedPhase);assert.equal(f.broadcastMayHaveBeenAttempted,false);
    assert.equal(f.reason,'User tree proof not found for checkpoint_id 104259');
  }
  const plan=read(join(base,'public/PLAN-v1.json')),reg=read(join(base,'public/AMM-VAULT-v1.json')),
    selected=read(join(base,'public/AMM-SELECTED-v1.json')),member=read(join(base,'public/AMM-VAULT-REGISTERED-v1.json')),
    pins=read(join(base,'public',revision!=='v1'?'BINARIES-v4.json':'BINARIES-v3.json')),policy=read(join(root,'policy.json')),c=read(join(root,'config.json'));
  assert.equal(plan.maximumFeePsy,'60');assert.equal(plan.maximumNewFullUps,40);
  assert.equal(selected.marketId,51);assert.equal(reg.marketId,selected.marketId);assert.equal(member.userId,reg.vaultId);
  assert.equal(member.registrationMembershipVerified,true);assert.equal(reg.chainRootAt1,selected.chainRootAt1);
  assert.equal(policy.market_id,reg.marketId);assert.equal(policy.chain_root_at1,reg.chainRootAt1);
  assert.deepEqual([c.assetA,c.assetB],[49,50]);assert.deepEqual(plan.ordinaryQaUsers,[971904,668800]);
  const binary=join(base,'bin-v3/compact_market_wallet'),ordinaryBinary=join(base,revision!=='v1'?'bin-v4':'bin-v3','isolated_wallet');
  assert.equal(sha256(readFileSync(binary)),pins.compact_market_wallet);assert.equal(sha256(readFileSync(ordinaryBinary)),pins.isolated_wallet);
  const contracts=read(join(root,'dependencies.json')),bindings=new Map(contracts.map(b=>[b.contract.contractId,b]));
  const abi=read(join(root,'abi.json')),tokenAbi=read(join(root,'asset-a-abi.json'));
  assert.deepEqual(tokenAbi.contract.methods,read(join(root,'asset-b-abi.json')).contract.methods);
  const context={policy,config:c,marketId:BigInt(reg.marketId),vaultId:BigInt(reg.vaultId),issuerId:971904n,traderId:668800n,marketAbi:abi,tokenAbi};
  const sourceLabel='core-journey-'+revision,entry=fileURLToPath(import.meta.url);
  const sourceCurrent=()=>freezeAppModules(entry,base,sourceLabel);sourceCurrent();
  const completed=join(base,'public/CORE-JOURNEY-CONFIRMED-v1.json');
  if(existsSync(completed)){
    const report=exact(completed);assert.equal(report.marketId,51n);assert.equal(report.vaultId,BigInt(reg.vaultId));
    for(const row of report.outputs)for(const role of ['request','preflight','included'])assert.equal(sha256(readFileSync(row[role])),row[role+'Sha256']);
    console.log('CORE_JOURNEY_ALREADY_CONFIRMED');return;
  }
  const budget=join(base,'budget-v1');mkdirSync(budget,{recursive:true});
  const reserve=(name,kind)=>{
    assert.ok(Date.now()-Date.parse(plan.createdAt)<plan.maximumWallSeconds*1000,'case wall budget exhausted');sourceCurrent();
    const file=join(budget,name+'.json');if(!existsSync(file)){
      const names=readdirSync(budget).filter(n=>n.endsWith('.json'));assert.ok(names.length<18,'declared 18-stage ceiling');
      assert.ok(BigInt(names.length+1)*3000000000n<=BigInt(plan.maximumFeePsy)*1000000000n,'fee reserve ceiling');
      save(file,{stage:name,kind,maximumFeeReserveBaseUnits:'3000000000',automaticRetry:false});
    }
  };
  const env={PSY_NETWORK:'testnet',PSY_MARKET_TESTNET_PROFILE:'sdk-audit-20261102-v1',PSY_EXPECTED_CHAIN_ROOT:reg.chainRootAt1,RAYON_NUM_THREADS:'2'};
  const fresh=async()=>{sourceCurrent();const s=await publicState(config);assert.equal((await s.rpc(s.coordinator,'psy_get_checkpoint_leaf_data',{checkpoint_id:1})).global_chain_root,reg.chainRootAt1);for(const b of contracts)assert.deepEqual(await binding(s,b.contract.contractId),b);return s;};
  const actors=new Map(read(join(base,'public/ACTORS-v1.json')).rows.map(v=>[v.userId,v]));
  const sdkManifest=resolve('batching/dependencies/audit-20261102/manifest.json'),sdkSha256=sha256(readFileSync(sdkManifest)),workers=new Map();
  const worker=async id=>{
    assert.ok(actors.has(id));if(!workers.has(id))workers.set(id,await ordinaryResident({binary:ordinaryBinary,binarySha256:pins.isolated_wallet,
      config,dependencies:join(root,'dependencies.json'),secret:join(old,'.secrets',id===971904?'issuer.json':'fee-owner.json'),
      publicKeyHash:actors.get(id).publicKeyHash,sdkManifest,sdkSha256,env}));return workers.get(id);
  };
  const asset=id=>{const b=bindings.get(id).contract;return {contractId:id,codeRoot:b.codeRoot,layoutRoot:b.layoutRoot,abi:join(root,id===c.assetA?'asset-a-abi.json':'asset-b-abi.json')};};
  const marketBinding=bindings.get(reg.marketId).contract;
  const options=validateOptions({kind:'amm',profile:'amm-core-compact-v1',network:'testnet',testnetProfile:env.PSY_MARKET_TESTNET_PROFILE,
    chainRootAt1:reg.chainRootAt1,contractId:reg.marketId,vaultId:reg.vaultId,publicKeyHash:reg.publicKeyHash,fingerprint:reg.fingerprint,
    codeRoot:marketBinding.codeRoot,layoutRoot:marketBinding.layoutRoot,wallet:binary,walletSha256:pins.compact_market_wallet,rpcConfig:config,
    abi:join(root,'abi.json'),driverConfig:join(root,'config.json'),policy:join(root,'policy.json'),dependencyBindings:join(root,'dependencies.json'),
    runtimeDirectory:join(base,'runtime-core-v1'),batchSponsorId:971904,activationPayerId:668800,automaticInitialize:true,batchMemberLimit:1,
    batchExpiryCheckpoints:1024,proverThreads:2,proverMode:'resident',users:[668800],assetA:asset(c.assetA),assetB:asset(c.assetB)});
  const optionsFile=join(base,'public/core-executor-v1.json');if(existsSync(optionsFile))assert.deepEqual(read(optionsFile),options);else save(optionsFile,options);
  const adapter=await createPublicWalletAdapter(options,{runDriver:promisify(execFile)}),journal=new ExecutionJournal({directory:options.runtimeDirectory,network:options.network,vaultId:reg.vaultId,fingerprint:reg.fingerprint});
  const outputs=[];
  const unresolved=async()=>{await journal.reconcile(adapter.reconcile);assert.equal((await journal.unresolved()).length,0,'unknown vault result; stop before any other financial operation');};
  const auditReceipt=(included,pre)=>{
    assert.equal(included.status,'included');const core=pre.core,d=included.receipt.data;assert.equal(d.status,'included');
    assert.equal(included.endUserLeafHash,core.state_transition.end_user_leaf_hash);assert.equal(included.contentHash,d.content_hash);
    assert.equal(BigInt(included.userId),core.new_user_leaf.user_id);assert.ok(BigInt(included.commonCheckpoint)>=BigInt(included.checkpoint));
    const fee=core.stats.guta_fees_collected+core.stats.da_fees_collected;assert.equal(fee,BigInt(d.result.fees_collected));assert.ok(fee<=3000000000n);
    return fee;
  };
  const ordinaryStep=async(name,stage,terms={})=>{
    await unresolved();reserve(name,'ordinary');let actualName=name;
    if(revision!=='v1'&&name==='core-issuer-setup-v1'){
      const adoption=read(join(base,'public/ISSUER-SETUP-ADOPTED-v2.json'));assert.equal(adoption.originalLabel,name);assert.equal(adoption.replacementLabel,'core-issuer-setup-reviewed-v2');
      assert.equal(adoption.originalNeverBroadcast,true);assert.equal(adoption.replacementAlreadyIncluded,true);assert.equal(adoption.newRequestsByAdoption,0);
      for(const[p,h]of Object.entries(adoption.files))assert.equal(sha256(readFileSync(join(base,p))),h);
      const original=join(base,'attempts',name);assert.deepEqual(readdirSync(original).sort(),['failure.json','metrics.json']);assert.equal(read(join(original,'failure.json')).broadcastMayHaveBeenAttempted,false);
      actualName=adoption.replacementLabel;assert.ok(existsSync(join(base,'attempts',actualName,'included.json')),'only an already-confirmed reviewed repair may be adopted');
    }
    const out=join(base,'attempts',actualName),planFile=join(base,'public',name+'-plan.json');
    if(!existsSync(planFile))save(planFile,{...planCoreAmmStage(context,stage,terms),policySha256:sha256(readFileSync(options.policy)),dependenciesSha256:sha256(readFileSync(options.dependencyBindings))});
    const unsigned=exact(planFile),id=Number(unsigned.actorId);assert.equal(unsigned.stage,stage);assert.ok(actors.has(id));
    assert.equal(unsigned.policySha256,sha256(readFileSync(options.policy)));assert.equal(unsigned.dependenciesSha256,sha256(readFileSync(options.dependencyBindings)));
    if(existsSync(out)){if(!existsSync(join(out,'included.json')))await confirmUps(config,out,{polls:24,intervalMs:5000});}
    else {assert.ok(!existsSync(join(base,'public',name+'.json')),'partial ordinary input; review rather than re-sign');await fresh();await ordinary({base,config,binary:ordinaryBinary,secret:join(old,'.secrets',id===971904?'issuer.json':'fee-owner.json'),name,calls:unsigned.contract_calls,bindings,env,worker:await worker(id)});}
    const included=exact(join(out,'included.json')),pre=exact(join(out,'preflight.json')),inputPath=join(base,'public',actualName+'.json'),inputBytes=readFileSync(inputPath),input=parseLosslessJson(inputBytes.toString()),request=exact(join(out,'request.json')),intent=exact(join(out,'intent.json'));
    assert.equal(pre.fullUpsVerified,true);assert.equal(Number(included.userId),id);assert.equal(pre.inputSha256,sha256(inputBytes));
    assert.deepEqual(input.calls.contract_calls,unsigned.contract_calls);assert.deepEqual(request.user_ec_input.core,pre.core);
    assert.equal(intent.endUserLeafHash,pre.core.state_transition.end_user_leaf_hash);assert.equal(intent.userId,BigInt(id));assert.equal(intent.nonce,pre.core.new_user_leaf.nonce);
    const row={stage:name,type:'ordinary',request:join(out,'request.json'),preflight:join(out,'preflight.json'),included:join(out,'included.json'),fee:auditReceipt(included,pre)};
    for(const role of ['request','preflight','included'])row[role+'Sha256']=sha256(readFileSync(row[role]));outputs.push(row);
    console.log('CORE_INCLUDED',name,String(included.checkpoint));
  };
  const formalStep=async(name,kind,batchId)=>{
    reserve(name,'formal-core');await journal.reconcile(adapter.reconcile);
    const taskFile=join(base,'public',name+'-task'+(revision==='v3'?'-v3':'')+'.json'),reportFile=join(base,'public',name+'-result.json');
    if(!existsSync(reportFile)){
      if((await journal.unresolved()).length){for(let i=0;i<24&&(await journal.unresolved()).length;i++){await new Promise(r=>setTimeout(r,5000));await journal.reconcile(adapter.reconcile);}await unresolved();}
      const task=existsSync(taskFile)?read(taskFile):(await adapter.scan()).action;assert.ok(task,'no expected core task');assert.equal(task.kind,kind);
      if(batchId!==undefined)assert.equal(task.batchId,String(batchId));
      if(!existsSync(taskFile))save(taskFile,task);
      const result=await journal.execute({task,...adapter});
      for(let i=0;i<24;i++){
        await journal.reconcile(adapter.reconcile);const records=await journal.records(),last=latestBroadcastOutcome(records,result.taskId);
        if(last?.status==='not-submitted')throw Error('formal pre-send rejection; inspect exact prepared request, never automatically re-prove');
        if(last?.status==='included'){
          const proof=records.findLast(r=>r.taskId===result.taskId&&r.status==='broadcast-intent').proof;
          save(reportFile,{taskId:result.taskId,task,proof,result:last.result});break;
        }
        await new Promise(r=>setTimeout(r,5000));
      }
      assert.ok(existsSync(reportFile),'exact formal broadcast remains unknown; no replacement');
    }
    const report=exact(reportFile),saved=read(reportFile),out=report.proof.preparedDirectory,pre=exact(join(out,'preflight.json')),records=await journal.records();
    assert.equal(saved.task.kind,kind);if(batchId!==undefined)assert.equal(saved.task.batchId,String(batchId));assert.deepEqual(read(taskFile),saved.task);
    const historic=records.findLast(r=>r.taskId===saved.taskId&&r.status==='included');assert.ok(historic,'confirmed task journal entry required');assert.deepEqual(historic.result,saved.result);
    const manifest=read(join(out,'prepared.json'));assert.equal(sha256(readFileSync(join(out,'prepared.json'))),saved.proof.manifestSha256);
    assert.equal(sha256(readFileSync(join(out,'request.json'))),manifest.requestSha256);assert.equal(sha256(readFileSync(join(out,'preflight.json'))),manifest.preflightSha256);
    assert.deepEqual(exact(join(out,'request.json')).user_ec_input.core,pre.core);
    assert.equal(pre.fullUpsVerified,true);assert.equal(pre.exactStackAndSessionVerified,true);
    const row={stage:name,type:'formal-core',request:join(out,'request.json'),preflight:join(out,'preflight.json'),included:reportFile,fee:auditReceipt(report.result,pre)};
    for(const role of ['request','preflight','included'])row[role+'Sha256']=sha256(readFileSync(row[role]));outputs.push(row);
    console.log('CORE_INCLUDED',name,String(report.result.checkpoint));
  };
  const snapshot=async(label,precedingFormal)=>{
    const p=join(base,'public',label+'-state.json'),link=p+'.binding.json',reportPath=join(base,'public',precedingFormal+'-result.json'),report=exact(reportPath),reportSha256=sha256(readFileSync(reportPath));
    if(existsSync(p)){const v=exact(p),b=read(link);assert.equal(b.snapshotSha256,sha256(readFileSync(p)));assert.equal(b.precedingFormalSha256,reportSha256);assert.ok(BigInt(v.checkpoint)>=report.result.checkpoint);return v;}
    const s=await fresh(),ids=[971904,668800,reg.vaultId],assets=[49,50],balances={},pending={};
    const realm=s.network.realm_configs.find(r=>r.id===Math.floor(reg.vaultId/s.network.users_per_realm)).rpc_url[0];
    assert.equal(await s.rpc(realm,'psy_get_user_tree_leaf_hash',{checkpoint_id:s.checkpoint,user_id:reg.vaultId}),report.result.endUserLeafHash,'cannot recreate a historical snapshot after a later vault mutation');
    const amount=async(u,a,o)=>decodeAmount(await Promise.all([s.slot(u,a,o),s.slot(u,a,o+1)]));
    for(const u of ids){balances[u]={native:await s.slot(u,0,0),a:await amount(u,49,0),b:await amount(u,50,0)};
      for(const v of ids)if(u!==v){pending[u+':'+v]={native:await s.slot(u,0,3+2*v)-await s.slot(v,0,4+2*u)};
        for(const a of assets)pending[u+':'+v][a]=await amount(u,a,33554453+4*v)-await amount(v,a,33554455+4*u);
        assert.ok(Object.values(pending[u+':'+v]).every(n=>n>=0n));}}
    const pair=async name=>{const off=abi.contract.state.find(f=>f.name===name).offset;return amount(reg.vaultId,51,off);};
    const fields=await s.fields(reg.vaultId,51,abi,['batch_ready','batch_phase','batch_id']);
    const result={checkpoint:s.checkpoint,balances,pending,fields,reserveA:await pair('reserve_a'),reserveB:await pair('reserve_b'),totalShares:await pair('total_shares')};
    save(p,result);save(link,{snapshotSha256:sha256(readFileSync(p)),precedingFormalSha256:reportSha256,scope:'Pinned RPC observation after exact preceding included UPS, while its vault end leaf is unchanged; not independently verified slot Merkle proofs'});return result;
  };
  try {
    await fresh();await unresolved();await adapter.warm();
    await ordinaryStep('core-issuer-setup-v1','issuer_setup',{symbolA:5325121n,symbolB:5325122n});
    await ordinaryStep('core-trader-assets-v1','trader_claim_assets');
    await ordinaryStep('core-activation-fund-v1','activation_funding');
    await formalStep('core-activate-v1','batch_maintenance');
    let s=await fresh();await ordinaryStep('core-lp-open-v1','lp_open',{deadline:BigInt(s.checkpoint+4096)});
    await ordinaryStep('core-lp-sponsor-v1','sponsor_batch',{nonce:1n});
    await formalStep('core-lp-commit-v1','batch_commit',1);await formalStep('core-lp-settle-v1','batch_settle',1);
    const lp=await snapshot('core-after-lp-v1','core-lp-settle-v1');assert.equal(lp.reserveA,20n*10n**18n);assert.equal(lp.reserveB,lp.reserveA);assert.equal(lp.totalShares,lp.reserveA);
    s=await fresh();let quote=swapQuote(10n**18n,lp.reserveA,lp.reserveB);
    await ordinaryStep('core-swap-open-v1','swap_open',{deadline:BigInt(s.checkpoint+4096),minOut:quote*99n/100n,reserveA:lp.reserveA,reserveB:lp.reserveB,quote});
    await ordinaryStep('core-swap-sponsor-v1','sponsor_batch',{nonce:2n});
    await formalStep('core-swap-commit-v1','batch_commit',2);await formalStep('core-swap-settle-v1','batch_settle',2);
    await ordinaryStep('core-swap-claim-v1','swap_claim_close');const swapped=await snapshot('core-after-swap-v1','core-swap-settle-v1');
    assert.equal(swapped.reserveA,lp.reserveA+10n**18n);assert.equal(swapped.reserveB,lp.reserveB-quote);
    assert.equal(swapped.balances[668800].b,80n*10n**18n+quote);
    s=await fresh();quote=swapQuote(10n**18n,swapped.reserveA,swapped.reserveB);
    await ordinaryStep('core-cancel-open-v1','cancelled_swap_open',{deadline:BigInt(s.checkpoint+4096),minOut:quote*99n/100n,reserveA:swapped.reserveA,reserveB:swapped.reserveB,quote});
    await ordinaryStep('core-cancel-sponsor-v1','sponsor_batch',{nonce:3n});
    await formalStep('core-cancel-commit-v1','batch_commit',3);await formalStep('core-cancel-settle-v1','batch_settle',3);
    s=await fresh();const nativePending=await s.slot(reg.vaultId,0,3+2*668800)-await s.slot(668800,0,4+2*reg.vaultId);
    await ordinaryStep('core-refund-claim-v1','refund_claim_close',{observedNativePending:nativePending});
    const after=await snapshot('core-final-v1','core-cancel-settle-v1');assert.equal(after.reserveA,swapped.reserveA);assert.equal(after.reserveB,swapped.reserveB);
    assert.deepEqual(after.balances[668800],{...after.balances[668800],a:swapped.balances[668800].a,b:swapped.balances[668800].b});
    assert.ok(Object.values(after.pending).every(p=>Object.values(p).every(n=>n===0n)),'owned cohort pending asset remains');
    for(const a of ['a','b'])assert.equal(Object.values(after.balances).reduce((n,b)=>n+b[a],0n),200n*10n**18n,'QA supply conservation');
    const fees=outputs.reduce((n,v)=>n+v.fee,0n);assert.equal(Object.values(after.balances).reduce((n,b)=>n+b.native,0n)+fees,995999992000n,'Native fee conservation');
    assert.equal(after.balances[reg.vaultId].a,after.reserveA);assert.equal(after.balances[reg.vaultId].b,after.reserveB);
    const terminalState=await fresh(),offset=n=>abi.contract.state.find(f=>f.name===n).offset;
    assert.equal(await terminalState.slot(reg.vaultId,51,offset('consumed')+668800),3n);assert.equal(await terminalState.slot(668800,51,offset('kind')),0n);
    assert.equal(outputs.filter(v=>v.type==='ordinary').length,11);assert.equal(outputs.filter(v=>v.type==='formal-core').length,7);
    save(completed,{at:new Date().toISOString(),marketId:51,vaultId:reg.vaultId,outputs,totalFees:fees,actualSwaps:1,cancelledOrdersRefunded:1,allKnownOutboxesClaimed:true,
      ordinarySdkClaimsVerified:true,browserUiAccepted:false,qualifiedRandomness:false,globalOrderCompleteness:false,after,
      boundary:'Current-chain selected-order deterministic AMM and ordinary SDK wallets only; no browser/UI, global inclusion, randomized ordering, performance comparison or production claim.'});
    console.log('CORE_JOURNEY_CONFIRMED',outputs.length,String(fees));
  } finally {await adapter.close();for(const w of workers.values())await w.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){assert.equal(process.argv.length,3,'OWNED_QA_CASE');await runCoreAmmJourney(process.argv[2]);}
