//! Controller financial bytecode regressions. Full UPS tests live separately;
//! these local state commits are not network settlement / multi-host consensus.
use anyhow::Result;
#[path="support/composition_funds_world.rs"]mod world;
use world::*;
#[path="support/composition_full_ups.rs"]mod full_ups;
#[path="support/composition_market_vm.rs"]mod market_vm;
fn funded()->Result<World>{let mut w=World::new()?;let input=R+17;w.request(input,7,5)?;w.seed_funding(input)?;let f=w.fields("fund",&[],F)?;w.execute(&f)?;Ok(w)}
#[test]
fn exact_owner_funding_fee_and_cancelled_exit_have_no_residual()->Result<()> {
 let mut w=funded()?;assert_eq!(w.at(V,"phase"),2);assert_eq!(w.wide(V,A,0),R+17);assert_eq!(w.get(V,0,0),19*F);assert_eq!(w.at(V,"native_expected"),19*F);
 let original=w.slots.clone();assert!(w.execute(&w.fields("fund",&[],F)?).is_err());assert_eq!(w.slots,original);
 let p=pair(R+17);let out=w.fields("return-input",&[(3,p[0]),(4,p[1]),(11,18*F)],F)?;
 assert!(w.execute(&out).is_err());assert_eq!(w.slots,original);
 w.run(U,C,"request_cancel",&[1])?;w.execute(&out)?;assert_eq!(w.at(V,"phase"),99);assert_eq!(w.wide(V,A,0),0);assert_eq!(w.wide(V,B,0),0);assert_eq!(w.get(V,0,0),0);
 w.run(U,A,"claim",&[V])?;w.run(U,0,"simple_claim",&[V])?;assert_eq!(w.wide(U,A,0),R+17);assert_eq!(w.get(U,0,0),98*F);
 let terminal=w.slots.clone();assert!(w.execute(&out).is_err());assert_eq!(w.slots,terminal);Ok(())
}
#[test]
fn wrong_key_owner_amount_fee_or_partial_failure_cannot_consume_funding()->Result<()> {
 let mut original=World::new()?;original.request(R+17,7,5)?;original.seed_funding(R+17)?;
 for limb in 0..4{let mut w=original.clone();w.key[limb]+=1;let before=w.slots.clone();assert!(w.execute(&w.fields("fund",&[],F)?).is_err());assert_eq!(w.slots,before);}
 for wrong_owner in [U+1,V]{let mut w=original.clone();let mut f=w.fields("fund",&[],F)?;f[22]=wrong_owner;let before=w.slots.clone();assert!(w.execute(&f).is_err());assert_eq!(w.slots,before);}
 let mut mismatch=original.clone();mismatch.set(U,A,33554453+4*V,18);let before=mismatch.slots.clone();assert!(mismatch.execute(&mismatch.fields("fund",&[],F)?).is_err());assert_eq!(mismatch.slots,before);
 let mut f=original.fields("fund",&[],F)?;f[73]-=1000;assert!(original.execute(&f).is_err());
 let mut w=funded()?;w.run(U,C,"request_cancel",&[1])?;let p=pair(R+17);
 for values in [vec![(3,p[0]+1),(4,p[1]),(11,18*F)],vec![(3,p[0]),(4,p[1]),(11,18*F-1)]]{let f=w.fields("return-input",&values,F)?;let before=w.slots.clone();assert!(w.execute(&f).is_err());assert_eq!(w.slots,before);}
 Ok(())
}
#[test]
fn expired_intent_can_refund_but_cannot_replace_or_open_a_trade()->Result<()> {
 let mut w=funded()?;w.checkpoint=501;
 let p=pair(R+17);let first=w.fields("open-1",&[(3,p[0]),(4,p[1]),(5,7),(7,500),(8,1)],F)?;
 let before=w.slots.clone();assert!(w.execute(&first).is_err());assert_eq!(w.slots,before);
 assert!(w.request(R+18,7,5).is_err());
 w.execute(&w.fields("return-input",&[(3,p[0]),(4,p[1]),(11,18*F)],F)?)?;assert_eq!(w.at(V,"phase"),99);Ok(())
}
#[test]
fn inflight_principal_stays_locked_and_cancel_cannot_be_repeated_for_fees()->Result<()> {
 let mut w=funded()?;w.load_markets()?;let p=pair(R+17);
 let good=w.fields("open-1",&[(3,p[0]),(4,p[1]),(5,7),(7,500),(8,1)],F)?;
 for (i,bad) in [(22,U+1),(24,p[0]+1),(26,8),(28,499)]{let mut f=good.clone();f[i]=bad;let before=w.slots.clone();assert!(w.execute(&f).is_err());assert_eq!(w.slots,before);}
 w.execute(&good)?;assert_eq!(w.at(V,"phase"),3);assert_eq!(w.wide(V,A,0),0);assert_eq!(w.wide(V,A,33554453+4*300),R+17);assert_eq!(w.get(V,0,0),17*F);
 w.run(U,C,"request_cancel",&[1])?;
 let f=w.fields("return-input",&[(3,p[0]),(4,p[1]),(11,16*F)],F)?;let before=w.slots.clone();assert!(w.execute(&f).is_err());assert_eq!(w.slots,before);
 let cancel=w.fields("cancel-1",&[],F)?;w.execute(&cancel)?;let before=w.slots.clone();assert!(w.execute(&cancel).is_err());assert_eq!(w.slots,before);assert_eq!(w.at(V,"phase"),3);Ok(())
}
#[test]
fn owner_request_and_funding_binding_reject_wrong_asset_atomically()->Result<()> {
 let mut w=World::new()?;let amount=R+17;w.set(U,0,0,100*F);
 for asset in[A,B]{w.run(5,asset,"set_metadata",&[123,18])?;w.run(5,asset,"mint",&pair(1u128<<120))?;let mut args=vec![U];args.extend(pair(amount));w.run(5,asset,"transfer",&args)?;w.run(U,asset,"claim",&[5])?;}
 let before=w.slots.clone();let mut transfer=vec![V];transfer.extend(pair(amount));let request=w.request_args(amount,7,5);
 let wrong=vec![(C,"request_route",request.clone()),(0,"simple_transfer",vec![V,20*F]),(B,"transfer",transfer.clone()),(C,"bind_funding",vec![1])];
 assert!(w.atomic_calls(U,&wrong).is_err());assert_eq!(w.slots,before);assert_eq!(w.at(U,"request_nonce"),0);assert_eq!(w.wide(U,B,33554453+4*V),0);
 let right=vec![(C,"request_route",request),(0,"simple_transfer",vec![V,20*F]),(A,"transfer",transfer),(C,"bind_funding",vec![1])];w.atomic_calls(U,&right)?;assert_eq!(w.at(U,"request_funded"),1);assert_eq!(w.wide(U,A,33554453+4*V),amount);Ok(())
}
