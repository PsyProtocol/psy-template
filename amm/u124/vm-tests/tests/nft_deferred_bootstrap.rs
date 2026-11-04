//! Exact application-policy validation, without building or generating proofs.
//! Complete CFC/UPS and live-wallet acceptance remain separate requirements.
use anyhow::{ensure,Result};
use serde_json::{json,Value};
use psy_template_u124_markets::stream_exit;

#[test]
#[ignore="actual new collection artifact required; VM checks without proofs"]
fn account_preparation_bytecode_writes_only_its_protocol_version()->Result<()>{
 use psy_vm::dpn::{eval::executor::{VmExecutor,ExecutionContext},vm::def::DPNFunctionCircuitDefinition};
 use psy_vm::dpn::eval::executor::InMemoryStateBackend;
 let root=std::env::var("BATCH_BUILD")?;
 let artifact:Value=serde_json::from_slice(&std::fs::read(format!("{root}/nft/compilation_artifact.json"))?)?;
 let definitions:Vec<DPNFunctionCircuitDefinition>=serde_json::from_value(artifact["circuit_definitions"].clone())?;
 let method=definitions.iter().find(|x|x.name=="prepare_account").unwrap();
 for version in [0,1,2]{
  let mut state=InMemoryStateBackend::new();state.set_slot(200,41,603980958,version);
  let mut vm=VmExecutor::new(state);
  let result=vm.execute(method,&ExecutionContext{user_id:200,contract_id:41,caller_contract_id:psy_config::network_constants::DEFAULT_CALLER_CONTRACT_ID_U64,checkpoint_id:100,nonce:1,user_public_key_hash:[0;4],session_proof_tree_root:[0;4],transaction_log:vec![],transaction_stack_hash:[0;4]},&[])?;
  ensure!(result.success==(version<=1),"account version gate");
  if result.success{let writes=vm.write_overlay();ensure!(writes.len()==1&&writes.get(&(200,41,603980958))==Some(&1),"preparation cannot mutate any balance, NFT, authority or FIFO cursor");}
 }
 Ok(())
}

#[test]
#[ignore="explicit new v21 artifact fixture and frozen audit feature required"]
fn exact_deferred_nft_bootstrap_rejects_policy_substitutions()->Result<()>{
    ensure!(cfg!(feature="sdk-audit-v1"),"exact selected release");
    let root=std::env::var("BATCH_BUILD")?;
    let spec:Value=serde_json::from_slice(&std::fs::read(format!("{root}/nftmarket/stream-policy.json"))?)?;
    ensure!(stream_exit::nft_account_bootstrap(&spec),"v21 fixture required");
    stream_exit::validate(&spec)?;
    let index=spec["base"]["operations"].as_array().unwrap().iter().position(|x|x["name"]=="activate").unwrap();
    for case in ["profile","market","initialization","sdk","client","collection-touch","redirected-seed","seed-high-limb","coverage-stack","fee-policy"]{
        let mut bad=spec.clone();
        match case {
            "profile"=>bad["profile"]=json!("source-covered-pair-authorized-exit-v1"),
            "market"=>bad["market"]=json!("orderbook"),
            "initialization"=>{bad.as_object_mut().unwrap().remove("collection_initialization");},
            "sdk"=>bad["base"]["sdk_commit"]=json!("0".repeat(40)),
            "client"=>bad["base"]["client_commit"]=json!("0".repeat(40)),
            "collection-touch"=>bad["base"]["operations"][index]["calls"][2]["contract_id"]=spec["base"]["config"]["tokenId"].clone(),
            "redirected-seed"=>bad["base"]["operations"][index]["calls"][5]["inputs"][0]=json!({"witness":2}),
            "seed-high-limb"=>bad["base"]["operations"][index]["calls"][5]["inputs"][2]=json!({"constant":"1"}),
            "coverage-stack"=>bad["base"]["branches"][2+index]["calls"]=json!([]),
            _=>bad["exit_policy"]["only_original_credit_returns"]=json!(false),
        }
        ensure!(stream_exit::validate(&bad).is_err(),"accepted {case}");
    }
    Ok(())
}
