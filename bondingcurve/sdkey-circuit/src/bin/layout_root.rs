//! Independently recompute the deployment layout root from the compiler ABI.
use std::{env, fs};

use anyhow::{Context, Result};
use parth_core::{
    pgoldilocks::{PoseidonHasher, QHashOut},
    PF,
};
use psy_core::constants::protocol::STATE_LAYOUT_TREE_HEIGHT;
use psy_data::v1::qdata::contract::{
    canonical_layout_manifest_from_compiler_abi_json, CANONICAL_TYPE_LAYOUT_STRUCT_TREE_HEIGHT,
};

fn main() -> Result<()> {
    let path = env::args()
        .nth(1)
        .context("usage: layout_root <compiled-abi.json>")?;
    let abi = fs::read_to_string(path)?;
    let manifest =
        canonical_layout_manifest_from_compiler_abi_json::<PoseidonHasher, PF, QHashOut<PF>>(
            &abi,
            STATE_LAYOUT_TREE_HEIGHT,
            CANONICAL_TYPE_LAYOUT_STRUCT_TREE_HEIGHT,
        )?;
    println!("{}", manifest.layout.contract_layout.state_layout_root);
    Ok(())
}
