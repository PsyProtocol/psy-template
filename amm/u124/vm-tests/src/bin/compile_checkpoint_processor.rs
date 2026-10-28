use anyhow::{ensure,Result};
use std::{env,fs,path::PathBuf};
fn main()->Result<()>{
 let args:Vec<String>=env::args().collect();
 if args.len()==2&&args[1]=="network-magic"{println!("{}",psy_config::PSY_NETWORK_MAGIC);return Ok(());}
 ensure!(args.len()==5,"SOURCE FRESH_DIRECTORY ASSET_A ASSET_B");
 let out=psy_template_u124_markets::checkpoint_processor::compile(&fs::read_to_string(&args[1])?,args[3].parse()?,args[4].parse()?)?;
 let path=PathBuf::from(&args[2]);fs::create_dir(&path)?;fs::write(path.join("compilation_artifact.json"),out.to_compilation_artifact_json()?)?;
 println!("Compiled {} checkpoint processor methods; producer-controlled seed model, no live authorization",out.method_count());Ok(())
}
