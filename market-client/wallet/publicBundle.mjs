// Project only public statements and proofs. Never retain signing witness,
// hydrated command/read witnesses, private key material or the whole trace.
const ok=(v,m)=>{if(!v)throw Error(m);};
function base64(bytes){
 ok(Array.isArray(bytes)&&bytes.length>0&&bytes.length<=2_000_000,"Bounded public proof bytes required");
 const a=Uint8Array.from(bytes,x=>{ok((typeof x==="bigint"||Number.isInteger(x))&&BigInt(x)>=0n&&BigInt(x)<=255n,"Invalid proof byte");return Number(x);});
 let text="";for(let i=0;i<a.length;i+=32768)text+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(text);
}
export function publicMarketProofBundle(trace,outputs,parse){
 const jobs=outputs.map(parse),start=jobs.filter(x=>x.type==="ups_start"),sign=jobs.filter(x=>x.type==="zk_sign");
 ok(start.length===1&&sign.length===1,"One start and ordinary signature proof required");
 const keyed=new Map();for(const job of jobs.filter(x=>x.type==="cfc_step")){const id=String(job.data.step_index);ok(!keyed.has(id),"Duplicate call proof");keyed.set(id,job.data);}
 const steps=[];trace.steps.forEach((step,index)=>{
  if(!["standard","burn_fee"].includes(step.kind))return;
  const job=keyed.get(String(index));ok(job&&Array.isArray(job.proof_bytes)&&job.proof_bytes.length===2,"Missing full CFC/UPS proof pair");
  steps.push({contract_id:step.contract_id,method_id:step.method_id,method_name:step.method_name,cfc_session_root:step.cfc_witness.session_proof_tree_root,state_delta:step.state_delta,inclusion:step.cfc_inclusion_proof,end_header:step.end_header,cfc_proof_b64:base64(job.proof_bytes[0]),ups_proof_b64:base64(job.proof_bytes[1]),ups_known_root:job.baton.known_proof_tree_root});
 });
 ok(steps.length===keyed.size,"Unaccounted call proof");
 const signing=trace.steps.filter(s=>s.kind==="zk_sign");ok(signing.length===1&&signing[0].sign_circuit_source?.kind==="zk_builtin","Ordinary built-in signature required");
 return {schema:1,anchor:trace.anchor,start_header:start[0].data.current_header,start_proof_b64:base64(start[0].data.proof),steps,sign_proof_b64:base64(sign[0].data.proof),public_key_param:signing[0].public_key_param,sig_hash:trace.finalization.sig_hash};
}
