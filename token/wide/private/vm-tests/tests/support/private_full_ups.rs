//! One ordinary signed private-claim UPS against synthetic authenticated state.
//! Source note creation uses actual VM bytecode, not a submitted transfer UPS.
//! No RPC, wallet import, deployment or live receipt is involved.
use super::*;
use kvq::memory::simple::KVQSimpleMemoryBackingStore as Store;
use psy_client_data::{
    config::store_config::ContractFunctionTreeStore,
    qdata::{contract::{ContractCodeDefinition, PsyContractLeaf}, checkpoint::{PsyCheckpointLeaf, PsyCheckpointLeafStats, PsyBlockState}},
    qstore::{controllers::{proving_session::{PsyLocalProvingSessionStore,PsyReadLocalProvingSessionStore},session_info::SessionCircuitInfoStore},
             imm::{cache::PsyCmdStoreWithCache,cmd::{QSRMerkleCmd,QSRMerkleCmdGetContractFunctionTreeMerkleProof}}},
    traits::qdatastore::{qmetadata::{QMetaDataStoreReaderSync,QMetaDataStoreWriterSync},qtreedata::{QTreeDataStoreReaderSync,QTreeDataStoreWriterSync}},
};
use psy_common_circuit::circuits::zk_signature3::core::PsyBasicZKSignatureCircuit;
use psy_crypto::{hash::traits::qhashable::QFieldHashable,signature::zk::wallet::SimplePsyPrivateKey};
use psy_vm::{dpn::contract::{dapen_fc_to_cfc_code_definition,hash_dpn_function},ups::circuit_manager::UPSCircuitManager};
use psy_ups_circuit::{circuit_manager::core::PsyUPSStepCircuitManager,session::UserProvingSessionManager};
use psy_client_data::qblock::cmds::deploy_contract::get_code_root_by_code_hashes;
use psy_client_data::models::kvq_merkle::model::KVQSemiFixedConfigMerkleTreeModelReaderCore;
use std::{collections::BTreeMap,sync::Arc,time::Instant};
use sha2::{Digest,Sha256};

#[tokio::test]
#[ignore = "fresh output, current Native artifact and complete offline proving required"]
async fn private_claim_complete_ordinary_ups() -> Result<()> {
    let started = Instant::now();
    // Refuse an absent/wrong explicit profile before expensive proving begins.
    psy_template_u124_markets::live_guard::require_compiled_verifier_domain()?;
    let output = std::path::PathBuf::from(std::env::var("PRIVATE_COMPLETE_UPS_OUT")?);
    fs::create_dir(&output)?;
    let artifact_bytes = fs::read(std::env::var("TOKEN_WIDE_PRIVATE_ARTIFACT")?)?;
    let artifact: Value = serde_json::from_slice(&artifact_bytes)?;
    let native_bytes = fs::read(std::env::var("PRIVATE_CURRENT_NATIVE_ARTIFACT")?)?;
    let native: Value = serde_json::from_slice(&native_bytes)?;
    ensure!(artifact["state_tree_height"] == 32 && native["state_tree_height"] == 32, "exact height-32 dependencies");
    psy_template_u124_markets::sdk_release::require_linked_endcap()?;
    let cm = PsyUPSStepCircuitManager::<C,2>::new_with_config(psy_config::PSY_NETWORK_MAGIC);
    let signature = PsyBasicZKSignatureCircuit::<C,2>::new();
    // Ephemeral synthetic signing material is never logged, saved or imported.
    let secret = QHashOut::<F>::rand();
    let key = SimplePsyPrivateKey::new(secret);
    let public = key.get_public_key_for_fingerprint::<PoseidonHash>(signature.get_fingerprint());
    let db = Store::new();
    let mut codes = BTreeMap::new();
    let mut whitelists = BTreeMap::new();
    for (cid, a) in [(0u64, &native), (T, &artifact)] {
        let defs: Vec<DPNFunctionCircuitDefinition> = serde_json::from_value(a["circuit_definitions"].clone())?;
        let mut whitelist = vec![];
        let mut hashes = vec![];
        for (i,d) in defs.iter().enumerate() {
            let circuit = Arc::new(DapenContractFunctionCircuit::<C,2>::new(d,32,16,false));
            whitelist.push(circuit.get_fingerprint());
            whitelist.push(QHashOut::from_values(d.method_id as u64, ((d.circuit_outputs.len() as u64)<<32)|d.circuit_inputs.len() as u64,0,0));
            hashes.push(hash_dpn_function::<F>(d));
            if (cid==T && d.name=="private_claim") || (cid==0 && d.name=="burn") {
                cm.contract_circuits.insert((cid,i as u32),circuit);
            }
        }
        let layout = psy_data::v1::qdata::contract::canonical_layout_manifest_from_compiler_abi_json::<
            parth_core::pgoldilocks::PoseidonHasher,F,parth_core::pgoldilocks::QHashOut<F>>(
                &serde_json::to_string(&a["abi"])?,psy_core::constants::protocol::STATE_LAYOUT_TREE_HEIGHT,
                psy_data::v1::qdata::contract::CANONICAL_TYPE_LAYOUT_STRUCT_TREE_HEIGHT)?;
        let layout = layout.layout.contract_layout;
        let code = ContractCodeDefinition {state_tree_height:32,functions:defs.iter().map(dapen_fc_to_cfc_code_definition).collect()};
        db.set_contract_code_definition(CP,cid,&code)?;
        let leaf = PsyContractLeaf {code_root:get_code_root_by_code_hashes::<F,PoseidonHash>(&hashes,15),
            state_tree_height:f(32),function_tree_root:db.set_contract_function_whitelist(CP,cid,&whitelist)?,
            state_layout_root:QHashOut(layout.state_layout_root.0),state_layout_field_count:f(layout.state_layout_field_count),
            state_layout_slot_count:f(layout.state_layout_slot_count),..Default::default()};
        db.set_contract_leaf_data(CP,cid,&leaf)?;
        db.set_contract_tree_leaf_hash(CP,cid,leaf.qfhash::<PoseidonHash>())?;
        whitelists.insert(cid,whitelist);codes.insert(cid,code);
    }
    let amount = 10u128.pow(27)+123;
    let mut world = World::new()?;
    world.set_balance(A,amount+9);
    world.transfer(amount,h(&[BOB,1337,7,8]),funding_secrets())?;
    let mut slots = world.captured_slots.clone();
    let native_funds = 100_000_000_000u64;
    slots.insert((BOB,0,0),native_funds);
    // Explicitly initialize the receiving token's positional state with zero.
    slots.insert((BOB,T,0),0);slots.insert((BOB,T,1),0);
    let mut grouped = BTreeMap::<(u64,u64,u64),[F;4]>::new();
    for ((u,c,i),v) in slots { grouped.entry((u,c,i/4)).or_insert([F::ZERO;4])[(i%4) as usize]=f(v); }
    let mut roots = BTreeMap::new();
    for ((u,c,i),value) in grouped {
        let p = db.set_user_state_tree_leaf_hash(CP,u,c as u32,32,i,QHashOut(HashOut{elements:value}))?;
        roots.insert((u,c),p.new_root);
    }
    for ((u,c),root) in roots { db.set_user_contract_tree_leaf_hash(CP,u,c as u32,root)?; }
    for user in [A,BOB] {
        let leaf = PsyUserLeaf {user_id:f(user),public_key:if user==BOB{public}else{QHashOut(HashOut{elements:[F::ONE;4]})},
            user_state_tree_root:db.get_user_contract_tree_root(CP,user).await?,last_checkpoint_id:f(CP-1),..Default::default()};
        db.set_user_leaf_data(CP,&leaf)?;db.set_user_tree_leaf_hash(CP,user,leaf.qfhash::<PoseidonHash>())?;
    }
    let state_roots = db.get_checkpoint_global_state_roots(CP).await?;
    let checkpoint = PsyCheckpointLeaf {global_chain_root:state_roots.qfhash::<PoseidonHash>(),stats:PsyCheckpointLeafStats::new_empty()};
    db.set_checkpoint_leaf_data(CP,&checkpoint)?;db.set_checkpoint_tree_leaf_hash(CP,checkpoint.qfhash::<PoseidonHash>())?;
    let mut block = PsyBlockState::get_genesis_value();block.checkpoint_id=CP;block.next_user_id=1000;block.next_contract_id=1001;db.set_block_state(&block)?;
    let start = db.get_user_leaf_data(CP,BOB).await?;
    let sender = db.get_user_leaf_data(CP,A).await?;
    let user_path = db.get_user_tree_merkle_proof(CP,A).await?;
    let contract_path = db.get_user_contract_tree_merkle_proof(CP,A,T as u32).await?;
    let source_root = user_path.root;
    let circuit = PrivateNoteInclusionCircuit::<C,2>::new(
        psy_config::network_constants::GLOBAL_USER_TREE_HEIGHT as usize,
        psy_config::network_constants::GLOBAL_CONTRACT_TREE_HEIGHT as usize,32,20);
    ensure!(circuit.get_fingerprint().0==fp(), "native denomination verifier changed");
    let mut native_proofs = vec![];
    let quantities = [(amount%RADIX) as u64,(amount/RADIX) as u64];
    let nullifier_secrets = [h(&[11,12]),h(&[21,22])];
    let note_secrets = [h(&[31,32]),h(&[41,42])];
    let receiver = h(&[BOB,1337,7,8]);
    for limb in 0..2 {
        let commitment = hh(hh(receiver,HashOut{elements:[f(quantities[limb]),F::ZERO,F::ZERO,F::ZERO]}),funding_secrets()[limb]);
        let membership = merkle(commitment,0,zeros(20));
        let slot = db.get_user_contract_state_tree_merkle_proof(CP,A,T as u32,32,SLOTS[limb]).await?;
        ensure!(slot.value==membership.root && slot.root==contract_path.value,"exact note/state/contract paths");
        let input = PrivateNoteInclusionInput {nullifier_secret:QHashOut(nullifier_secrets[limb]),sender_user_id:A,contract_id:T,
            user_leaf:sender,owner:QHashOut(receiver),amount:f(quantities[limb]),note_secret:QHashOut(note_secrets[limb]),
            note_membership_proof:membership,note_root_slot:SLOTS[limb],note_root_slot_proof:slot,
            contract_proof:contract_path.clone(),user_tree_proof:user_path.clone(),checkpoint_id:f(CP)};
        let proof = circuit.prove(&input)?;
        plonky2::plonk::circuit_data::VerifierCircuitData {verifier_only:circuit.get_verifier_config_ref().clone(),common:circuit.get_common_circuit_data_ref().clone()}.verify(proof.clone())?;
        native_proofs.push(proof);
    }
    let mut cache = PsyCmdStoreWithCache::new(CP,db);
    for (cid,code) in &codes { for i in 0..code.functions.len() {
        let index = (i*2) as u32;
        let path = ContractFunctionTreeStore::<Store>::get_leaf_sfc(&cache.read_store,CP,*cid,index as u64)?;
        ensure!(path.value==whitelists[cid][i*2] && path.verify::<PoseidonHash>(),"raw function proof");
        cache.cache.merkle_cmd_cache.insert(QSRMerkleCmd::GetContractFunctionTreeMerkleProof(QSRMerkleCmdGetContractFunctionTreeMerkleProof{
            checkpoint_id:CP,contract_id:*cid as u32,function_id:index}),path);
    }}
    let lps = PsyLocalProvingSessionStore::new_at_with_cmd_store(cache,f(CP),f(BOB),F::ONE,start.event_index,16);
    let mut info = SessionCircuitInfoStore::new();cm.register_info(&mut info).await;
    let mut session = UserProvingSessionManager::new(lps,info,cm.ups_circuit_whitelist_root).await?;
    session.prove_ups_start(&cm).await?;
    let mut indices=vec![];
    for (limb,proof) in native_proofs.into_iter().enumerate() {
        let mut index=session.add_external_proof(circuit.get_fingerprint(),proof.clone(),circuit.get_verifier_config_ref().clone()).await;
        if limb==0 && index%2==1 {
            let aligned=session.add_external_proof(circuit.get_fingerprint(),proof,circuit.get_verifier_config_ref().clone()).await;
            ensure!(aligned==index+1,"proof pair alignment changed");index=aligned;
        }
        if limb==1 {ensure!(index==indices[0]+1,"aligned sibling proof positions");}
        indices.push(index);
    }
    let mut inputs=words(receiver);inputs.extend(quantities);inputs.extend(words(source_root.0));inputs.extend([CP,7,8]);
    for secret in nullifier_secrets { inputs.extend(words(PoseidonHash::hash_no_pad(&secret.elements))); }
    let note_session_root = session.proof_tree_state.get_proof_tree_root().await;
    ensure!(indices[0]%2==0,"aligned low/high pair");
    for index in [indices[0]] {
        let path = session.proof_tree_state.get_leaf_merkle_proof(index).await;
        ensure!(path.root==note_session_root && path.siblings.len()==16,"all paths from the same final note session");
        for sibling in path.siblings { inputs.extend(words(sibling.0)); }inputs.push(index);
    }
    ensure!(inputs.len()==86,"complete claim inputs");
    let (index,definition) = cm.resolve_contract_function_by_method_name(T,&codes[&T],"private_claim".into()).await?;
    session.prove_standard_call(&cm,f(T),index as u32,&definition,inputs.iter().copied().map(f).collect()).await?;
    session.prove_burn_fee(&cm).await?;
    let fee=session.require_lps()?.last_transaction_record().call_data.call_data.inputs[0].to_canonical_u64();
    let sighash=session.get_sighash(psy_config::PSY_NETWORK_MAGIC,F::ONE);
    let sig=signature.prove_base(secret,sighash)?;
    let modified=session.require_lps()?.get_total_slots_modified();
    let proof=session.prove_end_cap(&cm,psy_config::PSY_NETWORK_MAGIC,F::ONE,modified,signature.get_fingerprint(),
        key.get_public_key_param::<PoseidonHash>(),sig,signature.get_verifier_config_ref().clone()).await?;
    cm.ups_end_cap.verify_proof(proof.clone())?;
    psy_template_u124_markets::fixed_verifier::with_verifier(|v|{v.verify(proof.clone())?;Ok(())})?;
    let api=session.get_api_input().await?;
    psy_template_u124_markets::proof_binding::validate_endcap_binding(&api.core,&proof.public_inputs)?;
    ensure!(api.core.new_user_leaf.public_key==public && api.core.new_user_leaf.nonce==F::ONE,"ordinary signature identity");
    ensure!(api.core.stats.total_transactions==f(2),"claim and exact fee burn only");
    ensure!(api.core.stats.guta_fees_collected.to_canonical_u64()+api.core.stats.da_fees_collected.to_canonical_u64()==fee,"exact fees");
    let balance=session.require_lps_mut()?.get_contract_state_slot(f(T),F::ZERO).await?.value.0;
    ensure!(balance.elements[0].to_canonical_u64() as u128+RADIX*balance.elements[1].to_canonical_u64() as u128==amount,"complete U124 final balance");
    let native_balance=session.require_lps_mut()?.get_contract_state_slot(F::ZERO,F::ZERO).await?.value.0.elements[0].to_canonical_u64();
    ensure!(native_balance+fee==native_funds,"native conservation");
    let request=psy_provider::request::QSubmitEndCapRPCRequest{user_ec_input:api,proof:bincode::serialize(&proof)?};
    let bytes=serde_json::to_vec(&request)?;
    let mut file=fs::OpenOptions::new().write(true).create_new(true).open(output.join("request.json"))?;
    use std::io::Write;file.write_all(&bytes)?;file.sync_all()?;
    let row=serde_json::json!({"schema":1,"fullUpsVerified":true,"fixedVerifierVerified":true,"ordinarySignature":true,
        "sdkCommit":"01b8f2b0a077367a7b9879baba1a72aea8ab5510","sourceCheckpoint":CP,"userId":BOB,
        "privateArtifactSha256":format!("{:x}",Sha256::digest(&artifact_bytes)),"nativeArtifactSha256":format!("{:x}",Sha256::digest(&native_bytes)),
        "requestSha256":format!("{:x}",Sha256::digest(&bytes)),"sourceUserTreeRoot":source_root.to_string(),
        "noteSessionRoot":note_session_root.to_string(),"startUserLeaf":start.qfhash::<PoseidonHash>().to_string(),
        "endUserLeaf":request.user_ec_input.core.state_transition.end_user_leaf_hash.to_string(),
        "amount":amount.to_string(),"nativeFee":fee,"nativeConserved":true,"tokenConservedWithVmSetup":world.balance(A)+amount==amount+9,
        "callsIncludingBurn":2,"elapsedSeconds":started.elapsed().as_secs_f64(),"broadcast":false,
        "scope":"One complete ordinary private-claim UPS on synthetic authenticated checkpoints; source transfer setup VM-only; not live settlement or browser acceptance"});
    let mut file=fs::OpenOptions::new().write(true).create_new(true).open(output.join("REPORT.json"))?;
    file.write_all(&serde_json::to_vec_pretty(&row)?)?;file.sync_all()?;
    println!("PRIVATE_FULL_UPS {row}");
    Ok(())
}
