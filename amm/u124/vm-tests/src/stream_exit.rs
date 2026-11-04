//! Independent, explicitly funded exit fees. No auxiliary credit can buy assets.
use anyhow::{ensure,Context,Result};
use serde_json::{json,Value};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},iop::target::{BoolTarget,Target},plonk::circuit_builder::CircuitBuilder};
use crate::{batch_policy::{chosen,eq},market_key::SDKeyCircuitGadget,stream_policy::{invoke,Request}};
pub const GRANT:u64=15;
pub const OWNER_RETURN:u64=16;
pub const SPONSOR_RETURN:u64=17;
pub const NFT_BOOTSTRAP_PROFILE:&str="source-covered-nft-account-bootstrap-exit-v1";
pub fn nft_account_bootstrap(s:&Value)->bool{s["version"]==21}
pub fn paired_exit(s:&Value)->bool{s["version"]==19||nft_account_bootstrap(s)}
pub fn paired(s:&Value)->bool{s["version"]==15||paired_exit(s)}
pub fn paired_profile(s:&Value)->&'static str{
 if nft_account_bootstrap(s){NFT_BOOTSTRAP_PROFILE}else if s["version"]==19{"source-covered-pair-authorized-exit-v1"}else{"source-covered-pair-funded-bootstrap-v1"}
}
pub fn enabled(s:&Value)->bool{s["version"]==18||paired_exit(s)}
pub fn validate(s:&Value)->Result<()>{
 if nft_account_bootstrap(s){
  ensure!(cfg!(feature="sdk-audit-v1") && s["profile"]==NFT_BOOTSTRAP_PROFILE && s["market"]=="nftmarket"
   && s["collection_initialization"]=="explicit-account-version-v1"
   && s["base"]["sdk_commit"]==crate::sdk_release::SDK_COMMIT
   && s["base"]["client_commit"]==crate::sdk_release::CLIENT_COMMIT,"exact reviewed deferred NFT profile");
  let market=s["market_id"].as_u64().context("NFT market")?;
  let token=s["base"]["config"]["tokenId"].as_u64().context("NFT payment asset")?;
  let collection=s["base"]["config"]["nftId"].as_u64().context("NFT collection")?;
  let mut expected=vec![s["noop"].clone(),json!({"contract_id":0,"method_id":3824212239u32,"method_name":"claim","inputs":[{"witness":1}]}),
   json!({"contract_id":collection,"method_id":1475740684u32,"method_name":"prepare_account","inputs":[]}),
   json!({"contract_id":token,"method_id":2792756730u32,"method_name":"claim","inputs":[{"witness":1}]}),
   json!({"contract_id":market,"method_id":3068320913u32,"method_name":"activate","inputs":[{"witness":1}]}),
   json!({"contract_id":token,"method_id":188091294u32,"method_name":"transfer","inputs":[{"witness":1},{"constant":"1"},{"constant":"0"}]})];
  while expected.len()<9{expected.push(s["noop"].clone());}
  let operations=s["base"]["operations"].as_array().context("NFT operations")?;
  let index=operations.iter().position(|v|v["name"]=="activate").context("NFT activation")?;
  ensure!(operations[index]["maintenance"]==true && operations[index]["calls"]==json!(expected)
   && s["base"]["branches"][2+index]["calls"]==json!(expected),"exact NFT activation with account preparation");
 }
 ensure!(s["exit_policy"]==json!({"native_transfer":{"contract_id":0,"method_name":"transfer","method_id":2789897329u32,"input_count":2},"auxiliary_fee_field":74,"only_original_credit_returns":true,"owner_return_fee_separate_from_service_cap":true,"owner_return_authority":"exhausted-or-explicit-owner-v1","maximum_grant_window":4096}),"exact exit policy");
 for(name,count)in[("authorize_treasury_exit",6),("authorize_exit_fees",8),("apply_exit_grant",8),("account_exit_fee",7),("return_treasury",7),("account_return_fee",5),("return_exit_credit",8)]{
  let m=&s["stream"][name];ensure!(m["contract_id"]==s["market_id"]&&m["method_name"]==name&&m["input_count"]==count&&m["method_id"].as_u64().is_some_and(|x|x<=u32::MAX as u64),"reviewed exit method");
 }Ok(())
}
fn safe_maintenance(name:&str)->bool{name.starts_with("recover_funding")||name=="recover_nft"||name=="ack_delivery"}
fn refund(name:&str)->bool{name.starts_with("refund_funding")||name.starts_with("batch_refund_")}
pub fn check(s:&Value,r:&Request)->Result<()>{
 if !enabled(s){return Ok(());}
 let f=&r.fields;ensure!(f.len()==80&&f[74]<1<<24,"exit payer range");
 if f[74]!=0 {
  ensure!([4,6,8,9,GRANT,OWNER_RETURN,SPONSOR_RETURN].contains(&f[0]),"exit credit cannot open, trade or reorder");
  if f[0]==4{ensure!(s["base"]["operations"].as_array().unwrap().iter().any(|o|o["branch"]==f[21]&&o["maintenance"]==true&&safe_maintenance(o["name"].as_str().unwrap())),"exit-only maintenance");}
  if f[0]==8{ensure!(f[2]>0&&f[2]<=if paired_exit(s){2}else{4},"bounded exit refund page");for i in 0..f[2]as usize{ensure!(s["base"]["operations"].as_array().unwrap().iter().any(|o|o["branch"]==f[21+13*i]&&o["maintenance"]==false&&refund(o["name"].as_str().unwrap())),"exit credit cannot settle trades");}}
 }
 if f[0]==GRANT{ensure!(f[74]==f[21]&&f[74]!=0,"grant pays only its original sponsor");}
 if f[0]==SPONSOR_RETURN{ensure!(f[74]!=0,"explicit return fee payer");}
 Ok(())
}
pub struct Gates{pub grant:BoolTarget,pub owner:BoolTarget,pub sponsor:BoolTarget,pub auxiliary:BoolTarget}
impl Gates{
 pub fn new(b:&mut CircuitBuilder<F,2>,f:&[Target])->Self{let z=b.zero();let primary=b.is_equal(f[74],z);Self{grant:chosen(b,f[0],GRANT),owner:chosen(b,f[0],OWNER_RETURN),sponsor:chosen(b,f[0],SPONSOR_RETURN),auxiliary:b.not(primary)}}
 pub fn bind(&self,b:&mut CircuitBuilder<F,2>,g:&SDKeyCircuitGadget,s:&Value,f:&[Target],maintenance:BoolTarget,cover:BoolTarget,settle:BoolTarget,abort:BoolTarget)->Result<()>{
  let z=b.zero();let one=b.one();let key=g.session_context.start_user_leaf.public_key;
  b.range_check(f[74],24);
  let mut allowed=b._false();for gate in [maintenance,cover,settle,abort,self.grant,self.owner,self.sponsor]{allowed=b.or(allowed,gate);}
  eq(b,self.auxiliary,allowed.target,one);
  let mut safe=b._false();for op in s["base"]["operations"].as_array().unwrap(){if op["maintenance"]==true&&safe_maintenance(op["name"].as_str().unwrap()){let selected=chosen(b,f[21],op["branch"].as_u64().unwrap());safe=b.or(safe,selected);}}
  let gate=b.and(self.auxiliary,maintenance);eq(b,gate,safe.target,one);
  for i in 0..4{let pos=b.constant(F::from_canonical_u64(i));let exists=crate::stream_source::lt(b,pos,f[2],3);let active=b.and(settle,exists);let active=b.and(active,self.auxiliary);let mut legal=b._false();
   for op in s["base"]["operations"].as_array().unwrap(){if op["maintenance"]==false&&refund(op["name"].as_str().unwrap()){let yes=chosen(b,f[21+13*i as usize],op["branch"].as_u64().unwrap());legal=b.or(legal,yes);}}
   eq(b,active,legal.target,one);
  }
  eq(b,self.grant,f[74],f[21]);eq(b,self.grant,self.auxiliary.target,one);eq(b,self.sponsor,self.auxiliary.target,one);
  let owner=b.constant(F::from_canonical_u64(s["fee_owner"].as_u64().unwrap()));
  let role=|name:&str|&s["stream"][name];
  invoke(b,self.grant,g,0,role("apply_exit_grant"),&[f[21..25].to_vec(),key.elements.to_vec()].concat())?;
  let claim=json!({"contract_id":0,"method_name":"claim","method_id":3824212239u32,"input_count":1});invoke(b,self.grant,g,1,&claim,&[f[21]])?;
  invoke(b,self.owner,g,0,role("return_treasury"),&[vec![f[21],f[73],f[74]],key.elements.to_vec()].concat())?;
  invoke(b,self.owner,g,1,&s["exit_policy"]["native_transfer"],&[owner,f[21]])?;
  invoke(b,self.sponsor,g,0,role("return_exit_credit"),&[vec![f[21],f[22],f[73],f[74]],key.elements.to_vec()].concat())?;
  invoke(b,self.sponsor,g,1,&s["exit_policy"]["native_transfer"],&[f[21],f[22]])?;
  for gate in [self.grant,self.owner,self.sponsor]{for i in 2..38{invoke(b,gate,g,i,&s["noop"],&[])?;}}
  for i in 1..80 {if [73,74].contains(&i){continue;}if !(21..25).contains(&i){eq(b,self.grant,f[i],z);}if i!=21{eq(b,self.owner,f[i],z);}if ![21,22].contains(&i){eq(b,self.sponsor,f[i],z);}}
  let no_aux=b.not(self.auxiliary);let normal=b.not(self.owner);let primary=b.and(no_aux,normal);
  invoke(b,primary,g,38,role("account_executor_fee"),&[vec![f[73]],key.elements.to_vec()].concat())?;
  let returning=b.and(self.owner,no_aux);invoke(b,returning,g,38,role("account_return_fee"),&[vec![f[73]],key.elements.to_vec()].concat())?;
  let same=b.is_equal(f[74],f[21]);let returning=b.and(self.sponsor,same);
  invoke(b,self.auxiliary,g,38,role("account_exit_fee"),&[vec![f[74],f[73],returning.target],key.elements.to_vec()].concat())?;
  Ok(())
 }
}
pub fn calls(s:&Value,r:&Request,out:&mut[Value])->Result<()>{
 if !enabled(s){return Ok(());}check(s,r)?;let f=&r.fields;let key=r.registered_key.context("exit key")?;
 let m=|name:&str,args:Vec<u64>|json!({"contract_id":s["market_id"],"method_name":name,"inputs":args});
 match f[0]{GRANT=>{out[0]=m("apply_exit_grant",[f[21..25].to_vec(),key.to_vec()].concat());out[1]=json!({"contract_id":0,"method_name":"claim","inputs":[f[21]]});},OWNER_RETURN=>{out[0]=m("return_treasury",[vec![f[21],f[73],f[74]],key.to_vec()].concat());out[1]=json!({"contract_id":0,"method_name":"transfer","inputs":[s["fee_owner"],f[21]]});},SPONSOR_RETURN=>{out[0]=m("return_exit_credit",[vec![f[21],f[22],f[73],f[74]],key.to_vec()].concat());out[1]=json!({"contract_id":0,"method_name":"transfer","inputs":[f[21],f[22]]});},_=>{}}
 out[38]=if f[74]!=0{m("account_exit_fee",[vec![f[74],f[73],u64::from(f[0]==SPONSOR_RETURN&&f[74]==f[21])],key.to_vec()].concat())}else if f[0]==OWNER_RETURN{m("account_return_fee",[vec![f[73]],key.to_vec()].concat())}else{m("account_executor_fee",[vec![f[73]],key.to_vec()].concat())};Ok(())
}
