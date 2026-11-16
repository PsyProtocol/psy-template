//! Opt-in synthetic dependency openings derived from the actual seeded Store.
//! The checkpoint-one leaf is captured public data, never a dummy zero path.
//! These tests do not authenticate runtime finality or submit network requests.
use super::*;
use psy_template_u124_markets::dependency_scope::{self,DependencyOpening,ContractOpening};

pub(super) fn anchor(spec:&Value)->Result<Option<PsyCheckpointLeaf<GF>>>{
 if !dependency_scope::enabled(spec){return Ok(None);}
 dependency_scope::validate_optional(spec)?;
 ensure!(std::env::var("BATCH_PROOF_PROFILE").as_deref()==Ok("compact-v1"),"new dependency scope acceptance requires actual compact key profile");
 let path=std::env::var("CORE_BOUND_ANCHOR").context("captured CORE_BOUND_ANCHOR leaf file required for new key")?;
 let metadata=fs::symlink_metadata(&path)?;
 ensure!(metadata.file_type().is_file()&&metadata.len()<=131072,"bounded regular public checkpoint-one leaf required");
 let leaf:PsyCheckpointLeaf<GF>=serde_json::from_slice(&fs::read(path)?)?;
 ensure!(leaf.global_chain_root.to_string()==spec["chain_root_at1"].as_str().context("new key chain root")?,"captured checkpoint-one chain identity differs");
 Ok(Some(leaf))
}

pub(super) fn bind_artifacts(w:&World,leaves:&mut BTreeMap<u64,PsyContractLeaf<GF>>,whitelists:&BTreeMap<u64,Vec<QHashOut<GF>>>)->Result<()>{
 let Some(pins)=dependency_scope::validate_optional(&w.policy)? else{return Ok(());};
 ensure!(pins.iter().map(|p|p.contract_id).collect::<Vec<_>>()==leaves.keys().copied().collect::<Vec<_>>(),"new key exactly covers actual artifact dependencies");
 let store=Store::new();
 for pin in pins{
  let expected=pin.leaf()?;let actual=leaves.get_mut(&pin.contract_id).context("actual dependency artifact")?;
  // Code/layout/counts come from actual artifact bytes. The whitelist root is
  // independently derived from every compiled method's fingerprint and ABI.
  actual.function_tree_root=store.set_contract_function_whitelist(w.checkpoint,pin.contract_id,&whitelists[&pin.contract_id])?;
  // Deployer is captured public contract metadata; it is not compiler output.
  // It is included in the new key's entire typed-leaf commitment.
  actual.deployer=expected.deployer;
  ensure!(*actual==expected,"actual artifact code/function/layout/counts differ from reviewed full-leaf pin");
 }
 Ok(())
}

pub(super) async fn capture(spec:&Value,db:&Store,checkpoint:u64)->Result<Option<DependencyOpening>>{
 let Some(pins)=dependency_scope::validate_optional(spec)? else{return Ok(None);};
 let mut contracts=Vec::new();
 for pin in pins{contracts.push(ContractOpening{id:pin.contract_id,leaf:db.get_contract_leaf_data(pin.contract_id).await?,
  path:db.get_contract_tree_merkle_proof(checkpoint,pin.contract_id as u32).await?});}
 Ok(Some(DependencyOpening{anchor:db.get_checkpoint_leaf_data(1).await?,
  anchor_path:db.get_checkpoint_tree_merkle_proof(checkpoint,1).await?,
  checkpoint:db.get_checkpoint_leaf_data(checkpoint).await?,roots:db.get_checkpoint_global_state_roots(checkpoint).await?,contracts}))
}

pub(super) fn inputs(spec:&Value,opening:&DependencyOpening,tree:QHashOut<GF>,checkpoint:QHashOut<GF>)->Result<Vec<GF>>{
 dependency_scope::witness_values(spec,opening,tree,checkpoint)
}

fn reject_opening(spec:&Value,opening:&DependencyOpening,tree:QHashOut<GF>,checkpoint:QHashOut<GF>)->Result<Vec<Value>>{
 let mut rows=vec![];
 for name in ["wrong-root","wrong-code","wrong-layout","wrong-function","wrong-checkpoint","wrong-domain","missing-dependency"]{
  let mut bad=opening.clone();let mut policy=spec.clone();
  match name{
   "wrong-root"=>bad.roots.contract_tree_root.0.elements[0]+=GF::ONE,
   "wrong-code"=>bad.contracts[0].leaf.code_root.0.elements[0]+=GF::ONE,
   "wrong-layout"=>bad.contracts[0].leaf.state_layout_root.0.elements[0]+=GF::ONE,
   "wrong-function"=>bad.contracts[0].leaf.function_tree_root.0.elements[0]+=GF::ONE,
   "wrong-checkpoint"=>bad.checkpoint.global_chain_root.0.elements[0]+=GF::ONE,
   "wrong-domain"=>policy["config"]["networkMagic"]=json!("1"),
   _=>{bad.contracts.pop();},
  }
  ensure!(dependency_scope::witness_values(&policy,&bad,tree,checkpoint).is_err(),"new key host witness accepted {name}");
  rows.push(json!({"case":name,"rejected":true,"level":"host opening validation; not a circuit rejection proof"}));
 }
 Ok(rows)
}

fn signature(input:&SDKeyCircuitWitnessInput,domain:u64)->QHashOut<GF>{
 use psy_client_data::qdata::{ups_signature::PsyUserProvingSessionSignatureDataCompact,user_contract_state::SignContext};
 let s=&input.session_context;let mut end=s.current_user_leaf;end.nonce=s.nonce;
 PsyUserProvingSessionSignatureDataCompact{start_user_leaf_hash:s.start_user_leaf_hash,end_user_leaf_hash:end.qfhash::<PoseidonHash>(),
  checkpoint_leaf_hash:s.checkpoint_leaf_hash,tx_stack_hash:input.tx_stack_hash,tx_count:input.tx_count}
  .get_sig_action_for_user::<PoseidonHash>(domain,input.user_id,s.nonce,SignContext{checkpoint_tree_root:s.checkpoint_tree_root,user_leaf:s.current_user_leaf})
  .get_qhash::<PoseidonHash>()
}

pub(super) async fn attacks(key:&psy_template_u124_markets::market_key::SDKeyCircuitGadget,spec:&Value,
 opening:&DependencyOpening,input:&SDKeyCircuitWitnessInput)->Result<Vec<Value>>{
 let mut rows=reject_opening(spec,opening,input.session_context.checkpoint_tree_root,input.session_context.checkpoint_leaf_hash)?;
 let checkpoint_height=psy_config::network_constants::CHECKPOINT_TREE_HEIGHT as usize;
 let roots=4+1+4+4*checkpoint_height;
 let current_stats=roots+24;let first_contract=current_stats+4;
 let width=74+first_contract+4*(1+4+4*psy_config::network_constants::GLOBAL_CONTRACT_TREE_HEIGHT as usize);
 ensure!(input.circuit_inputs.len()==width,"new key metadata layout for constraint attacks");
 let normal=signature(input,PSY_NETWORK_MAGIC);
 for(name,index)in [("anchor-leaf-commitment",5),("current-global-roots",roots),("current-checkpoint-stats",current_stats),("pinned-full-contract-leaf",first_contract+1)]{
  let mut bad=input.clone();bad.circuit_inputs[74+index]+=GF::ONE;
  ensure!(key.prove(QHashOut(HashOut{elements:[GF::ONE;4]}),&bad,normal).await.is_err(),"new key circuit accepted {name}");
  rows.push(json!({"case":name,"rejected":true,"level":"SD-key circuit constraint rejection; no invalid UPS broadcast"}));
 }
 ensure!(key.prove(QHashOut(HashOut{elements:[GF::ONE;4]}),input,signature(input,PSY_NETWORK_MAGIC+1)).await.is_err(),"new key accepted wrong signature domain");
 rows.push(json!({"case":"signature-domain","rejected":true,"level":"exact SDK signature-preimage guard rejection"}));
 let mut short=input.clone();short.circuit_inputs.pop();
 ensure!(key.prove(QHashOut(HashOut{elements:[GF::ONE;4]}),&short,normal).await.is_err(),"new key accepted missing metadata field");
 rows.push(json!({"case":"missing-metadata-field","rejected":true,"level":"exact witness-shape guard rejection"}));
 Ok(rows)
}

pub(super) fn save(spec:&Value,opening:&DependencyOpening,mode:u64,index:usize,attacks:&[Value])->Result<Value>{
 let out=std::env::var("BATCH_FULL_UPS_OUT").context("new key public dependency evidence output required")?;
 let name=format!("{}-{mode}-{index}-dependency-opening.json",spec["market"].as_str().context("market kind")?);
 let bytes=serde_json::to_vec_pretty(&json!({"profile":dependency_scope::PROFILE,"opening":opening,"attacks":attacks,
  "scope":"Public dependency projection from the actual synthetic SDK session. Captured checkpoint-one leaf; real Merkle paths in a synthetic current checkpoint tree. Not live network finality or runtime attestation.","broadcast":false}))?;
 let mut file=fs::OpenOptions::new().write(true).create_new(true).open(format!("{out}/{name}"))?;
 use std::io::Write;file.write_all(&bytes)?;file.sync_all()?;
 Ok(json!({"keyProfile":dependency_scope::PROFILE,"dependencyOpeningFile":name,"dependencyOpeningSha256":format!("{:x}",Sha256::digest(bytes)),
  "dependencyCount":opening.contracts.len(),"fullLeafPinsBound":true,"actualSignedCheckpointBinding":true,
  "scope":"synthetic authenticated checkpoint proof; no live finality claim"}))
}
