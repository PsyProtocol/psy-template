//! Derive PUBLIC account identities for the deliberately public SD-key value.
use anyhow::{ensure,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},hash::hash_types::HashOut};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::config::store_config::PsyHasher;
use psy_crypto::{signature::zk::data::ZKPublicKeyInfo,hash::traits::qhashable::QFieldHashable};
use psy_template_u124_markets::policy::build_policy;
use psy_ups_circuit::signature::sd_key::get_sd_key_public_key_param;
use std::{env,fs};
fn main()->Result<()>{let args:Vec<String>=env::args().collect();ensure!(args.len()==2,"policy_identity <policy.json>");let spec=serde_json::from_slice(&fs::read(&args[1])?)?;let g=build_policy(&spec)?;let fingerprint=g.get_fingerprint();let public_key_param=get_sd_key_public_key_param(&QHashOut(HashOut{elements:[F::ONE;4]}));let public=ZKPublicKeyInfo{public_key_param,fingerprint};println!("{}",serde_json::json!({"fingerprint":fingerprint.to_string(),"publicKeyHash":public.qfhash::<PsyHasher>().to_string()}));Ok(())}
