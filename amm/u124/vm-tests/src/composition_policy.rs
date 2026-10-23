//! Dedicated one-shot composition key. Same audited compact stack/session
//! construction, restricted to explicit controller operation branches only.
use anyhow::{ensure,Result};
use serde_json::Value;
use psy_ups_circuit::signature::sd_key::SDKeyCircuitGadget;
pub fn validate(spec:&Value)->Result<()> {
 crate::batch_compact::validate(spec)?;
 ensure!(spec["composition_profile"]=="two-amm-owner-funded-v1","composition profile");
 ensure!(spec["registry_hash"].as_str().is_some_and(|x|x.len()==64&&x.bytes().all(|c|c.is_ascii_hexdigit()&&!c.is_ascii_uppercase())),"registry digest");
 ensure!(spec["operations"].as_array().unwrap().iter().all(|o|o["maintenance"]==true),"composition operation only");
 ensure!(spec["operations"][0]["name"]=="fund"&&spec["operations"][0]["branch"]==1,"fresh funding branch identity");
 // Canonical noops can only be skipped by the compact key after the base
 // policy has bound their complete caller, arity, identity and input hash.
 ensure!(spec["noop"]["method_name"]=="noop"&&spec["noop"]["inputs"].as_array().is_some_and(|x|x.is_empty()),"canonical noop");
 Ok(())
}
pub fn build(spec:&Value)->Result<SDKeyCircuitGadget>{validate(spec)?;crate::batch_policy::build_composition_profile(spec)}
pub fn calls(spec:&Value,fields:&[u64])->Result<Vec<Value>>{
 validate(spec)?;ensure!(fields.len()==74&&fields[0]==4&&fields[33]==fields[73],"composition mode/exact fee");
 crate::batch_compact::calls(spec,fields)
}
