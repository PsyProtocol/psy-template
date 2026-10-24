// Actual formal CLI re-entry after closed ordinary claim. Financial journal
// must remain byte-identical; no replacement payment is authorized by this test.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ExecutionJournal} from '../../executor/journal.mjs';
import {run,save} from '../../batching/admission/liveSupport.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
const [base]=process.argv.slice(2),root=dirname(base),home=join(base,'controllers-initialized-v1/service-recovery');
assert.ok(existsSync(join(home,'public/SERVICE-LIVE-COMPLETE-v1.json')));
const config=join(home,'route/executor.json'),o=JSON.parse(readFileSync(config));
const journal=new ExecutionJournal({directory:o.runtimeDirectory,network:o.network,vaultId:o.vaultId,fingerprint:o.fingerprint});
assert.equal((await journal.unresolved()).length,0);
const digest=()=>sha256(JSON.stringify(readdirSync(journal.directory).filter(n=>n.endsWith('.json')).sort()
 .map(name=>({name,sha256:sha256(readFileSync(join(journal.directory,name)))}))));
const before=digest(),cli=fileURLToPath(new URL('../run.mjs',import.meta.url)),log=join(root,'composition-service-terminal-cli-v1.log');
const timing=await run(process.execPath,[cli,config,'once'],log,{});
const rows=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
assert.equal(rows.at(-1).status,'completed');assert.equal(digest(),before);
assert.equal((await journal.records()).filter(r=>r.status==='broadcast-intent').length,2);
save(join(root,'composition-service-terminal-cli-v1.json'),{checkedAt:new Date().toISOString(),status:'completed',
 configurationSha256:sha256(readFileSync(config)),cliSha256:sha256(readFileSync(cli)),timing,
 financialJournalSha256:before,financialJournalUnchanged:true,newBroadcasts:0,broadcast:false,
 scope:'actual formal CLI once on terminal controller after ordinary claim; complete source/dependency/startup checks retained; no transaction or proof-generation speedup claim'});
console.log('terminal formal CLI completed without changing the financial journal');
