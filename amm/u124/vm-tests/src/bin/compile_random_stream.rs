use anyhow::{ensure,Result};
use std::{env,fs,path::PathBuf};
fn main()->Result<()>{let a:Vec<_>=env::args().collect();ensure!(a.len()==5,"SOURCE FRESH_DIR ASSET_A ASSET_B");let out=psy_template_u124_markets::checkpoint_processor::compile_random_stream(&fs::read_to_string(&a[1])?,a[3].parse()?,a[4].parse()?)?;let p=PathBuf::from(&a[2]);fs::create_dir(&p)?;fs::write(p.join("compilation_artifact.json"),out.to_compilation_artifact_json()?)?;Ok(())}
