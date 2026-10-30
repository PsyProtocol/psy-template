//! Offline comparison of exact checkpoint bytes and frozen SDK verification paths.
//! Diagnostic output never qualifies a key, chain, finality certificate or random source.
use anyhow::{ensure, Context, Result};
use parth_core::protocol::core_types::{QZKProofPublicInputsHasherReader, QZKProofVerifier};
use plonky2::plonk::config::PoseidonGoldilocksConfig as C;
use psy_core::{constants::chain_id::PsyChainNetworkType, job::job_id::ProvingJobCircuitType as Kind};
use psy_plonky2_circuits::zk_verifier::PsyPlonky2ZKVerifier;
use psy_template_u124_markets::checkpoint_evidence::{decode_proof, resource_inventory};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, io::{Read, Write}, time::Instant};

fn digest(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
fn read(path: &str) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    fs::File::open(path)?.take(2_000_001).read_to_end(&mut bytes)?;
    ensure!(bytes.len() <= 2_000_000, "bounded proof input");
    Ok(bytes)
}
fn compare(verifier: &PsyPlonky2ZKVerifier<C, 2>, inputs: &[Result<Vec<u8>>]) -> Result<Vec<Value>> {
    use plonky2::field::{extension::FieldExtension, types::PrimeField64};
    let common = verifier.gcv.common.get_common_circuit_data_ref(Kind::GenerateRollupStateTransitionProof)?;
    let key = &verifier.gcv.library.info_map[&Kind::GenerateRollupStateTransitionProof];
    let mut rows = Vec::new();
    for input in inputs {
        let bytes = input.as_ref().map_err(|error| anyhow::anyhow!("proof read failed: {error:#}"))?;
        let proof = decode_proof(bytes).context("strict proof decode")?;
        let official = PsyPlonky2ZKVerifier::<C, 2>::try_proof_from_slice(bytes).context("SDK proof decode")?;
        let roundtrip = bincode::serialize(&proof)?;
        let official_bytes = bincode::serialize(&official)?;
        let vk=key.verifier_data.to_verifier_data::<C,2>();
        let challenges=proof.get_challenges(proof.get_public_inputs_hash(),&vk.circuit_digest,common)?;
        let canonical=|values:&[plonky2::field::goldilocks_field::GoldilocksField]|values.iter().map(|v|v.to_canonical_u64()).collect::<Vec<_>>();
        let transcript=json!({"scope":"public Fiat-Shamir diagnostics under the unchanged key, not an acceptance result","circuitDigest":vk.circuit_digest,"publicInputsHash":proof.get_public_inputs_hash(),"betas":canonical(&challenges.plonk_betas),"gammas":canonical(&challenges.plonk_gammas),"alphas":canonical(&challenges.plonk_alphas),"deltas":canonical(&challenges.plonk_deltas),"zeta":canonical(&FieldExtension::<2>::to_basefield_array(&challenges.plonk_zeta))});
        let start = Instant::now();
        let result = verifier.verify_zk_proof(Kind::GenerateRollupStateTransitionProof as u32, &official);
        let elapsed = start.elapsed().as_secs_f64();
        let owned = plonky2::plonk::circuit_data::VerifierCircuitData {
            verifier_only: key.verifier_data.to_verifier_data::<C, 2>(), common: common.clone(),
        }.verify(proof.clone());
        rows.push(json!({
            "proofSha256": digest(bytes), "bytes": bytes.len(), "transcript":transcript,
            "strictAndSdkDecodeEqual": roundtrip == official_bytes,
            "strictRoundtripExact": &roundtrip == bytes, "sdkRoundtripExact": &official_bytes == bytes,
            "publicInputs": proof.public_inputs, "fingerprint": key.fingerprint.to_string(),
            "commonSha256": digest(&bincode::serialize(common)?),
            "verifierOnlySha256": digest(&bincode::serialize(&key.verifier_data.to_verifier_data::<C,2>())?),
            "commonDegreeBits": common.degree_bits(),
            "shape": {"publicInputs": proof.public_inputs.len(), "constants": proof.proof.openings.constants.len(),
                "wires": proof.proof.openings.wires.len(), "sigmas": proof.proof.openings.plonk_sigmas.len(),
                "quotients": proof.proof.openings.quotient_polys.len(),
                "friQueryRounds": proof.proof.opening_proof.query_round_proofs.len()},
            "sdkBorrowedVerified": result.is_ok(), "sdkBorrowedSeconds": elapsed,
            "sdkBorrowedError": result.err().map(|e| format!("{e:#}")),
            "applicationOwnedVerified": owned.is_ok(), "applicationOwnedError": owned.err().map(|e| format!("{e:#}"))
        }));
    }
    Ok(rows)
}
fn fixed_resource_control(verifier: &PsyPlonky2ZKVerifier<C, 2>, proof_path: &std::path::Path) -> Result<Value> {
    use plonky2::{field::{goldilocks_field::GoldilocksField as F, types::Field}, hash::{hash_types::HashOut, poseidon::PoseidonHash}, plonk::config::Hasher};
    use parth_core::pgoldilocks::QHashOut as Q;
    use psy_plonky2_circuits::{coordinator::circuits::checkpoint_state_transition_genesis::QEDCheckpointStateTransitionGenesisCircuit, proof_minifier::pm_core::get_circuit_fingerprint_generic};
    // Every compared key remains the original compiled cache. No resource from
    // a page/RPC/file is installed or tried as an alternative for the real pair.
    let mut kinds=verifier.gcv.library.info_map.keys().copied().collect::<Vec<_>>();
    kinds.sort_by_key(|k|*k as u32);
    let mut inventory=vec![];
    for kind in kinds {
        let info=&verifier.gcv.library.info_map[&kind];
        let vk=info.verifier_data.to_verifier_data::<C,2>();
        let actual=Q(get_circuit_fingerprint_generic(&vk));
        let common=verifier.gcv.common.get_common_circuit_data_ref(kind)?;
        ensure!(actual==info.fingerprint,"cached fingerprint mismatch for {kind:?}");
        ensure!(vk.constants_sigmas_cap.0.len()==1usize<<common.config.fri_config.cap_height,"cached cap/common shape mismatch");
        inventory.push(json!({"kind":kind as u32,"name":format!("{kind:?}"),"fingerprint":actual.to_string(),"fingerprintRecomputed":true,"commonSha256":digest(&bincode::serialize(common)?),"verifierOnlySha256":digest(&bincode::serialize(&vk)?),"commonDegreeBits":common.degree_bits(),"publicInputCount":common.num_public_inputs,"numConstants":common.num_constants,"config":common.config}));
    }
    let kind=Kind::GenesisBlockCheckpointStateTransition;
    let info=&verifier.gcv.library.info_map[&kind];
    let common=verifier.gcv.common.get_common_circuit_data_ref(kind)?;
    let genesis=QEDCheckpointStateTransitionGenesisCircuit::<C,2>::new();
    ensure!(genesis.circuit_data.verifier_only==info.verifier_data.to_verifier_data::<C,2>() && &genesis.circuit_data.common==common && genesis.fingerprint==info.fingerprint,"exact cached/source genesis resources required");
    let mut output=fs::OpenOptions::new().write(true).create_new(true).open(proof_path)?;
    let root=Q(HashOut{elements:[F::ONE;4]});
    let leaf=Q(HashOut{elements:[F::from_canonical_u64(2);4]});
    let start=Instant::now();
    let proof=genesis.prove_base(root,leaf,genesis.fingerprint)?;
    let bytes=bincode::serialize(&proof)?;
    let decoded=decode_proof(&bytes)?;
    ensure!(bincode::serialize(&decoded)?==bytes,"positive control exact encoding");
    genesis.circuit_data.verify(decoded.clone())?;
    verifier.verify_zk_proof(kind as u32,&decoded)?;
    plonky2::plonk::circuit_data::VerifierCircuitData{verifier_only:info.verifier_data.to_verifier_data::<C,2>(),common:common.clone()}.verify(decoded.clone())?;
    let expected=PoseidonHash::two_to_one(PoseidonHash::two_to_one(root.0,leaf.0),genesis.fingerprint.0);
    ensure!(decoded.public_inputs==expected.elements,"synthetic genesis cumulative public inputs");
    let mut altered=decoded.clone();altered.public_inputs[0]+=F::ONE;
    let negative=verifier.verify_zk_proof(kind as u32,&altered);
    ensure!(negative.is_err(),"changed public inputs accepted");
    output.write_all(&bytes)?;output.sync_all()?;
    Ok(json!({"scope":"synthetic genesis control under unchanged cached/source-equal resources; not the chain genesis or a transition acceptance","inventory":inventory,"genesisCachedAndSourceResourcesEqual":true,"genesisNativeVerified":true,"genesisSdkBorrowedVerified":true,"genesisApplicationOwnedVerified":true,"mutatedPublicInputsRejected":true,"mutatedPublicInputsError":negative.err().map(|e|format!("{e:#}")),"proofSha256":digest(&bytes),"proofBytes":bytes.len(),"publicInputs":decoded.public_inputs,"seconds":start.elapsed().as_secs_f64(),"proofsGenerated":1,"realTransitionProofsAccepted":0,"canonicalGenesisVerified":false,"financialOperations":0}))
}
fn fixed_wrapper_comparison(verifier:&PsyPlonky2ZKVerifier<C,2>, network:PsyChainNetworkType)->Result<Value>{
    use psy_plonky2_circuits::{coordinator::circuits::checkpoint_state_transition::QEDCheckpointStateTransitionCircuit,qstandard::QStandardCircuit};
    let start=Instant::now();
    let child=Kind::AggUserRegisterDeployContractsGUTA;
    let genesis=Kind::GenesisBlockCheckpointStateTransition;
    let child_info=&verifier.gcv.library.info_map[&child];let genesis_info=&verifier.gcv.library.info_map[&genesis];
    let child_vk=child_info.verifier_data.to_verifier_data::<C,2>();let genesis_vk=genesis_info.verifier_data.to_verifier_data::<C,2>();
    let height=psy_core::network_config::get_circuit_config_for_network(network).checkpoint_tree_height;
    let wrapper=QEDCheckpointStateTransitionCircuit::<C,2>::new(verifier.gcv.common.get_common_circuit_data_ref(child)?,child_vk.constants_sigmas_cap.height(),child_info.fingerprint,verifier.gcv.common.get_common_circuit_data_ref(genesis)?,genesis_vk.constants_sigmas_cap.height(),genesis_info.fingerprint,height);
    let cached=&verifier.gcv.library.info_map[&Kind::GenerateRollupStateTransitionProof];
    let common=verifier.gcv.common.get_common_circuit_data_ref(Kind::GenerateRollupStateTransitionProof)?;
    Ok(json!({"scope":"reconstruct only the final source wrapper from frozen cached child/genesis identities; not complete network reconstruction, no replacement verifier adopted or tried on real proofs","checkpointTreeHeight":height,"childKind":child as u32,"childFingerprint":child_info.fingerprint.to_string(),"genesisFingerprint":genesis_info.fingerprint.to_string(),"sourceFingerprint":wrapper.get_fingerprint().to_string(),"cachedFingerprint":cached.fingerprint.to_string(),"fingerprintEqual":wrapper.get_fingerprint()==cached.fingerprint,"verifierOnlyEqual":wrapper.get_verifier_config_ref()==&cached.verifier_data.to_verifier_data::<C,2>(),"commonEqual":wrapper.get_common_circuit_data_ref()==common,"sourceCommonSha256":digest(&bincode::serialize(wrapper.get_common_circuit_data_ref())?),"sourceVerifierOnlySha256":digest(&bincode::serialize(wrapper.get_verifier_config_ref())?),"seconds":start.elapsed().as_secs_f64(),"proofsGenerated":0,"networkRotationConstructed":false,"realProofVerifiedUsingConstructedKey":false,"financialOperations":0}))
}
fn observed_pi_comparison(verifier:&PsyPlonky2ZKVerifier<C,2>, inputs:&[Result<Vec<u8>>], path:&str)->Result<Value>{
    use parth_core::{pgoldilocks::{QHashOut as Q,PoseidonHasher},crypto::hash::traits::QFieldHashable};
    use plonky2::{field::goldilocks_field::GoldilocksField as F,hash::hash_types::HashOut};
    use psy_data::protocol::checkpoint_transition_hash::{CheckpointStateHashTransition,CheckpointStateTransitionPublicInputs};
    #[derive(serde::Deserialize)]#[serde(deny_unknown_fields)]
    struct Observed{opening:psy_template_u124_markets::checkpoint_evidence::CheckpointOpening,leaf:psy_data::v1::qdata::checkpoint::PQEDCheckpointLeaf<F,Q<F>>}
    let bytes=read(path)?;let observed:Observed=serde_json::from_slice(&bytes)?;let o=&observed.opening;
    ensure!(o.schema==1&&o.checkpoint_id>1&&o.checkpoint_id<=u32::MAX as u64,"observed opening schema/id");
    let p=&o.checkpoint_path;
    ensure!(p.siblings.len()==32&&p.index==o.checkpoint_id&&p.root==o.checkpoint_root&&p.value==o.checkpoint_leaf_hash&&p.verify::<PoseidonHasher>(),"observed root/leaf/path consistency");
    ensure!(observed.leaf.qfhash::<PoseidonHasher>()==o.checkpoint_leaf_hash,"observed checkpoint leaf preimage");
    let proof=|i:usize|->Result<_>{decode_proof(inputs[i].as_ref().map_err(|e|anyhow::anyhow!("{e:#}"))?)};
    let previous=proof(0)?;let current=proof(1)?;
    ensure!(previous.public_inputs.len()==4&&current.public_inputs.len()==4,"four cumulative inputs");
    let prior=Q(HashOut{elements:previous.public_inputs.as_slice().try_into().unwrap()});let actual=Q(HashOut{elements:current.public_inputs.as_slice().try_into().unwrap()});
    let fp=verifier.gcv.library.info_map[&Kind::GenerateRollupStateTransitionProof].fingerprint;
    let statement=CheckpointStateTransitionPublicInputs{checkpoint_transition:CheckpointStateHashTransition{old_checkpoint_tree_root:Q::default(),new_checkpoint_tree_root:o.checkpoint_root,old_checkpoint_leaf_hash:Q::default(),new_checkpoint_leaf_hash:o.checkpoint_leaf_hash},genesis_checkpoint_state_transition_hash:Q::default(),checkpoint_state_transition_circuit_fingerprint:fp};
    let expected=statement.get_chain_hash_from_previous::<PoseidonHasher>(&prior);
    Ok(json!({"scope":"data consistency under unverified proof PIs and observed RPC opening; not proof acceptance or authenticated history","openingSha256":digest(&bytes),"checkpointId":o.checkpoint_id,"merkleAndLeafPreimageConsistent":true,"expectedPublicInputHash":expected.to_string(),"actualUnverifiedPublicInputHash":actual.to_string(),"publicInputFormulaMatches":actual==expected,"fingerprintUsed":fp.to_string(),"numericPredecessorAdjacencyVerified":false,"proofsVerified":false,"finalityVerified":false,"financialOperations":0}))
}
fn capture_diagnostic(scope:&str, work:impl FnOnce()->Result<Value>)->Value {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(work)) {
        Ok(Ok(value))=>value,
        Ok(Err(error))=>json!({"scope":scope,"error":format!("{error:#}"),"diagnosticCompleted":false}),
        Err(error)=>{let text=error.downcast_ref::<String>().cloned().or_else(||error.downcast_ref::<&str>().map(|s|s.to_string()));json!({"scope":scope,"panicked":true,"error":text,"diagnosticCompleted":false})}
    }
}
fn requested_checks_passed(mode:&str, observed:bool, report:&Value)->bool {
    let yes=|path:&str|report.pointer(path)==Some(&Value::Bool(true));
    (mode!="cached-with-control" || ["genesisCachedAndSourceResourcesEqual","genesisNativeVerified","genesisSdkBorrowedVerified","genesisApplicationOwnedVerified","mutatedPublicInputsRejected"].iter().all(|key|yes(&format!("/fixedResourceControl/{key}"))))
    && (mode!="cached-wrapper-audit" || ["fingerprintEqual","verifierOnlyEqual","commonEqual"].iter().all(|key|yes(&format!("/fixedWrapperComparison/{key}"))))
    && (!observed || yes("/observedPublicInputComparison/publicInputFormulaMatches"))
}
fn parameters(network: PsyChainNetworkType) -> Result<Value> {
    let path = std::env::var("PSY_CONFIG_PATH").context("explicit source configuration required")?;
    let bytes = read(&path)?;
    let config: Value = serde_json::from_slice(&bytes)?;
    let mut sections = Vec::new();
    for name in ["localhost", "testnet", "mainnet"] {
        let section = &config["networks"][name];
        let counts: Vec<Value> = section["realm_configs"].as_array().into_iter().flatten().map(|realm|
            json!({"realmId": realm["id"], "validatorCount": realm["validators"].as_array().map(Vec::len)})).collect();
        sections.push(json!({"name": name, "magic": section["magic"], "validatorCounts": counts}));
    }
    let rotation = match psy_data::config::network_config::load_realm_rotation_config(network) {
        Ok(value) => json!({"available": true, "checkpointsPerEpoch": value.checkpoints_per_epoch, "validatorSubIds": value.validator_sub_ids}),
        Err(error) => json!({"available": false, "error": format!("{error:#}")}),
    };
    Ok(json!({"configSha256": digest(&bytes), "runtimeNetwork": std::env::var("PSY_NETWORK").ok(),
        "sections": sections, "officialRotationParameters": rotation,
        "scope": "source-selected public parameter observation; no configuration rewritten or network identity authenticated"}))
}
fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    ensure!((args.len() == 5 || (args.len()==6 && args[1]=="cached-wrapper-audit")) && ["cached", "constructed", "cached-with-control", "cached-wrapper-audit"].contains(&args[1].as_str()),
        "cached|constructed|cached-with-control|cached-wrapper-audit PREVIOUS_PROOF CURRENT_PROOF FRESH_REPORT [OBSERVED_OPENING]");
    psy_template_u124_markets::live_guard::require_compiled_verifier_domain()?;
    // Reserve output before expensive construction; never overwrite original evidence.
    let mut output = fs::OpenOptions::new().write(true).create_new(true).open(&args[4])?;
    let start = Instant::now();
    // Read once: the identities below must describe the same bytes actually verified.
    let inputs: Vec<_> = args[2..4].iter().map(|path| read(path)).collect();
    let network = PsyChainNetworkType::try_from_chain_id(psy_config::PSY_NETWORK_MAGIC)?;
    let result = std::panic::catch_unwind(|| -> Result<_> {
        if args[1] != "constructed" { Ok(PsyPlonky2ZKVerifier::<C,2>::from_cached()) }
            else { PsyPlonky2ZKVerifier::<C,2>::for_network(network).context("official frozen network resource construction") }
    });
    let mut report = match result {
        Ok(Ok(verifier)) => match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| compare(&verifier, &inputs))) {
            Ok(Ok(rows)) => {
                let mut value=json!({"resourcesConstructed": true, "stage": "proofComparison", "proofs": rows});
                if args[1]=="cached-with-control" {
                    let path=std::path::Path::new(&args[4]).with_extension("genesis-control.bin");
                    value["fixedResourceControl"]=capture_diagnostic("control failure; no real proof acceptance",||fixed_resource_control(&verifier,&path));
                }
                if args[1]=="cached-wrapper-audit" {value["fixedWrapperComparison"]=capture_diagnostic("wrapper comparison failure; no replacement verifier adopted",||fixed_wrapper_comparison(&verifier,network));}
                if args.len()==6 {value["observedPublicInputComparison"]=capture_diagnostic("observed data comparison failure; not cryptographic acceptance",||observed_pi_comparison(&verifier,&inputs,&args[5]));}
                value
            },
            Ok(Err(error)) => json!({"resourcesConstructed": true, "stage": "proofReadDecodeOrComparison", "error": format!("{error:#}")}),
            Err(_) => json!({"resourcesConstructed": true, "stage": "proofComparison", "comparisonPanicked": true}),
        },
        Ok(Err(error)) => json!({"resourcesConstructed": false, "stage": "resourceConstruction", "error": format!("{error:#}")}),
        Err(error) => {
            let text = error.downcast_ref::<String>().cloned().or_else(|| error.downcast_ref::<&str>().map(|s| s.to_string()));
            json!({"resourcesConstructed": false, "stage": "resourceConstruction", "constructionPanicked": true, "error": text})
        }
    };
    report["schema"] = 1.into();
    report["mode"] = args[1].clone().into();
    report["networkMagic"] = psy_config::PSY_NETWORK_MAGIC.to_string().into();
    report["sourceNetworkType"] = format!("{network:?}").into();
    report["elapsedSeconds"] = start.elapsed().as_secs_f64().into();
    match std::panic::catch_unwind(resource_inventory) {
        Ok(Ok(inventory)) => report["cachedResources"] = inventory,
        Ok(Err(error)) => report["cachedResourceError"] = format!("{error:#}").into(),
        Err(_) => report["cachedResourceInventoryPanicked"] = true.into(),
    }
    report["inputIdentities"] = inputs.iter().map(|input| match input {
        Ok(bytes) => json!({"bytes": bytes.len(), "sha256": digest(bytes)}),
        Err(error) => json!({"error": format!("{error:#}")}),
    }).collect::<Vec<_>>().into();
    report["sourceParameters"] = match parameters(network) {
        Ok(value) => value,
        Err(error) => json!({"error": format!("{error:#}")}),
    };
    for field in ["canonicalGenesisVerified", "chainDomainAuthenticated", "finalityVerified", "randomAuthorization", "broadcast"] {
        report[field] = false.into();
    }
    report["proofsGenerated"] = if args[1]=="cached-with-control" {report.pointer("/fixedResourceControl/proofsGenerated").cloned().unwrap_or(Value::Null)}else{json!(0)};
    report["fixedResourceControlRequested"] = (args[1]=="cached-with-control").into(); report["financialOperations"] = 0.into();
    let accepted = report["proofs"].as_array().is_some_and(|rows| !rows.is_empty() && rows.iter().all(|r| r["sdkBorrowedVerified"] == true && r["applicationOwnedVerified"] == true && r["strictRoundtripExact"] == true && r["sdkRoundtripExact"] == true));
    report["allProofsMatched"] = accepted.into();
    let checks=requested_checks_passed(&args[1],args.len()==6,&report);
    report["requestedDiagnosticsPassed"]=checks.into();
    output.write_all(&serde_json::to_vec_pretty(&report)?)?; output.write_all(b"\n")?; output.sync_all()?;
    ensure!(accepted && checks, "checkpoint compatibility diagnostic did not accept both proofs and requested checks; report preserved");
    Ok(())
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn diagnostic_failures_are_records_not_success(){
        let result=capture_diagnostic("control",||Err(anyhow::anyhow!("failure")));
        assert_eq!(result["diagnosticCompleted"],false);
        assert!(!requested_checks_passed("cached-with-control",false,&result));
        let result=capture_diagnostic("control",||panic!("synthetic diagnostic panic"));
        assert_eq!(result["panicked"],true);
        assert!(!requested_checks_passed("cached-wrapper-audit",false,&result));
    }
    #[test]
    #[ignore="requires an exact saved synthetic control, not a new proof"]
    fn saved_synthetic_control_reverifies_under_final_binary()->Result<()> {
        let bytes=read(&std::env::var("CHECKPOINT_DIAGNOSTIC_CONTROL")?)?;
        ensure!(digest(&bytes)==std::env::var("CHECKPOINT_DIAGNOSTIC_CONTROL_SHA256")?,"exact original control");
        let proof=decode_proof(&bytes)?;let verifier=PsyPlonky2ZKVerifier::<C,2>::from_cached();let kind=Kind::GenesisBlockCheckpointStateTransition;
        verifier.verify_zk_proof(kind as u32,&proof)?;
        let info=&verifier.gcv.library.info_map[&kind];
        plonky2::plonk::circuit_data::VerifierCircuitData{verifier_only:info.verifier_data.to_verifier_data::<C,2>(),common:verifier.gcv.common.get_common_circuit_data_ref(kind)?.clone()}.verify(proof)?;
        Ok(())
    }
    #[test] fn observed_data_and_resource_checks_cannot_be_skipped(){
        let mut value=json!({"fixedWrapperComparison":{"fingerprintEqual":true,"verifierOnlyEqual":true,"commonEqual":true}});
        assert!(requested_checks_passed("cached-wrapper-audit",false,&value));
        assert!(!requested_checks_passed("cached-wrapper-audit",true,&value));
        value["observedPublicInputComparison"]=json!({"publicInputFormulaMatches":true});
        assert!(requested_checks_passed("cached-wrapper-audit",true,&value));
        value["fixedWrapperComparison"]["commonEqual"]=false.into();
        assert!(!requested_checks_passed("cached-wrapper-audit",true,&value));
    }
}
