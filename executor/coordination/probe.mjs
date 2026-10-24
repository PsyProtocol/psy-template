// Deployment preflight ONLY. Emits a scope manifest or reads its shared ledger;
// never acquires a lease, prepares a proof, signs, submits or migrates history.
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {loadCompositionConfig} from '../../composition/config.mjs';
import {decodeDocument} from '../../composition/codec.mjs';
import {createCoordinatedJournal} from './client.mjs';import {coordinationScope} from './scope.mjs';
const[file,mode='scope']=process.argv.slice(2);assert.ok(file&&['scope','read'].includes(mode));
const o=await loadCompositionConfig(file),i=decodeDocument(await readFile(o.intent,'utf8')),p=decodeDocument(await readFile(o.plan,'utf8'));
const scope=coordinationScope({network:o.network,domainHash:i.terms.domainHash,sdkManifestHash:o.sdkManifestHash,
 vaultId:o.vaultId,fingerprint:o.fingerprint,publicKeyHash:o.publicKeyHash,intentId:i.id,
 registryHash:p.registryHash,walletSha256:o.walletSha256,artifactRoot:o.runtimeDirectory});
if(mode==='scope')console.log(JSON.stringify(scope,null,2));
else{
 const journal=await createCoordinatedJournal(o),rows=await journal.records(),pending=await journal.unresolved();
 console.log(JSON.stringify({scopeKey:scope.key,recordCount:rows.length,pending:pending.map(r=>({taskId:r.taskId,
  intentId:r.task.intentId,requestDirectory:r.proof.preparedDirectory})),scope:'read-only shared ledger; no host/storage identity or live financial acceptance claimed'},null,2));
}
