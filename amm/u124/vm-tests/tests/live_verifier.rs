//! Offline regression using preserved real requests. No RPC or mutation.
use anyhow::{ensure, Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F, types::{Field,PrimeField64}},plonk::proof::ProofWithPublicInputs};
use psy_client_data::config::store_config::{C,D};
use psy_provider::request::QSubmitEndCapRPCRequest;
use psy_template_u124_markets::{live_guard::verify_ups_with_session_manager,proof_binding::validate_endcap_binding};
use psy_ups_circuit::circuit_manager::core::PsyUPSStepCircuitManager;
use std::{fs,path::PathBuf,io::Write};
#[tokio::test]
#[ignore = "requires preserved isolated public proof fixtures and fresh result path"]
async fn stored_full_ups_reuse_matches_pinned_node_verifier() -> Result<()> {
 let base=PathBuf::from(std::env::var("LIVE_VERIFIER_FIXTURES")?);
 let output=PathBuf::from(std::env::var("LIVE_VERIFIER_RESULT")?);
 ensure!(psy_config::PSY_NETWORK_MAGIC==1384803358401154921,"regtest-domain test build required");
 std::env::set_var("PSY_MARKET_TESTNET_PROFILE","staging-bundled-regtest-20261020-v1");
 let cm=PsyUPSStepCircuitManager::<C,D>::new_with_config(psy_config::PSY_NETWORK_MAGIC);
 let names=["claim-faucet-bob-bundled-profile-v1","trader-claim-native-ft-v1","bob-initialize-nft-v1","bob-fund-four-vault-activation-v1","amm-activate-v1","orderbook-activate-v1","bondingcurve-activate-v1","nftmarket-activate-v1"];
 let mut cases=Vec::new();
 for name in names {
  let request:QSubmitEndCapRPCRequest<F>=serde_json::from_slice(&fs::read(base.join("attempts").join(name).join("request.json"))?)?;
  let proof:ProofWithPublicInputs<F,C,D>=bincode::deserialize(&request.proof)?;
  let profile=verify_ups_with_session_manager(&cm,&proof).await?;
  validate_endcap_binding(&request.user_ec_input.core,&proof.public_inputs)?;
  let mut changed=proof.clone();changed.public_inputs[0]+=F::ONE;
  ensure!(verify_ups_with_session_manager(&cm,&changed).await.is_err(),"tampered proof PI accepted");
  let mut core=request.user_ec_input.core.clone();core.stats.total_transactions+=F::ONE;
  ensure!(validate_endcap_binding(&core,&proof.public_inputs).is_err(),"unbound metadata count accepted");
  cases.push(serde_json::json!({"name":name,"fullProofVerified":true,"endpointsAndFeesBound":true,"tamperedPiRejected":true,"metadataCountTamperRejected":true,"calls":request.user_ec_input.core.stats.total_transactions.to_canonical_u64(),"endUserLeafHash":request.user_ec_input.core.state_transition.end_user_leaf_hash.to_string(),"profile":profile}));
 }
 let wrong:QSubmitEndCapRPCRequest<F>=serde_json::from_slice(&fs::read(base.join("attempts/claim-faucet-bob-v1/request.json"))?)?;
 let wrong_proof:ProofWithPublicInputs<F,C,D>=bincode::deserialize(&wrong.proof)?;
 ensure!(verify_ups_with_session_manager(&cm,&wrong_proof).await.is_err(),"sepolia-domain proof accepted against fixed Node key");
 let wrong_manager=PsyUPSStepCircuitManager::<C,D>::new_with_config(1384803358401151337);
 ensure!(verify_ups_with_session_manager(&wrong_manager,&wrong_proof).await.is_err(),"wrong session manager key accepted");
 let report=serde_json::json!({"scope":"offline re-verification of preserved full real UPS requests; not a performance measurement or broadcast","cases":cases,"wrongDomainProofRejected":true,"wrongManagerKeyRejected":true,"broadcast":false});
 let mut f=fs::OpenOptions::new().write(true).create_new(true).open(output)?;f.write_all(&serde_json::to_vec_pretty(&report)?)?;f.write_all(b"\n")?;f.sync_all()?;Ok(())
}
