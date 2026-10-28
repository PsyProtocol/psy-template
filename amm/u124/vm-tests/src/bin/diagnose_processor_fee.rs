//! Offline stack diagnosis from an explicit public projection. No proving or RPC.
use anyhow::{ensure,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::{Field,PrimeField64}},hash::poseidon::PoseidonHash};
use psy_client_data::dpn::{sd_key::SDKeyTransactionInfo,proving_session::DPNProvingSessionCompactMethodCall};
use psy_template_u124_markets::market_key::compute_tx_stack_hash;
use std::{fs,io::Write};
use serde_json::{Value,json};
fn main()->Result<()>{
 let a=std::env::args().collect::<Vec<_>>();ensure!(a.len()==4,"PUBLIC_KEY_PROJECTION POLICY FRESH_REPORT");
 let v:Value=serde_json::from_slice(&fs::read(&a[1])?)?;let p:Value=serde_json::from_slice(&fs::read(&a[2])?)?;
 ensure!(v["schema"]==1&&p["version"]==3,"explicit offline candidate inputs");
 let logical:Vec<SDKeyTransactionInfo<F>>=serde_json::from_value(v["transactionInfos"].clone())?;
 let cid=p["noop"]["contract_id"].as_u64().unwrap();let mid=p["noop"]["method_id"].as_u64().unwrap();
 let mut actual=logical.into_iter().filter(|c|c.contract_id.to_canonical_u64()!=cid||c.method_id.to_canonical_u64()!=mid).collect::<Vec<_>>();
 ensure!(!actual.is_empty(),"nonempty actual stack");let last=*actual.last().unwrap();let observed=compute_tx_stack_hash(&actual);
 ensure!(serde_json::to_value(observed)?==v["stackHash"],"public projection does not match observed stack");
 let mut cases=vec![];for slots in 29..=33{let burn=psy_config::network_constants::GUTA_FEE+psy_config::DA_FEE*slots;
  *actual.last_mut().unwrap()=DPNProvingSessionCompactMethodCall::new_from_inputs::<PoseidonHash>(last.caller_contract_id,last.contract_id,last.method_id,&[F::from_canonical_u64(burn)]).into();
  let hash=compute_tx_stack_hash(&actual);cases.push(json!({"hypotheticalFinalSlots":slots,"burn":burn,"stackHash":hash,"limbs":hash.0.elements.map(|n|n.to_canonical_u64())}));
 }
 let report=json!({"scope":"candidate fee hash diagnosis only; slot counts are hypotheses, not authenticated state","observedBurn":v["fields"][73],"observedStack":observed,"observedLimbs":observed.0.elements.map(|n|n.to_canonical_u64()),"cases":cases,"proofVerified":false,"broadcast":false});
 let mut out=fs::OpenOptions::new().create_new(true).write(true).open(&a[3])?;out.write_all(&serde_json::to_vec_pretty(&report)?)?;out.sync_all()?;Ok(())
}
