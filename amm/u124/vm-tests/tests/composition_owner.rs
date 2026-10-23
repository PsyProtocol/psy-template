//! Regression for the one-shot account being occupied by a different funder.
//! Actual compiled controller bytecode; no network or concurrency claim.
use anyhow::Result;
#[path="support/composition_funds_world.rs"]mod world;
use world::*;
#[test]
fn another_owner_cannot_publish_or_occupy_the_dedicated_controller()->Result<()> {
 assert!(std::env::var_os("COMPOSITION_OWNER_GUARD").is_some(),"explicit owner-pinned compiled fixture required");
 let mut w=World::new()?;let args=w.request_args(R+17,7,5);let before=w.slots.clone();
 assert!(w.run(U+1,C,"request_route",&args).is_err());assert_eq!(w.slots,before);
 w.request(R+17,7,5)?;w.seed_funding(R+17)?;
 // Even apparently matching foreign-owner request slots cannot select a
 // different owner's funding branch. The circuit must execute this bytecode.
 for name in["request_vault","request_nonce","request_funded","request_budget","request_expiry"]{let value=w.at(U,name);w.set(U+1,C,w.fields[name],value);}
 let mut attack=w.fields("fund",&[],F)?;attack[22]=U+1;let before=w.slots.clone();assert!(w.execute(&attack).is_err());assert_eq!(w.slots,before);
 w.execute(&w.fields("fund",&[],F)?)?;assert_eq!(w.at(V,"owner"),U);assert_eq!(w.at(V,"phase"),2);Ok(())
}
