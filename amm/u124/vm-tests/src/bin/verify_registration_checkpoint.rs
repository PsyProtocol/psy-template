//! Verify saved public registration/checkpoint statements. No RPC or signing.
use anyhow::{ensure, Result};
use plonky2::field::goldilocks_field::GoldilocksField as F;
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_crypto::common::user_id::get_registration_id_from_user_id;
use psy_template_u124_markets::registration_checkpoint::{RegistrationCheckpoint,verify_registration_checkpoint};
use serde_json::json;
use std::{env,fs,io::Write};
fn main() -> Result<()> {
    let a=env::args().collect::<Vec<_>>();
    if a.len()==3 && a[1]=="index" {
        let user:u64=a[2].parse()?;ensure!(user>0&&user<(1u64<<24),"ordinary user range");
        println!("{}",get_registration_id_from_user_id(user));return Ok(());
    }
    ensure!(a.len()==7,"EXPECTED_CHAIN_ROOT CHECKPOINT_TREE_ROOT USER_ID PUBLIC_KEY INPUT REPORT");
    ensure!(fs::metadata(&a[5])?.len() <= 100_000,"bounded public registration input required");
    let input:RegistrationCheckpoint=serde_json::from_slice(&fs::read(&a[5])?)?;
    verify_registration_checkpoint(&input,a[1].parse::<Q<F>>()?,a[2].parse::<Q<F>>()?,a[3].parse()?,a[4].parse::<Q<F>>()?)?;
    let mut out=fs::OpenOptions::new().write(true).create_new(true).open(&a[6])?;
    out.write_all(&serde_json::to_vec_pretty(&json!({"schema":1,"registrationTreeVerified":true,
        "checkpoint":input.checkpoint_id,"userId":input.user_id,"publicKeyHash":input.public_key.to_string(),
        "registrationIndex":input.registration_proof.index,"chainRootAt1":input.chain_anchor_leaf.global_chain_root.to_string(),
        "checkpointTreeRoot":input.checkpoint_proof.root.to_string(),"checkpointMembershipVerified":true,"firstUpsVerified":false,"financialAuthorization":false,"financialOperations":0,
        "boundary":"Merkle membership relative to an explicitly supplied RPC checkpoint-tree root; not consensus/runtime attestation, user-state initialization, full UPS or browser acceptance"}))?)?;
    out.write_all(b"\n")?;out.sync_all()?;Ok(())
}
