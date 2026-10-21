// A second real process uses the identical formal route and durable journal.
// It must be rejected before any proving or transmission while the first holds it.
import assert from 'node:assert/strict';
import {read, save} from '../../batching/admission/liveSupport.mjs';
import {loadOptions} from '../config.mjs';
import {createPublicWalletAdapter} from '../publicWalletAdapter.mjs';
import {ExecutionJournal} from '../journal.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const [optionsPath, taskPath, output] = process.argv.slice(2), o = await loadOptions(optionsPath);
const adapter = await createPublicWalletAdapter(o, {runDriver: promisify(execFile)});
let proofs = 0, transmissions = 0;
const originalProve = adapter.prove, originalSubmit = adapter.submit;
adapter.prove = async t => {proofs++; return originalProve(t);};
adapter.submit = async (...a) => {transmissions++; return originalSubmit(...a);};
const journal = new ExecutionJournal({directory: o.runtimeDirectory, network: o.network, vaultId: o.vaultId, fingerprint: o.fingerprint});
try {
 let failure;
 try {await journal.execute({task: read(taskPath), ...adapter});} catch (e) {failure = {name: e.name, message: e.message};}
 assert.equal(failure?.name, 'VaultBusy'); assert.equal(proofs, 0); assert.equal(transmissions, 0);
 save(output, {checkedAt: new Date().toISOString(), pid: process.pid, vaultId: o.vaultId, scope: 'same durable runtime, independent OS processes; not independent-host consensus contention', failure, proofs, transmissions});
} finally {await adapter.close?.();}
