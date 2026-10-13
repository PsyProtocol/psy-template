import {open,link,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';

// Readers see a complete file, and an existing destination is never replaced.
// A process exit during writing leaves only an unreferenced temporary file.
export async function publishFile(path,contents){
 const temporary=path+'.'+randomUUID()+'.tmp';
 try{
  const file=await open(temporary,'wx',0o600);
  try{await file.writeFile(contents);await file.sync();}finally{await file.close();}
  await link(temporary,path);
  const directory=await open(dirname(path),'r');
  try{await directory.sync();}finally{await directory.close();}
 }finally{
  await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
 }
}
