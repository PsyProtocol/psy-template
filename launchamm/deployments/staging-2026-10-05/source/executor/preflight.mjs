import {retryRead} from './readRetry.mjs';

// The caller must force the driver's PROVE_ONLY mode. Never use this for
// sign-and-submit: a transport error after broadcast can mean inclusion.
export async function retryProofOnlyPreflight(runDriver, options) {
 return retryRead(async()=>{
  try{return await runDriver();}
  catch(error){
   const output=(error.stderr??'')+'\n'+(error.stdout??'');
   if(/Connection error to https?:\/\/|error sending request for url \(https?:\/\//.test(output))
    throw new TypeError('proof-only preflight transport failed',{cause:error});
   throw error;
  }
 },options);
}
