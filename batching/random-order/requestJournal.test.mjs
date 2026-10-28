import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile,writeFile,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {RandomRequestJournal} from './requestJournal.mjs';
import {runRandomCandidate} from '../../executor/randomCandidate.mjs';
const h=n=>BigInt(n).toString(16).padStart(64,'0');
const candidate=()=>({version:1,networkMagic:'1384803358401154921',market:'amm',marketId:'1000',vaultId:'100',epoch:'1',cutoff:'100',sealByCheckpoint:'110',drawCheckpoint:'120',round:'3',settleUntil:'150',recoveryAt:'160',maxFee:'2000200000',sourceId:h(1),chainRootAt1:h(2),codeRoot:h(3),layoutRoot:h(4),functionRoot:h(5),keyFingerprint:h(6),publicKeyHash:h(7),queueRoot:h(8),batchRoot:h(9),members:[200,201].map((owner,i)=>({owner:String(owner),nonce:String(i+1),termsRoot:h(i+10)}))});
const envelope=c=>({format:'psy-market-beacon-certificate-v1',sourceId:c.sourceId,chainRootAt1:c.chainRootAt1,round:c.round,drawCheckpoint:c.drawCheckpoint,sealIncludedCheckpoint:'105',seed:h(13),beaconProof:Buffer.from('PUBLIC-UNTRUSTED-PROOF').toString('base64'),sealInclusionProof:'AAAA',finalityProof:'AAAA'});
const copy=x=>JSON.parse(JSON.stringify(x));
async function fixture(fn){const directory=await mkdtemp(join(tmpdir(),'random-candidate-test-'));try{const c=candidate(),make=(value=c)=>new RandomRequestJournal({directory,candidate:value});await fn({directory,c,make});}finally{await rm(directory,{recursive:true,force:true});}}
async function files(directory){const out=[];for(const e of await readdir(directory,{withFileTypes:true})){const path=join(directory,e.name);if(e.isDirectory())out.push(...await files(path));else out.push(path);}return out;}
function blocked(r){for(const k of ['chainSealVerified','qualifiedSource','randomAuthorization','canSign','canBroadcast','canRefund'])assert.equal(r[k],false,k);}
test('pinning is idempotent, input/output mutation cannot change the stored request',()=>fixture(async({c,make})=>{
 const j=make();assert.equal((await j.inspect()).status,'not-fixed');const first=await j.freeze();blocked(first);const id=first.requestSha256;c.members[0].nonce='9';first.candidate.round='99';assert.equal((await j.freeze()).requestSha256,id);assert.equal((await make(candidate()).inspect()).candidate.round,'3');assert.equal((await j.inspect()).candidate.members[0].nonce,'1');
}));
test('set, epoch, round, source, deadline and identities cannot change after pinning',()=>fixture(async({c,make})=>{
 await make().freeze();const mutations=[x=>x.members.pop(),x=>x.members[0].nonce='3',x=>x.members[0].termsRoot=h(99),x=>x.queueRoot=h(99),x=>x.batchRoot=h(99),x=>x.epoch='2',x=>x.round='4',x=>x.sourceId=h(99),x=>x.drawCheckpoint='121',x=>x.cutoff='99',x=>x.sealByCheckpoint='109',x=>x.settleUntil='149',x=>x.recoveryAt='161',x=>x.maxFee='1',x=>x.codeRoot=h(99),x=>x.layoutRoot=h(99),x=>x.functionRoot=h(99),x=>x.publicKeyHash=h(99),x=>x.market='bondingcurve'];
 for(const mutate of mutations){const x=copy(c);mutate(x);await assert.rejects(make(x).freeze(),/original candidate/);}
 const x=copy(c);x.keyFingerprint=h(99);await assert.rejects(make(x).freeze(),/scope changed/);assert.equal((await make().inspect()).candidate.members.length,2);
}));
test('unverified seeds and proof claims are projected, deduplicated and never authorize a draw',()=>fixture(async({c,make,directory})=>{
 const j=make();await assert.rejects(j.observe(envelope(c)),/fixed first/);await j.freeze();const e=envelope(c);let r=await j.observe(e);blocked(r);assert.equal(r.evidenceObservations,1);assert.equal((await make().observe(e)).evidenceObservations,1);
 r=await j.observe({...e,seed:h(14)});blocked(r);assert.equal(r.conflictingUnverifiedSeedClaims,true);assert.equal(r.evidenceObservations,2);await assert.rejects(j.executionPlan(),x=>x.code==='RANDOM_SOURCE_UNAVAILABLE');
 const content=(await Promise.all((await files(directory)).map(p=>readFile(p,'utf8')))).join('\n');assert.ok(!content.includes(e.beaconProof));assert.ok(!content.includes('"beaconProof":'));assert.ok(content.includes('beaconProofSha256'));
 for(const patch of [{round:'2'},{drawCheckpoint:'121'},{chainRootAt1:h(3)},{sourceId:h(2)},{sealIncludedCheckpoint:'120'},{sealIncludedCheckpoint:'100'},{verified:true},{verifier:()=>true},{resourceUrl:'https://untrusted.invalid/'}])await assert.rejects(j.observe({...e,...patch}));
}));
test('proof encoding aliases do not create new observations; different proof bytes do not fix a seed',()=>fixture(async({c,make})=>{
 const j=make();await j.freeze();const e={...envelope(c),beaconProof:'AA=='};assert.equal((await j.observe(e)).evidenceObservations,1);assert.equal((await j.observe({...e,beaconProof:'AB=='})).evidenceObservations,1);
 const r=await j.observe({...e,beaconProof:'AQ=='});assert.equal(r.evidenceObservations,2);assert.equal(r.conflictingUnverifiedSeedClaims,false);blocked(r);
}));
test('timeouts are observations, never permission to refund, reroll, or use deterministic fallback',()=>fixture(async({c,make})=>{
 const j=make();await j.freeze();for(const cp of ['159','0160','0','4294967296',160])await assert.rejects(j.observeTimeout(cp));
 let r=await j.observeTimeout('160');blocked(r);assert.equal(r.timeoutObservations,1);assert.equal((await make().observeTimeout('160')).timeoutObservations,1);r=await make().recoveryPlan();blocked(r);assert.match(r.recoveryStatus,/blocked/);assert.equal(r.candidate.round,c.round);assert.deepEqual(r.candidate.members,c.members);
 await assert.rejects(make({...c,round:'4'}).freeze(),/original candidate/);await assert.rejects(j.executionPlan(),x=>x.code==='RANDOM_SOURCE_UNAVAILABLE');
}));
test('chain instances are separated and a foreign envelope cannot enter either request',()=>fixture(async({c,make})=>{
 await make().freeze();const other={...c,chainRootAt1:h(55)},j=make(other);assert.equal((await j.inspect()).status,'not-fixed');await j.freeze();await assert.rejects(j.observe(envelope(c)),/identity changed/);assert.notEqual((await j.inspect()).requestSha256,(await make().inspect()).requestSha256);
 assert.throws(()=>make({...c,networkMagic:'1'}));assert.throws(()=>new RandomRequestJournal({directory:'unused',candidate:c,verified:true}));
}));
test('same-host competing writers retain exactly one set and cannot replace the winner',()=>fixture(async({c,make})=>{
 const a=make(),b=make({...c,queueRoot:h(55)}),results=await Promise.allSettled([a.freeze(),b.freeze()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const win=results[0].status==='fulfilled'?a:b,lose=win===a?b:a;
 blocked(await win.inspect());await assert.rejects(lose.freeze(),/original candidate/);assert.equal((await win.inspect()).status,'fixed-awaiting-qualified-source');
}));
test('two independent same-host operator processes cannot pin different sets',()=>fixture(async({c,directory})=>{
 const ledger=join(directory,'process-ledger'),values=[c,{...c,queueRoot:h(55)}],children=[];
 try{
  for(let i=0;i<2;i++){const input=join(directory,'candidate-'+i+'.json');await writeFile(input,JSON.stringify(values[i]));const child=spawn(process.execPath,[fileURLToPath(new URL('../../executor/randomCandidate.mjs',import.meta.url)),'freeze',ledger,input,join(directory,'process-report-'+i+'.json')],{stdio:'ignore'});children.push({child,exit:once(child,'exit')});}
  const exits=await Promise.all(children.map(async({child,exit})=>{const timer=setTimeout(()=>child.kill('SIGKILL'),10000);try{return await exit;}finally{clearTimeout(timer);}}));assert.equal(exits.filter(([code])=>code===0).length,1);assert.equal(exits.filter(([code])=>code===1).length,1);
  const index=exits.findIndex(([code])=>code===0),winner=new RandomRequestJournal({directory:ledger,candidate:values[index]}),loser=new RandomRequestJournal({directory:ledger,candidate:values[1-index]});blocked(await winner.inspect());await assert.rejects(loser.freeze(),/original candidate/);assert.equal((await files(ledger)).filter(p=>/\d{8}-.*\.json$/.test(p)).length,1);
 }finally{for(const {child,exit}of children)if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exit;}}
}));
test('a killed writer is resumed from its published record, without resealing or losing members',()=>fixture(async({c,make,directory})=>{
 const module=new URL('./requestJournal.mjs',import.meta.url).href,journal=new URL('../../executor/journal.mjs',import.meta.url).href;
 const code=`import {RandomRequestJournal} from ${JSON.stringify(module)};import {ExecutionJournal} from ${JSON.stringify(journal)};const original=ExecutionJournal.prototype.append;ExecutionJournal.prototype.append=async function(event){await original.call(this,event);process.stdout.write('DURABLE\\n');setInterval(()=>{},1000);await new Promise(()=>{});};await new RandomRequestJournal({directory:process.argv[1],candidate:JSON.parse(process.argv[2])}).freeze();`;
 const child=spawn(process.execPath,['--input-type=module','-e',code,directory,JSON.stringify(c)],{stdio:['ignore','pipe','pipe']});let diagnostics='';child.stderr.on('data',x=>diagnostics+=x);const exit=once(child,'exit');
 try{await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('writer publication timeout: '+diagnostics)),10000);child.stdout.on('data',x=>{text+=x;if(text.includes('DURABLE')){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(Error('writer exited before kill: '+diagnostics));});});child.kill('SIGKILL');const [,signal]=await exit;assert.equal(signal,'SIGKILL');
  const r=await make().freeze();blocked(r);assert.deepEqual(r.candidate.members,c.members);const records=(await files(directory)).filter(p=>/\d{8}-.*\.json$/.test(p));assert.equal(records.length,1);
 }finally{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exit;}}
}));
test('corruption, financial terminal injection, and duplicate fixed records fail closed',()=>fixture(async({make,directory})=>{
 await make().freeze();const [path]=(await files(directory)).filter(p=>/\d{8}-.*\.json$/.test(p));const original=await readFile(path,'utf8'),record=JSON.parse(original);
 await writeFile(path,JSON.stringify({...record,requestSha256:'0'.repeat(64)}));await assert.rejects(make().inspect(),/original candidate/);await writeFile(path,JSON.stringify({...record,status:'included'}));await assert.rejects(make().inspect());await writeFile(path,original);
 const duplicate=path.replace('00000000-','00000001-');await writeFile(duplicate,original);await assert.rejects(make().inspect(),/duplicate fixed/);
}));
test('operator entry preserves reports and exposes no financial action or injected verifier',()=>fixture(async({c,directory})=>{
 const input=join(directory,'candidate.json'),report=join(directory,'report.json');await writeFile(input,JSON.stringify(c));blocked(await runRandomCandidate(['freeze',directory,input,report]));const first=await readFile(report);
 await assert.rejects(runRandomCandidate(['freeze',directory,input,report]),x=>x.code==='EEXIST');assert.deepEqual(await readFile(report),first);await assert.rejects(runRandomCandidate(['settle',directory,input,join(directory,'no.json')]));
 await writeFile(input,JSON.stringify({...c,verifierUrl:'https://untrusted.invalid/'}));await assert.rejects(runRandomCandidate(['inspect',directory,input,join(directory,'invalid.json')]));
}));
test('first freeze refuses an occupied report before pinning any candidate',()=>fixture(async({c,directory})=>{
 const input=join(directory,'candidate.json'),report=join(directory,'occupied.json'),ledger=join(directory,'new-ledger');await writeFile(input,JSON.stringify(c));await writeFile(report,'original report');
 await assert.rejects(runRandomCandidate(['freeze',ledger,input,report]),x=>x.code==='EEXIST');assert.equal(await readFile(report,'utf8'),'original report');assert.equal((await new RandomRequestJournal({directory:ledger,candidate:c}).inspect()).status,'not-fixed');
}));
test('post-pin report failure retains intent and gives the exact reconciliation identity',()=>fixture(async({c,directory})=>{
 const input=join(directory,'candidate.json'),report=join(directory,'report.json'),ledger=join(directory,'ledger');await writeFile(input,JSON.stringify(c));
 const probe=await open(input,'r'),prototype=Object.getPrototypeOf(probe),original=prototype.writeFile;await probe.close();
 prototype.writeFile=async function(data,...args){if(typeof data==='string'&&data.includes('"canRefund": false'))throw Object.assign(Error('simulated report write failure'),{code:'ENOSPC'});return original.call(this,data,...args);};
 try{await assert.rejects(runRandomCandidate(['freeze',ledger,input,report]),e=>e.code==='RANDOM_CANDIDATE_RECONCILE_REQUIRED'&&/original request/.test(e.message));}finally{prototype.writeFile=original;}
 const j=new RandomRequestJournal({directory:ledger,candidate:c}),state=await j.inspect(),intent=JSON.parse(await readFile(report+'.intent.json','utf8'));assert.equal(state.status,'fixed-awaiting-qualified-source');assert.equal(intent.requestSha256,state.requestSha256);assert.equal((await readFile(report)).length,0);blocked(state);
 const restored=await runRandomCandidate(['inspect',ledger,input,join(directory,'reconciled.json')]);assert.equal(restored.requestSha256,intent.requestSha256);blocked(restored);
}));
test('observation backpressure retains the original request and allows exact duplicates',()=>fixture(async({c,make})=>{
 const j=make();await j.freeze();for(let i=1;i<=32;i++)await j.observe({...envelope(c),seed:h(i)});const full=await j.inspect();assert.equal(full.evidenceObservations,32);blocked(full);
 assert.equal((await j.observe({...envelope(c),seed:h(1)})).evidenceObservations,32);await assert.rejects(j.observe({...envelope(c),seed:h(33)}),/capacity reached/);await assert.rejects(j.observeTimeout('160'),/capacity reached/);assert.equal((await j.inspect()).requestSha256,full.requestSha256);blocked(await j.recoveryPlan());
}));
test('a conflicting CLI request identifies the retained request separately from the proposal',()=>fixture(async({c,make,directory})=>{
 const retained=await make().freeze(),proposed={...c,round:'4'},input=join(directory,'changed.json');await writeFile(input,JSON.stringify(proposed));
 await assert.rejects(runRandomCandidate(['freeze',directory,input,join(directory,'conflict.json')]),e=>e.code==='RANDOM_CANDIDATE_RECONCILE_REQUIRED'&&e.retainedRequestSha256===retained.requestSha256&&e.requestedRequestSha256!==e.retainedRequestSha256);blocked(await make().inspect());
}));
