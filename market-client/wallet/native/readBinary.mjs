// Read extension-owned resources with a hard streaming bound, before compiling
// or allocating a concatenated binary. No unbounded arrayBuffer fallback.
export async function readBoundedBinary(response,maximum=20_000_000){
 if(!response?.body||!Number.isSafeInteger(maximum)||maximum<8)throw Error("Bounded verifier resource stream required");
 const reader=response.body.getReader();let complete=false,total=0;const chunks=[];
 try{
  const declared=response.headers?.get("content-length");
  if(declared!=null&&(!/^(0|[1-9]\d{0,19})$/.test(declared)||BigInt(declared)>BigInt(maximum)))throw Error("Verifier resource declared size limit");
  for(;;){
   const {done,value}=await reader.read();if(done){complete=true;break;}
   if(!(value instanceof Uint8Array)||value.byteLength>maximum-total)throw Error("Verifier resource streaming size limit");
   total+=value.byteLength;chunks.push(value.slice());
  }
  if(total<8||(declared!=null&&BigInt(declared)!==BigInt(total)))throw Error("Verifier resource byte length mismatch");
  const bytes=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
 }finally{
  if(!complete)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
