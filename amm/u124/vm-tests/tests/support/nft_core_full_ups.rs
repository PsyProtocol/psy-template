//! Opt-in selected NFT lifecycle, actual bytecode and complete synthetic UPSs.
//! No RPC, signing with a real wallet, network receipt or browser acceptance.
use super::*;
#[path="../../src/core_scope.rs"] mod core_scope;

fn read(w:&World,u:u64,c:u64,o:u64)->Result<u64>{Ok(w.state.get_contract_slot(u,c,o)?)}
fn amount(w:&World,u:u64,c:u64,o:u64)->Result<u128>{Ok(read(w,u,c,o)?as u128+super::super::R*read(w,u,c,o+1)?as u128)}
fn owners(w:&World)->BTreeSet<u64>{w.slots.keys().map(|(u,_,_)|*u).chain([V]).collect()}
fn totals(w:&World)->Result<(u128,u128,u128)>{
 let ids=owners(w);let(mut ft,mut nft,mut native)=(0u128,0u128,0u128);
 for u in &ids{
  ft+=amount(w,*u,A,0)?;nft+=read(w,*u,NFT,0)?as u128;native+=read(w,*u,0,0)?as u128;
  for peer in &ids{
   let sent=amount(w,*u,A,33554453+4*peer)?;let claimed=amount(w,*peer,A,33554455+4*u)?;
   ensure!(sent>=claimed,"FT cursor conservation");ft+=sent-claimed;
   let sent=read(w,*u,NFT,1182+35*peer+32)?;let claimed=read(w,*peer,NFT,1182+35*u+33)?;
   ensure!(sent>=claimed,"NFT cursor conservation");nft+=(sent-claimed)as u128;
   let sent=read(w,*u,0,3+2*peer)?;let claimed=read(w,*peer,0,4+2*u)?;
   ensure!(sent>=claimed,"Native cursor conservation");native+=(sent-claimed)as u128;
  }
 }
 Ok((ft,nft,native))
}
fn conservation(w:&World,initial:(u128,u128,u128),burns:u128)->Result<()>{
 let now=totals(w)?;ensure!(now.0==initial.0&&now.1==initial.1&&now.2+burns==initial.2,"FT/NFT/Native including Outbox and actual burns conserved");Ok(())
}
fn payload(w:&World,u:u64)->Result<Vec<u64>>{(0..8).map(|j|read(w,u,NFT,if j<4{30+j}else{31+j})).collect()}
fn commit(w:&mut World,users:&[u64])->Result<Vec<u64>>{
 w.run(S,M,"authorize_sponsor",&[V,2*ESCROW,w.val(S,"sponsor_nonce",0)+1,1])?;
 w.run(S,0,"transfer",&[V,2*ESCROW])?;
 let mut fields=vec![0;74];fields[0]=1;fields[1]=w.val(V,"batch_id",0)+1;
 fields[2]=users.len()as u64;fields[3]=w.checkpoint+20;fields[4]=S;fields[73]=ESCROW;
 for(i,u)in users.iter().enumerate(){fields[5+i]=*u;fields[9+i]=w.val(*u,"nonce",0);}Ok(fields)
}
async fn prove(chain:&mut Chain,w:&mut World,fields:Vec<u64>,burns:&mut u128)->Result<()>{
 chain.prove(w,fields).await?;*burns+=chain.measurements.last().context("UPS measurement")?["burn"].as_u64().context("actual burn")?as u128;Ok(())
}
async fn ordinary(w:&mut World,user:u64,calls:Vec<Value>,out:&str,label:&str,rows:&mut Vec<Value>,burns:&mut u128)->Result<()>{
 let row=ordinary_wallet::prove_ordinary_calls(w,user,&calls,out,label,"core-nft-ordinary",Instant::now()).await?;
 // The helper checks all actual caller writes against this bytecode execution.
 // Actor identity/nonce are ephemeral synthetic fixtures per proof, not a
 // linked browser-wallet history. The report preserves that limitation.
 for call in &calls{
  let args=call["inputs"].as_array().context("ordinary inputs")?.iter().map(|v|v.as_u64().context("ordinary input")).collect::<Result<Vec<_>>>()?;
  w.run(user,call["contract_id"].as_u64().context("ordinary contract")?,call["method_name"].as_str().context("ordinary method")?,&args)?;
 }
 let fee=row["actualFee"].as_u64().context("ordinary actual fee")?;
 w.run(user,0,"burn",&[fee])?;*burns+=fee as u128;w.checkpoint+=1;rows.push(row);Ok(())
}
fn call(c:u64,name:&str,inputs:Vec<u64>)->Value{json!({"contract_id":c,"method_name":name,"inputs":inputs})}

#[tokio::test]
#[ignore="fresh selected core NFT artifacts, compact key, fixed verifier and output required; full proving"]
async fn prepared_core_nft_activation_sale_expiry_refund_and_ordinary_claims()->Result<()>{
 ensure!(cfg!(feature="sdk-audit-v1"),"frozen release feature required");
 ensure!(std::env::var("BATCH_PROOF_PROFILE").as_deref()==Ok("compact-v1"),"new prepared compact key required");
 ensure!(std::env::var("BATCH_ADMISSION_TEST").as_deref()!=Ok("1"),"no admission/global source path");
 ensure!(std::env::var("BATCH_MINIMAL_GENESIS").as_deref()!=Ok("1"),"explicit bounded six-actor genesis fixture");
 let out=std::env::var("NFT_CORE_FULL_UPS_OUT")?;
 ensure!(std::env::var("BATCH_FULL_UPS_OUT").as_deref()==Ok(out.as_str()),"exact UPS requests share the fresh evidence directory");
 fs::create_dir(&out)?;
 ensure!(A!=B&&B!=NFT&&B!=M,"unused synthetic token B has its own contract namespace entry");
 let mut w=World::new_with_bootstrap("nftmarket",false)?;
 ensure!(w.policy["market"]=="nftmarket"&&core_scope::anchor(&w.policy)?.is_some(),"actual selected prepared core policy required");
 ensure!(w.policy["config"]["nftId"]==NFT&&w.policy["config"]["tokenId"]==A&&w.policy["market_id"]==M,"exact bytecode fixture identities");
 ensure!(w.revision==0&&!w.slots.keys().any(|(u,_,_)|*u==V),"registered vault must begin without injected account state");
 ensure!(read(&w,I,NFT,0)?>0,"activation payer is a real collection holder");
 for user in [201,203]{ensure!(!w.slots.keys().any(|(u,c,_)|*u==user&&*c==NFT),"buyer collection root absent before explicit preparation");}
 let initial=totals(&w)?;let mut burns=0u128;let mut ordinary_rows=vec![];
 let price=(1u128<<70)+17;
 w.fee(I)?;w.pay(I,A,1)?;
 let activation=w.request(4,vec![w.fields("activate",I,0,0,0,0,0,0,0)],[0;4]);
 // Retain only function circuits used by the planned lifecycle. Every method
 // still contributes to its actual code/function root in Chain::new.
 let mut needed=batch_policy::expected_calls(&w.policy,&activation)?;
 let mut prefix=vec![0;74];prefix[0]=1;prefix[73]=ESCROW;needed.extend(batch_policy::expected_calls(&w.policy,&prefix)?);
 let operations=vec![w.fields("settle_sale",200,201,price,0,0,0,1,1),
  w.fields("refund_funding_5",203,0,price,0,0,ESCROW,1,0),w.fields("refund_funding_12",202,0,0,0,0,ESCROW,1,0)];
 needed.extend(batch_policy::expected_calls(&w.policy,&w.request(2,operations,[0;4]))?);
 needed.extend(batch_policy::expected_calls(&w.policy,&w.request(3,vec![],[0;4]))?);
 let mut chain=Chain::new(&w,&needed)?;
 prove(&mut chain,&mut w,activation.clone(),&mut burns).await?;
 ensure!(chain.measurements.last().unwrap()["firstUpsRegistration"]==true&&w.val(V,"batch_ready",0)==1&&read(&w,V,NFT,603980958)?==1,"empty registered vault activation and prepared collection state");
 ensure!(w.balance(V,A)==0&&read(&w,V,NFT,0)?==0,"activation seed returned without NFT mint");
 let before=w.slots.clone();ensure!(w.execute(&activation).is_err()&&w.slots==before,"activation replay rejected atomically");
 conservation(&w,initial,burns)?;
 let issuer_before=w.balance(I,A);
 ensure!(amount(&w,V,A,33554453+4*I)?-amount(&w,I,A,33554455+4*V)?==1,"exact activation seed pending for original issuer");
 ordinary(&mut w,I,vec![call(A,"claim",vec![V])],&out,"core-nft-issuer-seed-claim",&mut ordinary_rows,&mut burns).await?;
 ensure!(w.balance(I,A)==issuer_before+1&&amount(&w,V,A,33554453+4*I)?==amount(&w,I,A,33554455+4*V)?,"ordinary issuer receives exact seed and clears activation Outbox");
 conservation(&w,initial,burns)?;

 let sold_payload=payload(&w,200)?;
 w.run(200,NFT,"acknowledge",&[V])?;
 w.run(200,M,"open_listing",&args(&[V,0],&[price],&[200,1]))?;w.fee(200)?;w.run(200,NFT,"transfer",&[0,V])?;
 for user in [201,203]{
  let calls=vec![call(NFT,"prepare_account",vec![]),call(M,"open_buy",args(&[V,200,1],&[price],&[200,1])),
   call(0,"transfer",vec![V,ESCROW]),call(A,"transfer",args(&[V],&[price],&[]))];
  ordinary(&mut w,user,calls,&out,&format!("core-nft-buyer-{user}"),&mut ordinary_rows,&mut burns).await?;
  ensure!(read(&w,user,NFT,603980958)?==1&&read(&w,user,NFT,0)?==0,"ordinary zero-NFT buyer preparation");
 }
 conservation(&w,initial,burns)?;
 let frozen=commit(&mut w,&[200,201,203])?;prove(&mut chain,&mut w,frozen,&mut burns).await?;
 let before=w.slots.clone();let wrong=w.fields("settle_sale",200,203,price,0,0,0,1,1);
 ensure!(w.settle(vec![wrong],[0;4]).is_err()&&w.slots==before,"later buyer cannot win");
 let sale=w.fields("settle_sale",200,201,price,0,0,0,1,1);let refund=w.fields("refund_funding_5",203,0,price,0,0,ESCROW,1,0);
 let settlement=w.request(2,vec![sale,refund],[0;4]);prove(&mut chain,&mut w,settlement.clone(),&mut burns).await?;
 ensure!(w.val(V,"batch_phase",0)==3&&[200,201,203].iter().all(|u|w.val(V,"consumed",*u)==1),"one winner and loser terminal refund");
 let before=w.slots.clone();ensure!(w.execute(&settlement).is_err()&&w.slots==before,"settlement cannot consume orders twice");
 ensure!(read(&w,201,NFT,0)?==0&&read(&w,V,NFT,1182+35*201+32)?>read(&w,201,NFT,1182+35*V+33)?,"sale NFT is Outbox before ordinary claim");
 ordinary(&mut w,201,vec![call(NFT,"claim",vec![0,V])],&out,"core-nft-winner-claim",&mut ordinary_rows,&mut burns).await?;
 ensure!(payload(&w,201)?==sold_payload&&read(&w,201,NFT,0)?==1,"ordinary winner receives exact sold token and metadata");
 ordinary(&mut w,200,vec![call(A,"claim",vec![V]),call(0,"claim",vec![V])],&out,"core-nft-seller-claim",&mut ordinary_rows,&mut burns).await?;
 let loser_before=w.balance(203,A);
 ordinary(&mut w,203,vec![call(A,"claim",vec![V]),call(0,"claim",vec![V])],&out,"core-nft-loser-claim",&mut ordinary_rows,&mut burns).await?;
 ensure!(w.balance(203,A)==loser_before+price,"loser receives actual payment refund");
 conservation(&w,initial,burns)?;

 // New accepted batch: seal, cancel, wait through expiry, expire and refreeze.
 // No market-wide source coverage or rerandomization is claimed.
 w.run(203,M,"close_buy",&[])?;let returned_payload=payload(&w,202)?;let deadline=w.checkpoint+64;
 w.run(202,NFT,"acknowledge",&[V])?;w.run(202,M,"open_listing",&args(&[V,0],&[price],&[deadline,1]))?;
 w.fee(202)?;w.run(202,NFT,"transfer",&[0,V])?;
 let calls=vec![call(NFT,"prepare_account",vec![]),call(M,"open_buy",args(&[V,202,1],&[price],&[deadline,2])),
  call(0,"transfer",vec![V,ESCROW]),call(A,"transfer",args(&[V],&[price],&[]))];
 ordinary(&mut w,203,calls,&out,"core-nft-second-buy",&mut ordinary_rows,&mut burns).await?;
 let frozen=commit(&mut w,&[202,203])?;prove(&mut chain,&mut w,frozen,&mut burns).await?;
 let before=w.slots.clone();ensure!(w.execute(&w.request(3,vec![],[0;4])).is_err()&&w.slots==before,"premature expiry preserves state");
 w.run(202,M,"request_cancel",&[])?;w.run(203,M,"request_cancel",&[])?;
 w.checkpoint=w.val(V,"batch_expiry",0)+1;
 let expiry=w.request(3,vec![],[0;4]);prove(&mut chain,&mut w,expiry,&mut burns).await?;
 ensure!(w.val(V,"batch_phase",0)==4&&w.val(V,"consumed",202)==0&&w.val(V,"consumed",203)==1,"expiry leaves original orders unconsumed");
 let refreeze=commit(&mut w,&[202,203])?;prove(&mut chain,&mut w,refreeze,&mut burns).await?;
 let listing=w.fields("refund_funding_12",202,0,0,0,0,ESCROW,1,0);
 let buyer=w.fields("refund_funding_5",203,0,price,0,0,ESCROW,2,0);
 let refunds=w.request(2,vec![listing,buyer],[0;4]);prove(&mut chain,&mut w,refunds,&mut burns).await?;
 ensure!(w.val(V,"batch_phase",0)==3&&w.val(V,"consumed",202)==1&&w.val(V,"consumed",203)==2,"refrozen cancellations terminate as refunds");
 ordinary(&mut w,202,vec![call(NFT,"claim",vec![0,V]),call(0,"claim",vec![V])],&out,"core-nft-listing-refund-claim",&mut ordinary_rows,&mut burns).await?;
 ensure!(payload(&w,202)?==returned_payload&&read(&w,202,NFT,0)?==1,"original NFT and metadata returned");
 let before=w.balance(203,A);
 ordinary(&mut w,203,vec![call(A,"claim",vec![V]),call(0,"claim",vec![V])],&out,"core-nft-expired-buy-refund-claim",&mut ordinary_rows,&mut burns).await?;
 ensure!(w.balance(203,A)==before+price,"expired buyer receives actual input");conservation(&w,initial,burns)?;
 for user in [200,201,202,203]{
  ensure!(amount(&w,V,A,33554453+4*user)?==amount(&w,user,A,33554455+4*V)?,"no remaining FT payout");
  ensure!(read(&w,V,NFT,1182+35*user+32)?==read(&w,user,NFT,1182+35*V+33)?,"no remaining NFT payout");
 }
 ensure!(ordinary_rows.len()==9&&chain.measurements.iter().filter(|row|row["fullUpsVerified"]==true).count()==7,"exact predeclared sixteen-UPS offline budget");
 let report=json!({"schema":1,"market":"nftmarket","executionScope":"explicit-selected-orders-v1",
  "keyFingerprint":chain.key.get_fingerprint().to_string(),"marketCodeRoot":chain.leaves[&M].code_root.to_string(),
  "identities":{"market":M,"vault":V,"issuer":I,"paymentToken":A,"collection":NFT,"unusedFixtureTokenB":B},
  "plannedVaultUps":7,"plannedOrdinaryUps":9,"plannedTotalUps":16,
  "fullUpsVerified":true,"emptyRegisteredVault":true,"activationReplayRejected":true,"ordinaryBuyerPreparation":true,
  "ordinaryIssuerActivationSeedClaim":true,"activationSeedOutboxCleared":true,
  "nativeResidualConserved":true,"nativeResidualWithdrawalsTested":false,"vaultNativeResidual":read(&w,V,0,0)?.to_string(),
  "fills":1,"loserRefunds":1,"expiredListingRefunds":1,"expiredBuyerRefunds":1,"prematureExpiryRejected":true,
  "uniqueWinner":true,"terminalReplayRejected":true,"actualOutboxOrdinaryClaims":true,"assetConservation":true,
  "actualNativeBurn":burns.to_string(),"vaultMeasurements":chain.measurements,"ordinaryMeasurements":ordinary_rows,
  "ordinarySignerHistoryLinked":false,"globalMarketCompleteness":false,"qualifiedRandomness":false,
  "scope":"Actual new core bytecode and complete compact/ordinary UPSs at synthetic authenticated checkpoints. Vault endpoints link. Ordinary claims consume the proven market Outbox; each ordinary proof uses a fresh ephemeral synthetic signer, not a linked wallet identity history. Issuer, listing, sponsorship, cancellation prerequisites are VM-only. Native residuals and unused sponsorship remain conserved, but their withdrawal/fee exit is not tested. No deployment, RPC, browser approval, receipt or network acceptance.","broadcast":false});
 let path=format!("{out}/NFT_CORE_REPORT.json");let mut file=fs::OpenOptions::new().write(true).create_new(true).open(path)?;
 use std::io::Write;file.write_all(&serde_json::to_vec_pretty(&report)?)?;file.sync_all()?;Ok(())
}
