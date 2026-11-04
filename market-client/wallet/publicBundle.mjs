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
 const externalJobs=new Map();for(const job of jobs.filter(x=>x.type==='external_proof')){const id=String(job.data.step_index);ok(!externalJobs.has(id),'Duplicate external proof output');externalJobs.set(id,job.data);}
 const external_steps=[],steps=[];let leafIndex=1;trace.steps.forEach((step,index)=>{
  ok(['standard','burn_fee','external_proof','zk_sign'].includes(step.kind),'Unsupported public proof step');
  if(step.kind==='external_proof'){
   const job=externalJobs.get(String(index));ok(job,'Missing external proof output');
   const proof_b64=base64(job.proof);ok(typeof step.proof==='string'&&step.proof===proof_b64,'Exact external proof bytes required');
   external_steps.push({before_call:steps.length,fingerprint:step.fingerprint,leaf_index:leafIndex++,start_root:step.proof_tree_start_root,end_root:step.proof_tree_end_root,proof_b64});return;
  }
  if(!["standard","burn_fee"].includes(step.kind))return;
  const job=keyed.get(String(index));ok(job&&Array.isArray(job.proof_bytes)&&job.proof_bytes.length===2,"Missing full CFC/UPS proof pair");
  steps.push({contract_id:step.contract_id,method_id:step.method_id,method_name:step.method_name,cfc_session_root:step.cfc_witness.session_proof_tree_root,state_delta:step.state_delta,inclusion:step.cfc_inclusion_proof,end_header:step.end_header,cfc_proof_b64:base64(job.proof_bytes[0]),ups_proof_b64:base64(job.proof_bytes[1]),ups_known_root:job.baton.known_proof_tree_root});
  leafIndex+=2;
 });
 ok(steps.length===keyed.size,"Unaccounted call proof");
 ok(external_steps.length===externalJobs.size&&external_steps.length<=3,'Complete bounded external proof prefix required');
 const signing=trace.steps.filter(s=>s.kind==="zk_sign");ok(signing.length===1&&signing[0].sign_circuit_source?.kind==="zk_builtin","Ordinary built-in signature required");
 return {schema:external_steps.length?2:1,anchor:trace.anchor,start_header:start[0].data.current_header,start_proof_b64:base64(start[0].data.proof),steps,sign_proof_b64:base64(sign[0].data.proof),public_key_param:signing[0].public_key_param,sig_hash:trace.finalization.sig_hash,...(external_steps.length?{external_steps}:{})};
}
