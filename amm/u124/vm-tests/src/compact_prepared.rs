//! Broadcast one immutable prepared UPS without constructing/proving it again.
//! The expected manifest digest comes from the durable Executor journal.
use super::{f, save, Guard};
use anyhow::{ensure, Context, Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::PrimeField64},plonk::proof::ProofWithPublicInputs};
use psy_client_common::{args::ContractCallData,data::qhashout::QHashOut};
use psy_client_data::{config::store_config::{C,D,PsyHasher},traits::qdatastore::{qmetadata::QMetaDataStoreReaderSync,qtreedata::QTreeDataStoreReaderSync}};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_provider::{provider::RpcProvider,request::QSubmitEndCapRPCRequest,session::TxStatus};
use psy_template_u124_markets::{batch_compact,proof_binding::validate_endcap_binding};
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{fs,io::Write,path::Path};
pub fn sha(bytes: &[u8])->String {format!("{:x}",Sha256::digest(bytes))}
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Manifest {version:u8,policy_sha256:String,calls_sha256:String,guard_sha256:String,preflight_sha256:String,request_sha256:String}
pub fn manifest(policy:&str,calls:&[u8],guard:&[u8],out:&Path)->Result<Manifest>{
 Ok(Manifest{version:1,policy_sha256:sha(&fs::read(policy)?),calls_sha256:sha(calls),guard_sha256:sha(guard),preflight_sha256:sha(&fs::read(out.join("preflight.json"))?),request_sha256:sha(&fs::read(out.join("request.json"))?)})
}
fn validate_anchor(actual:QHashOut<F>,old_key:QHashOut<F>,old_nonce:u64,start:QHashOut<F>,next_nonce:u64,key:QHashOut<F>,registered_fresh:bool)->Result<()>{
 if start==QHashOut::ZERO{ensure!(actual==QHashOut::ZERO&&old_nonce==0&&next_nonce==1&&(old_key==QHashOut::ZERO||old_key==key)&&registered_fresh,"fresh prepared account requires absent tree and authenticated registration");}
 else{ensure!(actual==start&&old_key==key&&old_nonce.checked_add(1)==Some(next_nonce),"prepared existing account anchor/nonce/key mismatch");}Ok(())
}
pub async fn broadcast(a:&[String],spec:&Value,fp:QHashOut<F>,key:QHashOut<F>,net:&psy_config::NetworkConfigGoldilocks,phase:&mut &'static str)->Result<()> {
 ensure!(a.len()==9,"broadcast-prepared POLICY CONFIG CALLS GUARD PREPARED EXPECTED_MANIFEST_SHA FRESH_OUT");
 *phase="verify-prepared-files";
 let source=Path::new(&a[6]);let out=Path::new(&a[8]);fs::create_dir(out)?;fs::File::open(out.parent().context("output parent")?)?.sync_all()?;
 let mb=fs::read(source.join("prepared.json"))?;ensure!(sha(&mb)==a[7],"prepared manifest differs from durable journal");
 let m:Manifest=serde_json::from_slice(&mb)?;ensure!(m.version==1,"prepared format");
 let calls=fs::read(&a[4])?;let gb=fs::read(&a[5])?;let pb=fs::read(source.join("preflight.json"))?;let rb=fs::read(source.join("request.json"))?;
 ensure!(m.policy_sha256==sha(&fs::read(&a[2])?)&&m.calls_sha256==sha(&calls)&&m.guard_sha256==sha(&gb)&&m.preflight_sha256==sha(&pb)&&m.request_sha256==sha(&rb),"prepared file substitution");
 let g:Guard=serde_json::from_slice(&gb)?;g.identity.validate(spec,"testnet",&fp.to_string(),&key.to_string())?;
 let required=g.identity.contracts.iter().map(|x|x.contract_id).collect::<std::collections::BTreeSet<_>>();let bound=g.dependencies.iter().map(|x|x.contract.contract_id).collect::<std::collections::BTreeSet<_>>();ensure!(required==bound&&bound.len()==g.dependencies.len(),"complete prepared dependency bindings");
 let p:Value=serde_json::from_slice(&pb)?;let data:ContractCallData=serde_json::from_slice(&calls)?;
 ensure!(p["benchmarkSourceCheckpoint"].is_null(),"historical source calibration proofs must never be broadcast");
 ensure!(p["fullUpsVerified"]==true&&p["exactStackAndSessionVerified"]==true&&p["broadcast"]==false&&p["callsSha256"]==m.calls_sha256&&p["guardSha256"]==m.guard_sha256,"prepared full stack/session report binding");
 let request:QSubmitEndCapRPCRequest<F>=serde_json::from_slice(&rb)?;
 let proof:ProofWithPublicInputs<F,C,D>=bincode::deserialize(&request.proof)?;
 *phase="verify-prepared-full-proof";
 psy_template_u124_markets::fixed_verifier::with_verifier(|verifier| {verifier.verify(proof.clone())?; Ok(())})?;
 let core=&request.user_ec_input.core;validate_endcap_binding(core,&proof.public_inputs)?;
 ensure!(p["core"]==serde_json::to_value(core)?,"prepared metadata swap");
 let user=core.new_user_leaf.user_id.to_canonical_u64();let nonce=core.new_user_leaf.nonce.to_canonical_u64();let source_cp=core.checkpoint_id.to_canonical_u64();
 ensure!(user==g.identity.vault_id&&core.new_user_leaf.public_key==key,"prepared user identity");
 let fee=core.stats.guta_fees_collected.to_canonical_u64().checked_add(core.stats.da_fees_collected.to_canonical_u64()).context("prepared fee overflow")?;
 ensure!(core.stats.guta_fees_collected==f(1_000_000_000)&&Some(core.stats.da_fees_collected.to_canonical_u64())==core.stats.slots_modified.to_canonical_u64().checked_mul(1000)&&(1_000_000_000..=1_000_100_000).contains(&fee),"prepared fee binding");
 let mut fields=data.software_defined_call.inputs.clone();ensure!(fields.len()==spec["witness_length"].as_u64().context("prepared width")?as usize&&(fields[73]==0||fields[73]==fee),"prepared witness fee");fields[73]=fee;
 let expected=batch_compact::calls(spec,&fields)?;ensure!(serde_json::to_value(&data.contract_calls)?==serde_json::to_value(&expected[..expected.len()-1])?&&core.stats.total_transactions==f(expected.len() as u64),"prepared complete call list/count");
 ensure!(g.valid_until_checkpoint<(1u64<<32)&&source_cp<=g.valid_until_checkpoint&&(fields[0]!=1||g.valid_until_checkpoint<=fields[3]),"prepared expiry");
 if psy_template_u124_markets::processor_policy::previous(spec)&&fields[0]==2{ensure!(source_cp==fields[3]&&data.software_defined_call.inputs[73]==fee&&p["orderingModel"]=="previous-checkpoint-seeded-v1"&&p["producerSourceCheckpoint"]==source_cp&&p["producerInfluence"]==true&&p["qualifiedRandomness"]==false,"producer prepared source, explicit fee and trust model binding");}
 *phase="check-prepared-live-state";let provider=RpcProvider::new_with_config(net)?;g.identity.check_current(&provider).await?;
 psy_template_u124_markets::guard_reads::checked(&g.dependencies,psy_template_u124_markets::guard_reads::concurrency()?,|b|b.check(&provider)).await?;
 let provider=provider.with_user_id_owned(user);let cp=provider.get_latest_block_state().await?.checkpoint_id;
 ensure!(source_cp<=cp&&cp<=g.valid_until_checkpoint,"prepared broadcast window expired");
 let (leaf,actual)=tokio::join!(provider.get_user_leaf_data(cp,user),provider.get_user_tree_leaf_hash(cp,user));
 let leaf=leaf?;let actual=actual?;
 let fresh=core.state_transition.start_user_leaf_hash==QHashOut::ZERO;
 let registration=if fresh{
  let index=psy_crypto::common::user_id::get_registration_id_from_user_id(user);
  let proof=provider.get_user_registration_tree_merkle_proof(cp,index).await?;
  let roots=provider.get_checkpoint_global_state_roots(cp).await?;
  let checkpoint=provider.get_checkpoint_leaf_data(cp).await?;
  ensure!(proof.index==index&&proof.value==key&&proof.root==roots.user_registration_tree_root&&proof.verify::<PsyHasher>()&&roots.qfhash::<PsyHasher>()==checkpoint.global_chain_root,"fresh account registration Merkle/context binding");
  Some(json!({"checkpoint":cp,"registrationIndex":index,"proof":proof,"roots":roots,"checkpointLeaf":checkpoint,"verified":true}))
 }else{ensure!(leaf.qfhash::<PsyHasher>()==actual,"prepared current leaf metadata mismatch");None};
 validate_anchor(actual,leaf.public_key,leaf.nonce.to_canonical_u64(),core.state_transition.start_user_leaf_hash,nonce,key,registration.is_some())?;
 ensure!(matches!(provider.get_tx_status(user,nonce).await?,TxStatus::Submittable),"prepared nonce not submittable");
 g.identity.check_current(&provider).await?;for b in &g.dependencies{b.check(&provider).await?;}
 let end=core.state_transition.end_user_leaf_hash;
 save(&out.join("verification.json"),&json!({"fullUpsVerified":true,"exactStackAndSessionVerified":true,"preparedManifestSha256":a[7],"requestSha256":m.request_sha256,"callsSha256":m.calls_sha256,"guardSha256":m.guard_sha256,"endUserLeafHash":end.to_string(),"userId":user,"nonce":nonce,"sourceCheckpoint":source_cp,"actualCalls":expected.len(),"freshRegistration":registration,"fee":fee,"reproved":false,"broadcast":false}))?;
 if a[1] == "verify-prepared" {println!("{}",json!({"preparedVerified":true,"submitted":false,"broadcast":false}));return Ok(());}
 // No signing, new nonce or new business operation. One transmission only.
 let mut original=fs::OpenOptions::new().write(true).create_new(true).open(out.join("request.json"))?;original.write_all(&rb)?;original.sync_all()?;fs::File::open(out)?.sync_all()?;save(&out.join("intent.json"),&json!({"status":"broadcast_intent","userId":user,"nonce":nonce,"endUserLeafHash":end.to_string(),"requestSha256":m.request_sha256,"retryAllowed":false}))?;
 *phase="broadcast-compact-ups";let receipt=psy_template_u124_markets::live_rpc::submit(net,request,out).await?;
 save(&out.join("receipt.json"),&json!({"submitted":true,"included":false,"receipt":receipt,"endUserLeafHash":end.to_string()}))?;
 println!("{}",json!({"status":"broadcast_intent","userId":user,"endUserLeafHash":end.to_string(),"requestSha256":m.request_sha256}));Ok(())
}

#[cfg(test)]mod tests{
 use super::*;
 fn h(n:u64)->QHashOut<F>{serde_json::from_str(&format!("\"{:016x}{:016x}{:016x}{:016x}\"",n,n,n,n)).unwrap()}
 #[test]fn fresh_zero_leaf_requires_verified_registration_and_first_nonce(){let key=h(1);assert!(validate_anchor(QHashOut::ZERO,QHashOut::ZERO,0,QHashOut::ZERO,1,key,true).is_ok());for(actual,old,n,next,cert)in[(h(2),QHashOut::ZERO,0,1,true),(QHashOut::ZERO,h(3),0,1,true),(QHashOut::ZERO,QHashOut::ZERO,1,1,true),(QHashOut::ZERO,QHashOut::ZERO,0,2,true),(QHashOut::ZERO,QHashOut::ZERO,0,1,false)]{assert!(validate_anchor(actual,old,n,QHashOut::ZERO,next,key,cert).is_err());}}
 #[test]fn existing_anchor_and_key_checks_are_not_relaxed(){let key=h(1);let root=h(2);assert!(validate_anchor(root,key,9,root,10,key,false).is_ok());assert!(validate_anchor(root,h(3),9,root,10,key,true).is_err());assert!(validate_anchor(h(3),key,9,root,10,key,true).is_err());assert!(validate_anchor(root,key,10,root,10,key,true).is_err());}
}
