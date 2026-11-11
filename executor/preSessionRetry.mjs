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

// This exact frozen-SDK error is raised while materializing the initial user
// tree, before calls. Readiness is not authorization: the caller must wait for
// this same checkpoint's proof, recheck the original task and run normal startup.
// Never classify a post-call failure or any directory containing UPS material.
export async function preSessionMissingCheckpointProof(directory){
 let names;try{names=await readdir(directory);}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(names.length!==1||names[0]!=='failure.json')return null;
 let f;try{f=JSON.parse(await readFile(join(directory,'failure.json'),'utf8'));}catch{return null;}
 if(f.ok!==false||f.broadcastMayHaveBeenAttempted!==false||f.automaticRetry!==false||f.phase!=='start-compact-session'||typeof f.reason!=='string')return null;
 const match=/^User tree proof not found for checkpoint_id ([1-9][0-9]*)$/.exec(f.reason);
 if(!match||match[0]!==f.reason)return null;const cp=Number(match[1]);
 return Number.isSafeInteger(cp)&&cp<2**32?cp:null;
}
