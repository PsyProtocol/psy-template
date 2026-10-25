import{readdir,readFile}from'node:fs/promises';import{join}from'node:path';
// Narrowly recognize the observed pre-call SDK transport failure. Anything
// incomplete, post-call, unknown, or containing saved UPS material fails closed.
export async function preSessionTransportFailure(directory,urls,publicKeyHash){
 let names;try{names=await readdir(directory);}catch(e){if(e.code==='ENOENT')return false;throw e;}
 if(names.length!==1||names[0]!=='failure.json')return false;
 let f;try{f=JSON.parse(await readFile(join(directory,'failure.json'),'utf8'));}catch{return false;}
 if(f.ok!==false||f.broadcastMayHaveBeenAttempted!==false||f.automaticRetry===true||f.phase!=='start-compact-session'||typeof f.reason!=='string')return false;
 let reason=f.reason;
 if(typeof publicKeyHash==='string'&&/^[0-9a-f]{64}$/.test(publicKeyHash)){
  const prefix=`User ${publicKeyHash} not registered. Please register first: `;
  if(reason.startsWith(prefix))reason=reason.slice(prefix.length);
 }
 // The pinned SDK also emitted "Request error" for the same pre-call send
 // failure. Bind BOTH displayed URLs, not just the outer provider label.
 return urls.some(url=>{let target;try{target=new URL(url).href;}catch{return false;}
  return ['Connection error','Request error'].some(label=>reason.startsWith(label+' to '+url.replace(/\/$/,'')+': error sending request for url ('+target+')'));
 });
}
