//! Original owner is absent after its genesis grant. VM actor prerequisites
//! remain explicit; vault transitions use real candidate bytecode/full UPSs.
use super::*;
use psy_common_circuit::circuits::zk_signature3::core::PsyBasicZKSignatureCircuit;
use psy_crypto::signature::zk::wallet::SimplePsyPrivateKey;
const OWNER:u64=600;const P:u64=601;const PAYER2:u64=602;
fn bind(mut r:Request,key:[u64;4],payer:u64)->Request{r.registered_key=Some(key);r.fields[74]=payer;r}
fn inactive()->SourcePage{SourcePage{scope:vec![0;41],facts:vec![[0;4];5],before:Progress::empty(),after:Progress::empty(),rows:vec![]}}
async fn advance(chain:&mut Option<StreamChain>,w:&mut World,s:&Value,r:Request,out:&str,label:&str)->Result<()>{
 let r=minimum_exact_fee(w,s,r)?;
 if let Some(c)=chain{c.prove(w,r,out,label).await}else{execute(w,s,&r)?;w.checkpoint+=1;Ok(())}
}
async fn flow(kind:&str,out:&str,vm:bool)->Result<()> {
 let mut w=World::new_fixture(kind,false,false)?;
 for u in[OWNER,P,PAYER2]{w.set(u,0,0,100*ESCROW);}
 let spec=read_spec(kind)?;ensure!(psy_template_u124_markets::stream_exit::enabled(&spec),"new exit key only");
 let mut chain=if vm{None}else{let mut c=StreamChain::new_with_maintenance(&w,true).await?;c.base.keep_history=true;Some(c)};
 let signature=if vm{None}else{Some(PsyBasicZKSignatureCircuit::<C,2>::new())};
 let private=Q(HashOut{elements:[f(200),f(20261101),GF::ZERO,GF::ONE]});
 if let Some(c)=&mut chain{let wallet=SimplePsyPrivateKey::new(private);c.base.actor_keys.insert(200,wallet.get_public_key_for_fingerprint::<PoseidonHash>(signature.as_ref().unwrap().get_fingerprint()));}
 let mut ordinary_fees=0u128;
 let key=chain.as_ref().map(super::funded_bootstrap_full_ups::registered).unwrap_or([11,22,33,44]);
 let total=[asset_total(&w,A)?,asset_total(&w,B)?];let native=super::minimum_stream_full_ups::native_total(&w)?;
 // One bootstrap fee is authorized. No subsequent OWNER authorization occurs.
 w.run(OWNER,M,"authorize_fee_budget",&[vec![V,1,ESCROW],key.to_vec()].concat())?;w.run(OWNER,0,"transfer",&[V,10*ESCROW])?;
 w.fee(I)?;w.pay(I,A,1)?;if kind!="nftmarket"{w.pay(I,B,1)?;}
 if let Some(c)=&mut chain{let db=c.base.seed_identity_with_history(&w,c.key.g.get_fingerprint(),&[(1,anchor_leaf())]).await?;let h=snapshot_header(db,&w,&c.review,c.key.g.get_fingerprint()).await?;c.source=SourcePage::inactive_maintenance(&c.review,&h)?.0;}
 let page=if let Some(c)=&chain{SourcePage::inactive_maintenance(&c.review,&c.source)?.1}else{inactive()};
 let mut boot=bind(basic(14,&page,&w),key,0);boot.fields[21]=1;boot.fields[22]=ESCROW;boot.fields[23]=1;boot.fields[24]=I;
 advance(&mut chain,&mut w,&spec,boot,out,"bootstrap").await?;
 ensure!(w.val(V,"fee_cap",0)-w.val(V,"fee_used",0)<1_000_000_000,"service cap exhausted");
 let mut ret=bind(basic(16,&page,&w),key,0);ret.fields[21]=w.val(V,"treasury_credit",0)-ret.fields[73];
 let prepared=minimum_exact_fee(&w,&spec,ret.clone())?;let returned=prepared.fields[21];
 let original=w.slots.clone();let mut wrong=prepared.clone();wrong.fields[21]-=1;
 ensure!(execute(&mut w,&spec,&wrong).is_err()&&w.slots==original,"partial/dust owner return rejected without writes");
 advance(&mut chain,&mut w,&spec,ret,out,"owner-return").await?;
 ensure!(w.val(V,"treasury_credit",0)==0&&w.val(V,"treasury_returned",0)==returned,"only original owner credit returned");
 // Returning owner credit never credits the recipient's spendable account.
 let owner_before=w.state.get_contract_slot(OWNER,0,0)?;
 ensure!(owner_before==90*ESCROW,"owner remains offline; outbox is not claimed");
 let n=(1u128<<62)+17;let payload=if kind=="nftmarket"{Some(super::pair_stream::nft_payload(&w,200)?)}else{None};
 match kind{
  "amm"=>{w.run(200,M,"open_swap",&args(&[V,0],&[n,1],&[200,1]))?;w.pay(200,A,n)?;},
  "bondingcurve"=>{w.run(200,M,"open_limit_buy",&args(&[V,1,0],&[n],&[200,1]))?;w.pay(200,B,n)?;},
  "orderbook"=>{w.run(200,M,"open_sell",&args(&[V,0],&[n,1],&[200,1]))?;w.pay(200,A,n)?;},
  _=>{w.run(200,NFT,"acknowledge",&[V])?;w.run(200,M,"open_listing",&args(&[V,0],&[n],&[200,1]))?;w.run(200,NFT,"transfer",&[0,V])?;}
 }
 w.fee(200)?;w.run(200,M,"request_cancel",&[])?;w.run(200,M,"request_recovery",&[V])?;
 let after=w.checkpoint+8;
 w.run(P,M,"authorize_exit_fees",&[vec![V,1,8*ESCROW,after],key.to_vec()].concat())?;w.run(P,0,"transfer",&[V,8*ESCROW])?;
 let mut grant=bind(basic(15,&page,&w),key,P);grant.fields[21..25].copy_from_slice(&[P,1,8*ESCROW,after]);
 advance(&mut chain,&mut w,&spec,grant.clone(),out,"independent-grant").await?;
 let original=w.slots.clone();ensure!(execute(&mut w,&spec,&grant).is_err()&&w.slots==original,"grant replay cannot recredit funding");
 let name=if kind=="nftmarket"{"recover_funding_4"}else if kind=="bondingcurve"{"recover_funding_6"}else{"recover_funding_5"};
 let(mut a,mut b,mask)=(n,0u128,5);let mask=if kind=="nftmarket"{a=0;4}else if kind=="bondingcurve"{a=0;b=n;6}else{mask};
 let mut req=bind(basic(4,&page,&w),key,P);req.fields[21..34].copy_from_slice(&w.fields(name,200,0,a,b,0,ESCROW,mask,0));
 let original=w.slots.clone();let mut bad=req.clone();bad.fields[74]=PAYER2;ensure!(execute(&mut w,&spec,&bad).is_err()&&w.slots==original,"unfunded sponsor cannot spend another credit");
 advance(&mut chain,&mut w,&spec,req,out,"original-user-refund").await?;
 if kind=="nftmarket"{
  let mut req=bind(basic(4,&page,&w),key,P);req.fields[21..34].copy_from_slice(&w.fields("recover_nft",200,0,0,0,0,0,0,0));
  advance(&mut chain,&mut w,&spec,req,out,"original-nft-refund").await?;
  if let Some(c)=&mut chain{ordinary_fees+=super::funded_lifecycle_full_ups::ordinary(c,&mut w,signature.as_ref().unwrap(),private,200,vec![json!({"contract_id":NFT,"method_name":"claim","inputs":[0,V]}),json!({"contract_id":0,"method_name":"claim","inputs":[V]}),json!({"contract_id":0,"method_name":"transfer","inputs":[V,ESCROW]})],out,&format!("{kind}-ordinary-user-claim")).await? as u128;}else{w.run(200,NFT,"claim",&[0,V])?;w.run(200,0,"claim",&[V])?;w.fee(200)?;}ensure!(Some(super::pair_stream::nft_payload(&w,200)?)==payload,"exact original NFT and metadata returned");
  let mut req=bind(basic(4,&page,&w),key,P);req.fields[21..34].copy_from_slice(&w.fields("ack_delivery",200,0,0,0,0,0,0,0));
  advance(&mut chain,&mut w,&spec,req,out,"refund-delivery-ack").await?;
 }else{let asset=if kind=="bondingcurve"{B}else{A};let before=w.balance(200,asset);if let Some(c)=&mut chain{ordinary_fees+=super::funded_lifecycle_full_ups::ordinary(c,&mut w,signature.as_ref().unwrap(),private,200,vec![json!({"contract_id":asset,"method_name":"claim","inputs":[V]}),json!({"contract_id":0,"method_name":"claim","inputs":[V]})],out,&format!("{kind}-ordinary-user-claim")).await? as u128;}else{w.run(200,asset,"claim",&[V])?;w.run(200,0,"claim",&[V])?;}ensure!(w.balance(200,asset)==before+n,"full U124 original input returned");}
 let mut early=bind(basic(17,&page,&w),key,P);early.fields[21]=P;early.fields[22]=w.val(V,"exit_credit",P)-early.fields[73];
 let original=w.slots.clone();ensure!(execute(&mut w,&spec,&early).is_err()&&w.slots==original,"public operator cannot revoke sponsor before signed deadline");
 w.checkpoint=after+1;
 // A second independent sponsor can pay to return all first-sponsor credit.
 let deadline=w.checkpoint+8;w.run(PAYER2,M,"authorize_exit_fees",&[vec![V,1,4*ESCROW,deadline],key.to_vec()].concat())?;w.run(PAYER2,0,"transfer",&[V,4*ESCROW])?;
 let mut req=bind(basic(15,&page,&w),key,PAYER2);req.fields[21..25].copy_from_slice(&[PAYER2,1,4*ESCROW,deadline]);
 advance(&mut chain,&mut w,&spec,req,out,"second-sponsor-grant").await?;
 let mut req=bind(basic(17,&page,&w),key,PAYER2);req.fields[21]=P;req.fields[22]=w.val(V,"exit_credit",P);
 advance(&mut chain,&mut w,&spec,req,out,"first-sponsor-return").await?;ensure!(w.val(V,"exit_credit",P)==0,"no redirected sponsor residue");
 w.checkpoint=deadline+1;let mut req=bind(basic(17,&page,&w),key,PAYER2);req.fields[21]=PAYER2;req.fields[22]=w.val(V,"exit_credit",PAYER2)-req.fields[73];
 advance(&mut chain,&mut w,&spec,req,out,"last-sponsor-return").await?;
 ensure!(w.val(V,"exit_credit",PAYER2)==0,"last payer credit fully returned less exact return fee");
 for u in [OWNER,P,PAYER2]{w.run(u,0,"claim",&[V])?;}
 let fees=w.val(V,"fee_used",0)as u128+w.val(V,"treasury_return_fee",0)as u128+w.val(V,"exit_spent",0)as u128+ordinary_fees;
 ensure!(native==super::minimum_stream_full_ups::native_total(&w)?+fees&&total==[asset_total(&w,A)?,asset_total(&w,B)?],"all assets/outboxes/burns conserved");
 fs::write(format!("{out}/{kind}-REPORT.json"),serde_json::to_vec_pretty(&json!({"scope":"Synthetic vault transitions; funding/authorization and owner/sponsor claims are VM prerequisites; the user claim has an ordinary signed complete synthetic UPS in full mode, not network/extension acceptance","vmOnly":vm,"fullUpsVerified":!vm,"originalOwnerAbsentAfterBootstrap":true,"ownerCreditReturned":returned.to_string(),"independentExitFees":true,"ordinaryUserClaimFullUps":!vm,"ordinaryFees":ordinary_fees.to_string(),"originalAssetRefund":true,"sponsorDeadlineEnforced":true,"allNativeFeeBanksReconciled":true,"assetConservation":true,"financialOperations":0,"measurements":chain.as_ref().map(|c|&c.measurements)}))?)?;Ok(())
}
#[tokio::test]
#[ignore="bounded explicit new artifacts; single owner, no live finance"]
async fn independent_exit_and_tagged_treasury_complete_ups()->Result<()>{let out=std::env::var("FEE_EXIT_OUT")?;fs::create_dir(&out)?;let vm=std::env::var("FEE_EXIT_VM_ONLY").as_deref()==Ok("1");for kind in std::env::var("FEE_EXIT_MARKETS").unwrap_or_else(|_|"amm,bondingcurve,orderbook,nftmarket".into()).split(','){flow(kind,&out,vm).await?;}Ok(())}

// Separate bounded synthetic AMM world: frozen source recovery must not require
// the original treasury owner or permit new trades using auxiliary credit.
#[tokio::test]
#[ignore="nine additional bounded synthetic UPSs; run after the four-market cohort"]
async fn independent_exit_preserves_active_source_and_timeout_refunds()->Result<()>{
 let out=std::env::var("FEE_EXIT_ACTIVE_OUT")?;fs::create_dir(&out)?;let vm=std::env::var("FEE_EXIT_VM_ONLY").as_deref()==Ok("1");
 let mut w=World::new_fixture("amm",false,false)?;for user in[OWNER,P]{w.set(user,0,0,100*ESCROW);}
 let total=[asset_total(&w,A)?,asset_total(&w,B)?];let native=super::minimum_stream_full_ups::native_total(&w)?;
 let mut chain=StreamChain::new_with_maintenance(&w,true).await?;chain.base.keep_history=true;
 let key=super::funded_bootstrap_full_ups::registered(&chain);let spec=chain.spec.clone();
 w.run(OWNER,M,"authorize_fee_budget",&[vec![V,1,3*ESCROW],key.to_vec()].concat())?;w.run(OWNER,0,"transfer",&[V,10*ESCROW])?;
 w.fee(I)?;w.pay(I,A,1)?;w.pay(I,B,1)?;
 let db=chain.base.seed_identity_with_history(&w,chain.key.g.get_fingerprint(),&[(1,anchor_leaf())]).await?;let h=snapshot_header(db,&w,&chain.review,chain.key.g.get_fingerprint()).await?;chain.source=SourcePage::inactive_maintenance(&chain.review,&h)?.0;
 let(_,mut idle)=SourcePage::inactive_maintenance(&chain.review,&chain.source)?;
 let mut req=bind(basic(14,&idle,&w),key,0);req.fields[21..25].copy_from_slice(&[1,3*ESCROW,1,I]);
 async fn step(c:&mut StreamChain,w:&mut World,s:&Value,r:Request,out:&str,label:&str,vm:bool)->Result<()>{if vm{let r=minimum_exact_fee(w,s,r)?;execute(w,s,&r)?;w.checkpoint+=1;Ok(())}else{c.prove(w,r,out,label).await}}
 step(&mut chain,&mut w,&spec,req,&out,"active-bootstrap",vm).await?;
 let expired=w.checkpoint+1;w.run(P,M,"authorize_exit_fees",&[vec![V,1,8*ESCROW,expired],key.to_vec()].concat())?;w.run(P,0,"transfer",&[V,8*ESCROW])?;
 w.checkpoint=expired+1;let mut stale=bind(basic(15,&idle,&w),key,P);stale.fields[21..25].copy_from_slice(&[P,1,8*ESCROW,expired]);let before=w.slots.clone();ensure!(execute(&mut w,&spec,&stale).is_err()&&w.slots==before,"expired unclaimed grant cannot debit or credit funds");
 // Renewal is an explicit sponsor authorization, not an automatic signature,
 // replacement broadcast or second Native payment. Original owner stays absent.
 let after=w.checkpoint+96;w.run(P,M,"authorize_exit_fees",&[vec![V,2,8*ESCROW,after],key.to_vec()].concat())?;
 ensure!(w.state.get_contract_slot(P,0,0)?==92*ESCROW,"renewal uses the original pending contribution without another payment");
 let mut req=bind(basic(15,&idle,&w),key,P);req.fields[21..25].copy_from_slice(&[P,2,8*ESCROW,after]);step(&mut chain,&mut w,&spec,req,&out,"active-exit-grant",vm).await?;
 let n=(1u128<<62)+17;w.run(200,M,"open_swap",&args(&[V,0],&[n,1],&[200,1]))?;w.pay(200,A,n)?;w.fee(200)?;
 let db=chain.base.seed_identity_with_history(&w,chain.key.g.get_fingerprint(),&[(1,anchor_leaf())]).await?;chain.source=snapshot(db,&w,&chain.review,chain.key.g.get_fingerprint()).await?;chain.source_checkpoint=w.checkpoint;
 idle=SourcePage::inactive_maintenance(&chain.review,&chain.source)?.1;
 let snapshot=chain.source.clone();let pages=stream_source::prepare(&chain.review,&snapshot,snapshot.history.checkpoint_path.root)?;let queue=stream_source::priority(&chain.review,&snapshot,snapshot.history.checkpoint_path.root)?;
 ensure!(pages.len()==2&&queue.members.len()==1,"bounded complete eight-account, one-order source");
 let r=bind(basic(OPEN,&pages[0],&w),key,0);step(&mut chain,&mut w,&spec,r,&out,"active-open",vm).await?;
 // Returning tagged treasury during a frozen batch cannot change its identity.
 let mut premature=bind(basic(16,&idle,&w),key,0);premature.fields[21]=w.val(V,"treasury_credit",0)-premature.fields[73];
 let before=w.slots.clone();ensure!(execute(&mut w,&spec,&premature).is_err()&&w.slots==before,"public return cannot remove a live service budget");
 // Finish one legitimate source page using the last available owner fee.
 // Only then is permissionless treasury exit authorized by exhaustion.
 let r=bind(basic(COVER,&pages[0],&w),key,0);step(&mut chain,&mut w,&spec,r,&out,"active-primary-cover-0",vm).await?;
 let original_scope=(0..4).map(|i|w.val(V,"stream_scope",i)).collect::<Vec<_>>();
 let mut req=bind(basic(16,&idle,&w),key,0);req.fields[21]=w.val(V,"treasury_credit",0)-req.fields[73];step(&mut chain,&mut w,&spec,req,&out,"active-owner-return",vm).await?;
 ensure!((0..4).map(|i|w.val(V,"stream_scope",i)).collect::<Vec<_>>()==original_scope&&w.val(V,"treasury_credit",0)==0,"return cannot unlock or replace the frozen source");
 let abandoned=w.clone();let fork_leaf=chain.base.last_leaf;
 for(i,page)in pages.iter().enumerate().skip(1){let r=bind(basic(COVER,page,&w),key,P);step(&mut chain,&mut w,&spec,r,&out,&format!("active-cover-{i}"),vm).await?;}
 ensure!(w.val(V,"stream_phase",0)==3,"complete original source before refunds");w.checkpoint=snapshot.fields[7]+1;
 let r=bind(settle_request(&w,&chain.review,&snapshot,&pages[0],&queue,0)?,key,P);
 ensure!(spec["base"]["operations"].as_array().unwrap().iter().any(|o|o["branch"]==r.fields[21]&&o["name"].as_str().unwrap().starts_with("refund_funding")),"expiry chooses original refund, not a trade");
 step(&mut chain,&mut w,&spec,r,&out,"active-timeout-refund",vm).await?;
 let before=w.balance(200,A);w.run(200,A,"claim",&[V])?;w.run(200,0,"claim",&[V])?;ensure!(w.balance(200,A)==before+n&&w.val(V,"stream_phase",0)==7,"all original input returned, terminal frozen set");
 let main_fees=w.val(V,"fee_used",0)as u128+w.val(V,"treasury_return_fee",0)as u128+w.val(V,"exit_spent",0)as u128;
 ensure!(native==super::minimum_stream_full_ups::native_total(&w)?+main_fees&&total==[asset_total(&w,A)?,asset_total(&w,B)?],"active main-history conservation including pending treasury/sponsor assets");
 let mut fork=abandoned;fork.checkpoint=snapshot.fields[7]+1;chain.base.last_leaf=fork_leaf;
 let r=bind(basic(ABORT_SOURCE,&pages[0],&fork),key,P);step(&mut chain,&mut fork,&spec,r,&out,"active-abort-fork",vm).await?;
 fork.run(200,M,"request_cancel",&[])?;fork.run(200,M,"request_recovery",&[V])?;
 let mut r=bind(basic(4,&idle,&fork),key,P);r.fields[21..34].copy_from_slice(&fork.fields("recover_funding_5",200,0,n,0,0,ESCROW,5,0));step(&mut chain,&mut fork,&spec,r,&out,"active-abort-user-refund-fork",vm).await?;
 fork.run(200,A,"claim",&[V])?;fork.run(200,0,"claim",&[V])?;
 let fork_fees=fork.val(V,"fee_used",0)as u128+fork.val(V,"treasury_return_fee",0)as u128+fork.val(V,"exit_spent",0)as u128;
 ensure!(native==super::minimum_stream_full_ups::native_total(&fork)?+fork_fees&&total==[asset_total(&fork,A)?,asset_total(&fork,B)?],"alternative abort/refund conservation");
 fs::write(format!("{out}/amm-ACTIVE-REPORT.json"),serde_json::to_vec_pretty(&json!({"vmOnly":vm,"fullUpsVerified":!vm,"positiveVaultUps":9,"ordinaryClaimUps":0,"sourcePages":2,"sourceAccounts":snapshot.fields[8],"orders":1,"completeOriginalSet":true,"originalOwnerAbsentAfterBootstrap":true,"auxiliaryCoverageAndRefund":true,"expiredUnappliedGrantRejectedWithoutWrites":true,"renewalRequiresSponsorAuthorization":true,"secondNativeFundingPayment":false,"originalScopeUnchanged":true,"earlyPublicReturnDenied":true,"returnAfterProtocolMinimumCapExhaustion":true,"mainHistoryVaultUps":7,"alternativeHistoryVaultUps":2,"claimScope":"VM prerequisites only in this active-source cohort","actualTrades":0,"feesAccountedSeparately":true,"mainFees":main_fees.to_string(),"forkFees":fork_fees.to_string(),"assetConservation":true,"financialOperations":0,"measurements":chain.measurements}))?)?;Ok(())
}

#[tokio::test]
#[ignore="three bounded synthetic UPSs; explicit original owner approval before early exit"]
async fn original_owner_can_explicitly_retire_a_live_fee_grant()->Result<()>{
 let out=std::env::var("FEE_OWNER_PERMIT_OUT")?;fs::create_dir(&out)?;let vm=std::env::var("FEE_EXIT_VM_ONLY").as_deref()==Ok("1");
 let mut w=World::new_fixture("amm",false,false)?;w.set(OWNER,0,0,100*ESCROW);
 let total=[asset_total(&w,A)?,asset_total(&w,B)?];let native=super::minimum_stream_full_ups::native_total(&w)?;
 let mut c=StreamChain::new_with_maintenance(&w,true).await?;c.base.keep_history=true;let key=super::funded_bootstrap_full_ups::registered(&c);
 let signature=PsyBasicZKSignatureCircuit::<C,2>::new();let private=Q(HashOut{elements:[f(OWNER),f(20261101),GF::ZERO,GF::ONE]});let wallet=SimplePsyPrivateKey::new(private);
 c.base.actor_keys.insert(OWNER,wallet.get_public_key_for_fingerprint::<PoseidonHash>(signature.get_fingerprint()));
 w.run(OWNER,M,"authorize_fee_budget",&[vec![V,1,100*ESCROW],key.to_vec()].concat())?;w.run(OWNER,0,"transfer",&[V,10*ESCROW])?;w.fee(I)?;w.pay(I,A,1)?;w.pay(I,B,1)?;
 let db=c.base.seed_identity_with_history(&w,c.key.g.get_fingerprint(),&[(1,anchor_leaf())]).await?;let h=snapshot_header(db,&w,&c.review,c.key.g.get_fingerprint()).await?;c.source=SourcePage::inactive_maintenance(&c.review,&h)?.0;let(_,page)=SourcePage::inactive_maintenance(&c.review,&c.source)?;
 let mut r=bind(basic(14,&page,&w),key,0);r.fields[21..25].copy_from_slice(&[1,100*ESCROW,1,I]);
 if vm{let r=minimum_exact_fee(&w,&c.spec,r)?;execute(&mut w,&c.spec,&r)?;w.checkpoint+=1;}else{c.prove(&mut w,r,&out,"permit-bootstrap").await?;}
 let mut ret=bind(basic(16,&page,&w),key,0);ret.fields[21]=w.val(V,"treasury_credit",0)-ret.fields[73];
 let original=w.slots.clone();ensure!(execute(&mut w,&c.spec,&ret).is_err()&&w.slots==original,"live service cannot be publicly retired");
 for(actor,nonce,identity)in[(I,1,key),(OWNER,2,key),(OWNER,1,[0;4])]{let before=w.slots.clone();ensure!(w.run(actor,M,"authorize_treasury_exit",&[vec![V,nonce],identity.to_vec()].concat()).is_err()&&w.slots==before,"only exact original owner grant/key can authorize retirement");}
 let approval=[vec![V,1],key.to_vec()].concat();let call=json!({"contract_id":M,"method_name":"authorize_treasury_exit","inputs":approval});
 let ordinary_fee=if vm{w.run(OWNER,M,"authorize_treasury_exit",&[vec![V,1],key.to_vec()].concat())?;0}else{super::funded_lifecycle_full_ups::ordinary(&mut c,&mut w,&signature,private,OWNER,vec![call],&out,"amm-ordinary-owner-exit-approval").await?};
 if vm{let r=minimum_exact_fee(&w,&c.spec,ret)?;execute(&mut w,&c.spec,&r)?;}else{c.prove(&mut w,ret,&out,"permit-owner-return").await?;}
 ensure!(w.val(V,"treasury_credit",0)==0&&w.val(V,"fee_cap",0)==100*ESCROW&&w.val(V,"fee_used",0)<2*ESCROW,"explicit retirement neither resets nor fabricates service spending");
 w.run(OWNER,0,"claim",&[V])?;let fees=w.val(V,"fee_used",0)as u128+w.val(V,"treasury_return_fee",0)as u128+ordinary_fee as u128;
 ensure!(native==super::minimum_stream_full_ups::native_total(&w)?+fees&&total==[asset_total(&w,A)?,asset_total(&w,B)?],"explicit owner exit conservation");
 fs::write(format!("{out}/amm-PERMIT-REPORT.json"),serde_json::to_vec_pretty(&json!({"vmOnly":vm,"fullUpsVerified":!vm,"earlyPublicRetirementRejected":true,"onlyOriginalOwnerGrantAndKey":true,"ordinaryOwnerApprovalUps":!vm,"vaultUps":2,"serviceCapNotReset":true,"assetConservation":true,"ordinaryOwnerClaimScope":"VM only; public outbox accounting remains separate","ordinaryFee":ordinary_fee,"measurements":c.measurements,"financialOperations":0}))?)?;Ok(())
}
