// Read existing broadcasts and save their confirmed receipts locally.
// This entry point has no submit callback or wallet mutation.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {ExecutionJournal} from '../journal.mjs';
import {createPublicWalletAdapter} from '../publicWalletAdapter.mjs';
const directory=resolve(process.argv[2]);
const a=JSON.parse(await readFile(join(directory,'amm.json')));
const journal=new ExecutionJournal({directory:a.runtimeDirectory,network:a.network,vaultId:a.vaultId,fingerprint:a.fingerprint});
const adapter=await createPublicWalletAdapter(a);
const recovered=await journal.reconcile(adapter.reconcile);
if(recovered.length!==1||recovered[0].result.status!=='included'||(await journal.unresolved()).length)throw Error('original broadcast not conclusively recovered');
await writeFile(join(directory,'acceptance/http500-recovered-receipt.json'),JSON.stringify(recovered,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({recovered:recovered.map(x=>({taskId:x.taskId,checkpoint:x.result.checkpoint,status:x.result.status}))}));
