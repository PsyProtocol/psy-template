import{SCENARIOS}from'./scenarios.mjs';
// Bounded QA supervisor. Financial work runs in a separate worker. Only the
// declared, fully included lifecycle checkpoint permits one new process.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {controllerDirectory} from './controllerDirectory.mjs';
import {PLANNED_RESTART, verifyRestart} from './processCheckpoint.mjs';
import {ExecutionJournal} from '../../executor/journal.mjs';
import {sha256} from '../../executor/requestBinding.mjs';
import {read, save} from '../../batching/admission/liveSupport.mjs';
const [base, scenario] = process.argv.slice(2);
assert.ok(base && SCENARIOS.includes(scenario));
const home = join(controllerDirectory(base), scenario), configFile = join(home, 'route/executor.json');
const config = read(configFile), configSha256 = sha256(readFileSync(configFile));
const planFile = join(base, 'public/RECOVERY-PROCESS-RESTART-PLAN-v1.json');
const planned = scenario === 'recovery' && existsSync(planFile);
const pointFile = join(home, 'public/PROCESS-RESTART-POINT-v1.json');
const worker = fileURLToPath(new URL('./executeRouteWorker.mjs', import.meta.url));
if (planned) {
  const plan = read(planFile);
  assert.equal(plan.vaultId, config.vaultId);
  assert.equal(plan.fingerprint, config.fingerprint);
  assert.equal(plan.publicKeyHash, config.publicKeyHash);
  assert.equal(plan.sdkManifestHash, config.sdkManifestHash);
  assert.equal(plan.controllerId, read(join(home, 'build/REGISTERED.json')).controllerId);
  assert.deepEqual(Object.keys(plan.sources).sort(),
    ['executeRoute.mjs','executeRouteWorker.mjs','financialHarness.mjs','processCheckpoint.mjs'].sort());
  for (const [name, digest] of Object.entries(plan.sources)) {
    assert.ok(['executeRoute.mjs','executeRouteWorker.mjs','financialHarness.mjs','processCheckpoint.mjs'].includes(name));
    assert.equal(sha256(readFileSync(fileURLToPath(new URL('./'+name, import.meta.url)))), digest);
  }
}
const attempts = [];
for (let index = 0; index < 2; index++) {
  assert.equal(sha256(readFileSync(configFile)), configSha256);
  const {pid, code, signal} = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, base, scenario], {stdio:'inherit',
      env:{...process.env, PSY_COMPOSITION_QA_RESTART_AFTER_WARM_OPEN:planned ? '1' : '0'}});
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({pid:child.pid, code, signal}));
  });
  attempts.push({pid, code, signal});
  if (code === 0) {
    if (planned && attempts.length === 2) {
      const resumed = read(join(home, 'public/PROCESS-RESTART-RESUMED-v1.json'));
      assert.equal(resumed.oldPid, attempts[0].pid);
      assert.equal(resumed.newPid, pid);
      assert.notEqual(resumed.oldPid, resumed.newPid);
      save(join(home, 'public/PROCESS-RESTART-COMPLETE-v1.json'), {
        checkedAt:new Date().toISOString(), configSha256, attempts, resumed,
        scope:'one planned real worker exit, new PID, exact original receipt reconciliation and later route completion; no unknown-broadcast retry or cross-machine takeover claim'});
    }
    break;
  }
  assert.ok(planned && index === 0 && code === PLANNED_RESTART && signal === null,
    'worker stopped; preserve original financial identity and review, no automatic retry');
  const journal = new ExecutionJournal({directory:config.runtimeDirectory, network:config.network,
    vaultId:config.vaultId, fingerprint:config.fingerprint});
  verifyRestart(read(pointFile), {exitCode:code, oldPid:pid, configSha256,
    records:await journal.records(), unresolved:(await journal.unresolved()).length});
  console.log('QA confirmed checkpoint worker exited; continuing exact journals in a new worker', pid);
}
