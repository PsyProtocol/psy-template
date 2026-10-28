//! Synthetic historical membership, not a real market or finalized checkpoint.
use anyhow::{ensure,Result};
use plonky2::field::{goldilocks_field::GoldilocksField as F,types::Field};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_template_u124_markets::{seal_inclusion::{SealLayout,SealOpening,verify_seal_opening},seal_inclusion_circuit::SealCircuit,random_order::{frozen_root,FIELDS}};
use std::{fs,time::Instant};
#[path="support/seal_fixture.rs"] mod seal_fixture;
fn fixture(slot:u64,kind:u64)->Result<([u64;FIELDS],SealLayout,Q<F>,SealOpening)>{seal_fixture::fixture_with_root(slot,kind,frozen_root)}
#[test]fn same_checkpoint_paths_and_all_four_packed_root_limbs()->Result<()>{
 for (kind,slot) in [1,2].into_iter().flat_map(|k|(0..=3).map(move|s|(k,s))){let(v,l,r,p)=fixture(slot,kind)?;verify_seal_opening(&v,l,r,&p)?;ensure!(p.root_words.len()==if slot==0{1}else{2},"packed word count");}Ok(())
}
#[test]fn rejects_late_seal_substitution_roots_keys_and_malformed_paths()->Result<()>{
 let(v,l,r,p)=fixture(3,1)?;
 for case in 0..23{let mut p=p.clone();let mut v=v;let mut l=l;let mut root=r;
  match case{0=>p.checkpoint_id=120,1=>p.checkpoint_id=100,2=>root=Q::ZERO,3=>p.chain_anchor_leaf.global_chain_root=Q::ZERO,4=>p.checkpoint_proof.index+=1,5=>p.state_roots.user_tree_root=Q::ZERO,6=>p.contract_leaf.code_root=Q::ZERO,7=>p.contract_leaf.state_layout_root=Q::ZERO,8=>p.contract_leaf.function_tree_root=Q::ZERO,9=>p.contract_leaf.state_layout_slot_count+=F::ONE,10=>p.user_leaf.public_key=Q::ZERO,11=>p.user_leaf.user_id+=F::ONE,12=>p.key_public_param=Q::ZERO,13=>p.user_proof.index+=1,14=>p.user_contract_proof.index+=1,15=>p.root_words[0].value=Q::ZERO,16=>{p.root_words.pop();},17=>p.root_words[1]=p.root_words[0].clone(),18=>{p.contract_proof.siblings.pop();},19=>v[52]+=1,20=>l.root_slot-=1,21=>p.user_leaf.nonce=F::ZERO,_=>p.user_leaf.last_checkpoint_id=F::from_canonical_u64(106)}
  ensure!(verify_seal_opening(&v,l,root,&p).is_err(),"accepted mutation {case}");
 }Ok(())
}
#[test]
#[ignore="one bounded membership component proof, three negative witness attempts, fresh output"]
fn conditional_seal_component_proof()->Result<()>{
 let out=std::env::var("SEAL_INCLUSION_OUT")?;fs::create_dir(&out)?;let(v,l,r,p)=fixture(3,1)?;verify_seal_opening(&v,l,r,&p)?;
 for(name,value)in[("statement",serde_json::json!({"fields":v.map(|n|n.to_string()).to_vec()})),("layout",serde_json::to_value(l)?),("opening",serde_json::to_value(&p)?)]{fs::write(format!("{out}/{name}.json"),serde_json::to_vec_pretty(&value)?)?;}
 let now=Instant::now();let c=SealCircuit::build(l)?;let build=now.elapsed().as_secs_f64();let now=Instant::now();let proof=c.prove(v,r,&p)?;let prove=now.elapsed().as_secs_f64();let now=Instant::now();c.verify_for(v,r,p.checkpoint_id,proof.clone())?;let verify=now.elapsed().as_secs_f64();
 let mut rejected=vec![];
 for name in ["late-checkpoint","wrong-stored-root","wrong-key"]{let mut bad=p.clone();match name{"late-checkpoint"=>bad.checkpoint_id=120,"wrong-stored-root"=>bad.root_words[0].value=Q::ZERO,_=>bad.key_public_param=Q::ZERO};let failed=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||c.prove(v,r,&bad)));ensure!(!matches!(failed,Ok(Ok(_))),"accepted circuit witness {name}");rejected.push(name);}
 let mut bad=v;bad[52]+=1;ensure!(c.verify_for(bad,r,p.checkpoint_id,proof.clone()).is_err(),"frozen set substitution");ensure!(c.verify_for(v,Q::ZERO,p.checkpoint_id,proof.clone()).is_err(),"root substitution");
 fs::write(format!("{out}/proof.bin"),bincode::serialize(&proof)?)?;fs::write(format!("{out}/REPORT.json"),serde_json::to_vec_pretty(&serde_json::json!({"schema":1,"scope":"synthetic historical membership relative to the supplied root; not certified finality, unpredictability, contract semantics or UPS","frozenRoot":frozen_root(&v)?.map(|n|n.to_string()),"checkpointRoot":r.to_string(),"sealCheckpoint":p.checkpoint_id,"rootSlot":l.root_slot,"rootWords":p.root_words.len(),"membershipComponentProofVerified":true,"finalityVerified":false,"randomAuthorization":false,"fullUpsVerified":false,"buildSeconds":build,"proveSeconds":prove,"verifySeconds":verify,"degreeBits":c.data.common.degree_bits(),"rejectedWitnesses":rejected,"financialOperations":0,"broadcast":false}))?)?;Ok(())
}
