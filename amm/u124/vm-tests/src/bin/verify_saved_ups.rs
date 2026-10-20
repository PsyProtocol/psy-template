//! Offline verification of a preserved public request. Never sends an RPC.
use anyhow::{ensure,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::PrimeField64},plonk::{circuit_data::VerifierCircuitData,proof::ProofWithPublicInputs}};
use psy_client_data::config::store_config::{C,D};
use psy_core::{constants::chain_id::PsyChainNetworkType,job::job_id::ProvingJobCircuitType};
use psy_plonky2_circuits::{circuit_library::end_cap_verifier_data::get_end_cap_alt_verifier_data_for_network,generated::cached_common_data::get_cached_common_data_library};
use psy_provider::request::QSubmitEndCapRPCRequest;
use psy_template_u124_markets::proof_binding::validate_endcap_binding;
use sha2::{Digest,Sha256};
use std::{fs,io::Write};
fn main()->Result<()>{
 let a=std::env::args().collect::<Vec<_>>();ensure!(a.len()==3,"PUBLIC_REQUEST FRESH_REPORT; offline only");
 let bytes=fs::read(&a[1])?;let request:QSubmitEndCapRPCRequest<F>=serde_json::from_slice(&bytes)?;
 let proof:ProofWithPublicInputs<F,C,D>=bincode::deserialize(&request.proof)?;
 let key=get_end_cap_alt_verifier_data_for_network::<F>(PsyChainNetworkType::InternalTestnet)?.to_verifier_data::<C,D>();
 let library=get_cached_common_data_library::<C,D>();let common=library.get_common_circuit_data_ref(ProvingJobCircuitType::UserEndCap)?.clone();
 VerifierCircuitData{verifier_only:key,common}.verify(proof.clone())?;
 validate_endcap_binding(&request.user_ec_input.core,&proof.public_inputs)?;
 let c=&request.user_ec_input.core;let report=serde_json::json!({"requestSha256":format!("{:x}",Sha256::digest(&bytes)),"fullProofVerifiedAgainstPinnedNodeKeyAndCommon":true,"metadataEndpointsAndFeesVerified":true,"userId":c.new_user_leaf.user_id.to_canonical_u64(),"nonce":c.new_user_leaf.nonce.to_canonical_u64(),"sourceCheckpoint":c.checkpoint_id,"startUserLeafHash":c.state_transition.start_user_leaf_hash.to_string(),"endUserLeafHash":c.state_transition.end_user_leaf_hash.to_string(),"publicKeyHash":c.new_user_leaf.public_key.to_string(),"broadcast":false});
 let mut f=fs::OpenOptions::new().write(true).create_new(true).open(&a[2])?;f.write_all(&serde_json::to_vec_pretty(&report)?)?;f.write_all(b"\n")?;f.sync_all()?;Ok(())
}
