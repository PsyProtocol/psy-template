//! Owned constant export and compilation. No wallet, RPC, signing or broadcast.
use anyhow::{ensure, Result};
use plonky2::{
    field::{goldilocks_field::GoldilocksField as F, types::PrimeField64},
    hash::poseidon::PoseidonHash as H,
};
use psy_client_common::data::qhashout::QHashOut as Q;
use psy_crypto::hash::traits::hasher::MerkleZeroHasher;
use psy_template_u124_markets::random_minimum::{CONTEXT_TAG, STATE_TAG};
use std::{env, fs, path::PathBuf};
fn main() -> Result<()> {
    let a = env::args().collect::<Vec<_>>();
    if a.len() == 2 && a[1] == "constants" {
        let empty = |n: usize| {
            <H as MerkleZeroHasher<Q<F>>>::get_zero_hash(n)
                .0
                .elements
                .map(|n| n.to_canonical_u64().to_string())
        };
        println!(
            "{}",
            serde_json::to_string_pretty(
                &serde_json::json!({"schema":1,"empty24":empty(24),"empty56":empty(56),"stateTag":STATE_TAG.to_string(),"contextTag":CONTEXT_TAG.to_string(),"financialOperations":0,"canBroadcast":false})
            )?
        );
        return Ok(());
    }
    ensure!(
        a.len() == 5,
        "SOURCE FRESH_DIR ASSET_A ASSET_B or constants"
    );
    let out = psy_template_u124_markets::checkpoint_processor::compile_random_stream(
        &fs::read_to_string(&a[1])?,
        a[3].parse()?,
        a[4].parse()?,
    )?;
    let p = PathBuf::from(&a[2]);
    fs::create_dir(&p)?;
    fs::write(
        p.join("compilation_artifact.json"),
        out.to_compilation_artifact_json()?,
    )?;
    Ok(())
}
