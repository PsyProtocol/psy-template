//! Reverify the exact preserved component proof against source-built resources.
//! Never certifies a beacon, chain inclusion, SD-key, market UPS or payment.
use anyhow::{ensure,Result};
use bincode::Options;
use psy_template_u124_markets::random_order::{decode_candidate_input,frozen_root,permutation,PermutationCircuit};
use sha2::{Digest,Sha256};
use std::{fs,io::{Read,Write}};
fn main()->Result<()>{
 let args=std::env::args().collect::<Vec<_>>();ensure!(args.len()==4,"PUBLIC_INPUT PRESERVED_PROOF FRESH_REPORT");
 let mut bytes=Vec::new();fs::File::open(&args[1])?.take(16385).read_to_end(&mut bytes)?;let(fields,seed)=decode_candidate_input(&bytes)?;
 let mut proof=Vec::new();fs::File::open(&args[2])?.take(2000001).read_to_end(&mut proof)?;ensure!(proof.len()<=2000000,"bounded component proof");
 let parsed=bincode::DefaultOptions::new().with_fixint_encoding().with_limit(2000000).reject_trailing_bytes().deserialize(&proof)?;
 PermutationCircuit::build().verify_for(fields,seed,parsed)?;
 let report=serde_json::json!({"schema":1,"inputSha256":format!("{:x}",Sha256::digest(&bytes)),"proofSha256":format!("{:x}",Sha256::digest(&proof)),"componentProofVerified":true,"frozenRoot":frozen_root(&fields)?.map(|n|n.to_string()),"rank":permutation(&fields,seed)?,"qualifiedSource":false,"sealInclusionVerified":false,"fullUpsVerified":false,"financialOperations":0,"broadcast":false});
 let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&args[3])?;file.write_all(&serde_json::to_vec_pretty(&report)?)?;file.sync_all()?;Ok(())
}
