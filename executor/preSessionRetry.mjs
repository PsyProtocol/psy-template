import{readdir,readFile}from'node:fs/promises';import{join}from'node:path';
// Narrowly recognize the observed pre-call SDK transport failure. Anything
// incomplete, post-call, unknown, or containing saved UPS material fails closed.
export async function preSessionTransportFailure(directory,urls){
 let names;try{names=await readdir(directory);}catch(e){if(e.code==='ENOENT')return false;throw e;}
 if(names.length!==1||names[0]!=='failure.json')return false;
 let f;try{f=JSON.parse(await readFile(join(directory,'failure.json'),'utf8'));}catch{return false;}
 if(f.ok!==false||f.broadcastMayHaveBeenAttempted!==false||f.phase!=='start-compact-session'||typeof f.reason!=='string')return false;
 return urls.some(url=>f.reason.startsWith('Connection error to '+url.replace(/\/$/,'')+': error sending request for url '));
}
