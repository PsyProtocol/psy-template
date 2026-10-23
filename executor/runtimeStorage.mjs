// Financial runtime artifacts must survive OS temporary-directory cleanup.
// This checks location only; it does not attest a filesystem, backup or host.
import {realpathSync,statSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {tmpdir} from 'node:os';
function canonicalFuture(path){
 let parent=resolve(path),tail=[];
 for(;;){
  try{const actual=realpathSync(parent);if(tail.length&&!statSync(actual).isDirectory())throw Error('runtime parent is not a directory');return resolve(actual,...tail.reverse());}
  catch(error){if(error.code!=='ENOENT')throw error;const up=dirname(parent);if(up===parent)throw error;tail.push(parent.slice(up.length+(up===sep?0:1)));parent=up;}
 }
}
function under(path,root){const r=relative(root,path);return r===''||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep));}
export function assertDurableRuntimeDirectory(directory){
 if(typeof directory!=='string'||!directory)throw Error('runtimeDirectory is required');
 const path=canonicalFuture(directory),roots=[tmpdir(),'/tmp','/private/tmp','/var/tmp','/private/var/tmp','/run','/dev/shm'];
 for(const root of roots)if(under(path,canonicalFuture(root)))throw Error('financial runtimeDirectory is temporary; move the complete original journal, proofs and requests to persistent storage and reconcile before executing');
 if(/^\/private\/var\/folders\/[^/]+\/[^/]+\/[TC](?:\/|$)/.test(path))throw Error('financial runtimeDirectory is in macOS temporary storage');
 return path;
}
