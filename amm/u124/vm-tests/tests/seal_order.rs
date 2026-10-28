//! Conditional recursive component test. All identities/checkpoints/seed are
//! synthetic; no source certificate, actual market, SD-key or UPS is exercised.
use anyhow::{ensure,Result};
use bincode::Options;
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},plonk::{config::PoseidonGoldilocksConfig as C,proof::ProofWithPublicInputs}};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_template_u124_markets::{random_order::{decode_candidate_input,decode_frozen_fields,frozen_root,permutation},seal_inclusion::SealLayout,seal_order::SealOrderCircuit};
use sha2::{Digest,Sha256};
use std::{fs,path::PathBuf,time::Instant};
type Proof=ProofWithPublicInputs<F,C,2>;
fn proof(bytes:&[u8])->Result<Proof>{Ok(bincode::DefaultOptions::new().with_fixint_encoding().with_limit(2000000).reject_trailing_bytes().deserialize(bytes)?)}
#[test]
#[ignore="one new permutation and one recursive proof, three invalid witness attempts; fresh output and preserved inputs"]
fn linked_seal_and_order_proof()->Result<()>{
 let source=PathBuf::from(std::env::var("SEAL_ORDER_INPUT")?);let other=PathBuf::from(std::env::var("SEAL_ORDER_OTHER_CASE")?);let out=PathBuf::from(std::env::var("SEAL_ORDER_OUT")?);fs::create_dir(&out)?;
 let statement=fs::read(source.join("statement.json"))?;let fields=decode_frozen_fields(&statement)?;let layout_bytes=fs::read(source.join("layout.json"))?;let layout:SealLayout=serde_json::from_slice(&layout_bytes)?;
 let source_report:serde_json::Value=serde_json::from_slice(&fs::read(source.join("REPORT.json"))?)?;let checkpoint=source_report["sealCheckpoint"].as_u64().unwrap();let root:Q<F>=serde_json::from_value(source_report["checkpointRoot"].clone())?;
 let original=fs::read(source.join("proof.bin"))?;let seal=proof(&original)?;
 let other_input=fs::read(other.join("public/client-statement-v1.json"))?;let(other_fields,other_seed)=decode_candidate_input(&other_input)?;let other_order=proof(&fs::read(other.join("component-proofs-v1/permutation-proof.bin"))?)?;
 ensure!(frozen_root(&fields)?!=frozen_root(&other_fields)?,"negative test requires a different valid statement");
 let seed=[1,2,3,4];let rank=permutation(&fields,seed)?;let now=Instant::now();let circuit=SealOrderCircuit::build(layout)?;let build=now.elapsed().as_secs_f64();
 circuit.seal_resources().verify_for(fields,root,checkpoint,seal.clone())?;circuit.order_resources().verify_for(other_fields,other_seed,other_order.clone())?;
 let now=Instant::now();let order=circuit.order_resources().prove(fields,seed,rank)?;let order_time=now.elapsed().as_secs_f64();circuit.order_resources().verify_for(fields,seed,order.clone())?;
 let now=Instant::now();let linked=circuit.prove(&seal,&order)?;let prove_time=now.elapsed().as_secs_f64();let now=Instant::now();circuit.verify_for(fields,seed,root,checkpoint,linked.clone())?;let verify_time=now.elapsed().as_secs_f64();
 let mut rejected=vec![];
 for name in ["different-valid-frozen-set","modified-order-rank","modified-seal-checkpoint"]{
  let mut bad_seal=seal.clone();let mut bad_order=order.clone();match name{"different-valid-frozen-set"=>bad_order=other_order.clone(),"modified-order-rank"=>bad_order.public_inputs[9]+=F::ONE,_=>bad_seal.public_inputs[8]+=F::ONE}
  let attempt=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||circuit.prove(&bad_seal,&bad_order)));ensure!(!matches!(attempt,Ok(Ok(_))),"accepted invalid recursive witness {name}");rejected.push(name);
 }
 let mut bad_seed=seed;bad_seed[0]+=1;ensure!(circuit.verify_for(fields,bad_seed,root,checkpoint,linked.clone()).is_err(),"seed endpoint substitution");
 ensure!(fs::read(source.join("proof.bin"))?==original,"original proof changed");
 fs::write(out.join("candidate.json"),serde_json::to_vec_pretty(&serde_json::json!({"fields":fields.map(|n|n.to_string()).to_vec(),"seed":seed.map(|n|n.to_string())}))?)?;fs::write(out.join("layout.json"),layout_bytes)?;fs::write(out.join("order-proof.bin"),bincode::serialize(&order)?)?;fs::write(out.join("linked-proof.bin"),bincode::serialize(&linked)?)?;
 fs::write(out.join("REPORT.json"),serde_json::to_vec_pretty(&serde_json::json!({"schema":1,"scope":"synthetic fixed-resource recursive membership/order relation; not finality, qualified entropy, actual market semantics or UPS","sourceSealProofSha256":format!("{:x}",Sha256::digest(&original)),"frozenRoot":frozen_root(&fields)?.map(|n|n.to_string()),"checkpointRoot":root.to_string(),"sealCheckpoint":checkpoint,"seed":seed.map(|n|n.to_string()),"rank":rank,"linkedComponentProofVerified":true,"resourceBuildSeconds":build,"newOrderProofSeconds":order_time,"recursiveProofSeconds":prove_time,"linkedVerificationSeconds":verify_time,"degreeBits":circuit.data.common.degree_bits(),"parentVerifierSha256":format!("{:x}",Sha256::digest(bincode::serialize(&circuit.data.verifier_only)?)),"parentCommonSha256":format!("{:x}",Sha256::digest(bincode::serialize(&circuit.data.common)?)),"rejectedWitnesses":rejected,"finalityVerified":false,"beaconUnpredictabilityVerified":false,"marketSemanticsVerified":false,"randomAuthorization":false,"fullUpsVerified":false,"financialOperations":0,"broadcast":false}))?)?;
 Ok(())
}
