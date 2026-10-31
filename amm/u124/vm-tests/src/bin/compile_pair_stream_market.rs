//! Distinct offline pair compiler. Asset A is the payment FT; asset B is the
//! collection for NFT Market. The legacy batch compiler's NFT order differs.
//! Audit every foreign state height after lowering; no deployment or signing.
use anyhow::{ensure, Context, Result};
use psy_vm::dpn::ops::{
    op_types::{DPNBuiltInDataType, DPNOpType},
    state_cmd::data::DPNStateCmd,
};
fn main() -> Result<()> {
    let args = std::env::args().collect::<Vec<_>>();
    if args.len()==2 && args[1]=="network-magic" {println!("{}",psy_config::PSY_NETWORK_MAGIC);return Ok(());}
    ensure!(
        args.len() == 6,
        "SOURCE FRESH_OUT PAYMENT_OR_ASSET_A COLLECTION_OR_ASSET_B IS_NFT"
    );
    let a: u64 = args[3].parse()?;
    let b: u64 = args[4].parse()?;
    let nft: bool = args[5].parse()?;
    let source = std::fs::read_to_string(&args[1])?;
    let output = psy_template_u124_markets::batch_compile::compile(
        &source,
        if nft { b } else { a },
        if nft { a } else { b },
        nft,
    )?;
    let mut reads = 0usize;
    for def in &output.circuit_definitions {
        let constants = def
            .definitions
            .iter()
            .filter(|n| {
                n.data_type == DPNBuiltInDataType::Target && n.op_type == DPNOpType::Constant
            })
            .map(|n| (n.index as u64, n.inputs[0]))
            .collect::<std::collections::HashMap<_, _>>();
        let own = def
            .definitions
            .iter()
            .find(|n| n.op_type == DPNOpType::GetContractId)
            .map(|n| n.index as u64);
        for cmd in &def.state_commands {
            let binding = match cmd {
                DPNStateCmd::GetOtherUserContractStateSlotSingle(c) => {
                    Some((c.contract_id, c.contract_state_tree_height))
                }
                DPNStateCmd::GetOtherUserContractStateSlotRange(c) => {
                    Some((c.contract_id, c.contract_state_tree_height))
                }
                DPNStateCmd::GetSelfUserExternalContractStateSlotSingle(c) => {
                    Some((c.contract_id, c.contract_state_tree_height))
                }
                DPNStateCmd::GetSelfUserExternalContractStateSlotRange(c) => {
                    Some((c.contract_id, c.contract_state_tree_height))
                }
                _ => None,
            };
            if let Some((id, height)) = binding {
                let expected = match constants.get(&id).copied() {
                    Some(0) => 32,
                    Some(id) if id == a => 31,
                    Some(id) if id == b => {
                        if nft {
                            30
                        } else {
                            31
                        }
                    }
                    _ if Some(id) == own => 31,
                    _ => anyhow::bail!("unreviewed foreign identity in {}", def.name),
                };
                ensure!(
                    *constants.get(&height).context("unresolved proof height")? == expected,
                    "foreign height/identity mismatch in {}",
                    def.name
                );
                reads += 1;
            }
        }
    }
    let path = std::path::Path::new(&args[2]);
    std::fs::create_dir(path)?;
    std::fs::write(
        path.join("compilation_artifact.json"),
        output.to_compilation_artifact_json()?,
    )?;
    std::fs::write(
        path.join("FOREIGN_READ_AUDIT.json"),
        serde_json::to_vec_pretty(
            &serde_json::json!({"foreignReadCommandsChecked":reads,"assetA":a,"assetB":b,"assetAHeight":31,"assetBHeight":if nft{30}else{31},"nativeHeight":32,"allReadsBound":true,"financialOperations":0}),
        )?,
    )?;
    Ok(())
}
