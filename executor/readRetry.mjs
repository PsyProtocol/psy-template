import {ContractMetadataNotReady} from './contractMetadataRead.mjs';
export class ReadUnavailable extends Error {
 constructor(message,options){super(message,options);this.name='ReadUnavailable';}
}
// Only pass read operations here. Broadcasts never use this helper.
export async function retryRead(operation,{attempts=3,delayMs=1000}={}){
 let last;for(let i=0;i<attempts;i++){
  try{return await operation();}catch(e){
   const emptyJson=e instanceof SyntaxError&&e.message==='Unexpected end of JSON input';
   if(!emptyJson&&!(e instanceof ContractMetadataNotReady)&&!(e instanceof TypeError)&&!['TimeoutError','AbortError'].includes(e.name)&&!([500,502,503,504].includes(e.status)))throw e;
   last=e;if(i+1<attempts)await new Promise(r=>setTimeout(r,delayMs*(i+1)));
  }
 }
 throw new ReadUnavailable('public read unavailable after bounded retries',{cause:last});
}
