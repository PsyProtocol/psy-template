//! Candidate claims-first whole-stack key. No qualified randomness or live release.
use anyhow::{ensure,Context,Result};
use serde_json::{Value,json};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},iop::target::{Target,BoolTarget},plonk::{circuit_builder::CircuitBuilder,circuit_data::CircuitConfig}};
use psy_common_circuit::u32::multiple_comparison::list_lte_circuit;
use crate::{batch_policy::{bind,eq,zero,chosen},market_key::{SDKeyCircuitGadget,MarketKeyConfig}};
pub const WIDTH:usize=80;
pub const PREVIOUS_TAG:u64=0x5053424f54;
pub fn previous(spec:&Value)->bool{spec["version"]==4}
const FEE:u64=1_000_100_000;
pub fn completion_fee(modified_slots:u32,phase_word_modified:bool,native_balance_word_modified:bool,reward_word_modified:bool)->Result<u64>{
 ensure!(phase_word_modified&&native_balance_word_modified,"processor fee prefix must already modify phase and native balance");
 // User fees equal reward plus burn. Only native balance changes in packed
 // word zero, so the final burn restores that word to its starting value.
 // Endcap charges net final changes, not the pre-burn convenience estimate.
 let slots=(modified_slots as u64).checked_sub(1).context("native balance word missing from fee prefix")?+u64::from(!reward_word_modified);
 let fee=psy_config::network_constants::GUTA_FEE+psy_config::DA_FEE*slots;
 ensure!((1_000_000_000..=FEE).contains(&fee),"processor fee exceeds frozen budget");Ok(fee)
}
fn allowed(market:&str)->&'static[&'static str]{match market{"amm"=>&["swap_0","swap_1","refund_swap_0","refund_swap_1","add_liquidity","remove_liquidity","refund_add","cancel_remove"],"bondingcurve"=>&["settle_buy","settle_sell","settle_limit_buy_change","settle_limit_buy_exact","settle_limit_sell","refund_buy","refund_sell"],_=>&[]}}
pub fn validate(spec:&Value)->Result<()>{
 ensure!(spec["tx_count"]==40&&spec["witness_length"]==WIDTH,"processor shape");
 if previous(spec){ensure!(spec["execution_profile"]=="previous-checkpoint-seeded-v1"&&spec["source_model"]=="native-producer-seeded-v1"&&spec["producer_influence"]==true&&spec["qualified_randomness"]==false&&spec.get("live_authorization").is_none(),"explicit producer-seeded profile");}else{ensure!(spec["version"]==3&&spec["live_authorization"]==false&&spec["source_model"]=="checkpoint-producer-controlled-candidate-v1","offline candidate profile");}
 crate::batch_compact::validate(&spec["base"])?;
 ensure!(spec["native_protocol"]=="mainnet-beta-20261027"&&spec["native_protocol"]==spec["base"]["native_protocol"],"frozen native processor protocol");
 for key in ["market","market_id","config","operations","commit","noop","burn","expire"]{ensure!(spec[key]==spec["base"][key],"processor base identity {key}");}
 let market=spec["market"].as_str().context("market")?;ensure!(!allowed(market).is_empty(),"AMM/Curve processor only");
 let cid=spec["market_id"].as_u64().context("market id")?;let receiver=spec["config"]["rewardReceiver"].as_u64().context("fixed fee receiver")?;
 ensure!(receiver>0&&receiver<1<<24,"fee recipient bound");
 let w=|i|json!({"witness":i});
 let begin=std::iter::once(w(1)).chain((13..17).map(w)).chain(std::iter::once(w(3))).chain((74..78).map(w)).chain((17..21).map(w)).chain(std::iter::once(w(2))).collect::<Vec<_>>();
 for(key,name,arity,inputs)in[("begin","begin_checkpoint_batch",15,begin),("gather","claim_batch_member",2,vec![w(1),w(10)]),("finish","finish_checkpoint_batch",3,vec![w(1),w(73),w(79)])]{
  let c=&spec[key];ensure!(c["contract_id"]==cid&&c["method_name"]==name&&c["method_id"].as_u64().is_some_and(|n|n<=u32::MAX as u64)&&c["inputs"]==json!(inputs)&&c["inputs"].as_array().unwrap().len()==arity,"processor method role {key}");
  ensure!(c["method_id"]!=spec["noop"]["method_id"],"processor role cannot alias noop");
 }
 for(key,asset)in[("claim_a","assetA"),("claim_b","assetB")]{let c=&spec[key];ensure!(c["contract_id"]==spec["config"][asset]&&c["method_name"]=="claim"&&c["method_id"].as_u64().is_some_and(|n|n<=u32::MAX as u64)&&c["inputs"]==json!([w(1)]),"processor asset claim role");}
 ensure!(spec["fee"]==json!({"contract_id":0,"method_id":3824212239u32,"method_name":"claim","inputs":[w(1)]}),"processor fee role");
 ensure!(spec["reward"]==json!({"contract_id":0,"method_id":2789897329u32,"method_name":"transfer","inputs":[{"constant":receiver.to_string()},w(79)]}),"processor fixed reward role");
 let ops=spec["operations"].as_array().unwrap();let selected=ops.iter().filter(|o|allowed(market).contains(&o["name"].as_str().unwrap_or(""))).collect::<Vec<_>>();
 ensure!(selected.len()==allowed(market).len(),"complete supported processor operations");
 ensure!(spec["settlement_branches"]==json!(selected.iter().map(|o|o["branch"].as_u64().unwrap()).collect::<Vec<_>>()),"processor branch set");
 ensure!(spec["outputs"].as_object().context("outputs")?.len()==selected.len(),"exact output mapping");
 ensure!(spec["claim_masks"].as_object().context("claim masks")?.len()==selected.len(),"exact asset claim mapping");
 for op in selected{ensure!(op["maintenance"]==false,"no maintenance in settlement");let list=op["calls"].as_array().unwrap().iter().filter(|c|c["method_name"]=="transfer"&&(c["contract_id"]==spec["config"]["assetA"]||c["contract_id"]==spec["config"]["assetB"])).cloned().collect::<Vec<_>>();ensure!(list.len()<=2&&spec["outputs"][op["branch"].to_string()]==json!(list),"exact asset outputs");let mask=op["calls"].as_array().unwrap().iter().filter(|c|c["method_name"]=="claim").fold(0u64,|m,c|m|if c["contract_id"]==spec["config"]["assetA"]{1}else if c["contract_id"]==spec["config"]["assetB"]{2}else{0});ensure!(spec["claim_masks"][op["branch"].to_string()]==mask,"exact funded-asset claim mask");}
 Ok(())
}
fn used(op:&Value)->std::collections::BTreeSet<usize>{std::iter::once(0).chain(op["calls"].as_array().unwrap().iter().flat_map(|c|c["inputs"].as_array().unwrap()).filter_map(|a|a["witness"].as_u64().map(|n|n as usize))).collect()}
pub fn expected_calls(spec:&Value,f:&[u64])->Result<Vec<Value>>{
 validate(spec)?;ensure!(f.len()==WIDTH,"processor witness width");
 for(i,v)in f.iter().enumerate(){ensure!(*v<if(13..17).contains(&i)||(74..78).contains(&i){18446744069414584321}else{1<<62},"canonical processor field");}
 let tag=if previous(spec){PREVIOUS_TAG}else{0};ensure!(f[78]==tag,"processor profile domain");
 if f[0]!=2{ensure!(f[74..].iter().enumerate().all(|(i,n)|*n==if i==4{tag}else{0}),"unused processor fields");return crate::batch_policy::expected_calls(&spec["base"],&f[..74]);}
 ensure!(f[1]>0&&(2..=4).contains(&f[2])&&f[3]>0&&f[3]<1<<32&&f[4..13].iter().all(|v|*v==0) ,"processor header");
 ensure!((1_000_000_000..=FEE).contains(&f[73])&&f[73]%1000==0&&f[79]+f[73]==f[2]*FEE,"processor fee conservation");
 let count=f[2]as usize;let mut seen=std::collections::BTreeSet::new();for(i,r)in f[17..21].iter().enumerate(){ensure!(*r<4&&seen.insert(*r)&&if i<count{(*r as usize)<count}else{*r==i as u64},"processor permutation");}
 let ops=spec["operations"].as_array().unwrap();let mut last=0;
 for row in 0..4{let v=&f[21+13*row..34+13*row];if row>=count{ensure!(v.iter().all(|n|*n==0),"inactive processor row");continue;}
  ensure!(spec["settlement_branches"].as_array().unwrap().contains(&json!(v[0]))&&v[1]>last&&v[1]<1<<24&&v[10]>0,"canonical active processor row");last=v[1];let op=&ops[v[0]as usize-1];let used=used(op);for(i,n)in v.iter().enumerate(){ensure!(used.contains(&i)||*n==0,"unused processor operation field");}
 }
 let convert=|c:&Value,v:&[u64]|->Result<Value>{Ok(json!({"contract_id":c["contract_id"],"method_name":c["method_name"],"inputs":c["inputs"].as_array().unwrap().iter().map(|a|if let Some(i)=a["witness"].as_u64(){Ok(v[i as usize])}else{Ok(a["constant"].as_str().context("constant")?.parse::<u64>()?)}).collect::<Result<Vec<_>>>()?}))};
 let nop=convert(&spec["noop"],f)?;let mut out=vec![convert(&spec["begin"],f)?];
 for row in 0..4{if row>=count{out.extend(vec![nop.clone();3]);continue;}let v=&f[21+13*row..34+13*row];let mask=spec["claim_masks"][v[0].to_string()].as_u64().unwrap();out.push(convert(&spec["gather"],v)?);for(key,bit)in[("claim_a",1),("claim_b",2)]{out.push(if mask&bit!=0{convert(&spec[key],v)?}else{nop.clone()});}}
 for pos in 0..4{if pos>=count{out.extend(vec![nop.clone();3]);continue;}let row=f[17+pos]as usize;let v=&f[21+13*row..34+13*row];let op=&ops[v[0]as usize-1];out.push(convert(&op["calls"][0],v)?);let outputs=spec["outputs"][v[0].to_string()].as_array().unwrap();for i in 0..2{out.push(if let Some(c)=outputs.get(i){convert(c,v)?}else{nop.clone()});}}
 for row in 0..4{out.push(if row<count{convert(&spec["fee"],&f[21+13*row..34+13*row])?}else{nop.clone()});}
 out.push(convert(&spec["finish"],f)?);out.push(convert(&spec["reward"],f)?);while out.len()<39{out.push(nop.clone());}out.push(convert(&spec["burn"],f)?);ensure!(out.len()==40,"processor stack capacity");Ok(out)
}
pub fn build(spec:&Value)->Result<SDKeyCircuitGadget>{
 validate(spec)?;let mut b=CircuitBuilder::<F,2>::new(CircuitConfig::standard_recursion_config());
 let cfg=MarketKeyConfig{num_introspectable_transactions:40,can_read_state:false,contract_state_tree_height:psy_config::network_constants::MAX_CONTRACT_STATE_TREE_HEIGHT,requires_secp256k1:false,num_secp256k1_slots:0};
 let mut g=crate::batch_compact::add_virtual_with_width(&mut b,&cfg,spec,WIDTH)?;let f=g.circuit_inputs.clone();let slots=&g.tx_introspection.tx_info_slots;
 for(i,t)in f.iter().enumerate(){if !(13..17).contains(&i)&&!(74..78).contains(&i){b.range_check(*t,62);}}
 let modes:Vec<_>=(1..=4).map(|n|chosen(&mut b,f[0],n)).collect();let mut valid=b._false();for m in &modes{valid=b.or(valid,*m);}b.assert_one(valid.target);
 if previous(spec){let tag=b.constant(F::from_canonical_u64(PREVIOUS_TAG));b.connect(f[78],tag);eq(&mut b,modes[1],g.checkpoint_id,f[3]);}
 for(mi,gate)in modes.iter().enumerate(){let mut used:std::collections::BTreeSet<usize>=match mi{0=>(0..13).collect(),1=>[0,1,2,3,13,14,15,16,17,18,19,20,74,75,76,77,79].into_iter().collect(),2=>[0,1].into_iter().collect(),_=>[0].into_iter().collect()};if previous(spec){used.insert(78);}for i in (0..21).chain(74..80){if !used.contains(&i){zero(&mut b,*gate,f[i]);}}}
 for(mi,key)in[(0,"commit"),(2,"expire")]{let list=if mi==0{spec[key].as_array().unwrap().clone()}else{vec![spec[key].clone()]};for i in 0..39{bind(&mut b,modes[mi],&slots[i],list.get(i).unwrap_or(&spec["noop"]),&f)?;}}
 let one=b.one();let zero_t=b.zero();let ops=spec["operations"].as_array().unwrap();
 for row in 0..4{let v=&f[21+13*row..34+13*row];let mut maintenance_valid=b._false();
  for op in ops{if op["maintenance"]!=true||row!=0{continue;}let selected=chosen(&mut b,v[0],op["branch"].as_u64().unwrap());maintenance_valid=b.or(maintenance_valid,selected);let gate=b.and(modes[3],selected);let used=used(op);for(i,t)in v.iter().enumerate(){if !used.contains(&i){zero(&mut b,gate,*t);}}for(i,c)in op["calls"].as_array().unwrap().iter().enumerate(){bind(&mut b,gate,&slots[i],c,v)?;}}
  if row==0{eq(&mut b,modes[3],maintenance_valid.target,one);}
  let inactive=if row==0{b.or(modes[0],modes[2])}else{let gate=b.or(modes[0],modes[2]);b.or(gate,modes[3])};for t in v{zero(&mut b,inactive,*t);}
 }for slot in &slots[9..39]{bind(&mut b,modes[3],slot,&spec["noop"],&f)?;}
 let counts:Vec<_>=(1..=4).map(|n|chosen(&mut b,f[2],n)).collect();let mut count_valid=b._false();for c in &counts[1..]{count_valid=b.or(count_valid,*c);}eq(&mut b,modes[1],count_valid.target,one);
 b.range_check(f[3],32);let mut active=Vec::new();
 for row in 0..4{let mut exists=b._false();for c in &counts[row..]{exists=b.or(exists,*c);}active.push(exists);let v=&f[21+13*row..34+13*row];let gate=b.and(modes[1],exists);let no=b.not(exists);let padding=b.and(modes[1],no);for t in v{zero(&mut b,padding,*t);}
  b.range_check(v[1],24);let previous=if row==0{zero_t}else{f[21+13*(row-1)+1]};let le=list_lte_circuit(&mut b,vec![previous],vec![v[1]],24);eq(&mut b,gate,le.target,one);let same=b.is_equal(previous,v[1]);eq(&mut b,gate,same.target,zero_t);let nonce_empty=b.is_equal(v[10],zero_t);eq(&mut b,gate,nonce_empty.target,zero_t);
  let mut supported=b._false();for id in spec["settlement_branches"].as_array().unwrap(){let op=&ops[id.as_u64().unwrap()as usize-1];let selected=chosen(&mut b,v[0],id.as_u64().unwrap());supported=b.or(supported,selected);let selected=b.and(gate,selected);let used=used(op);for(i,t)in v.iter().enumerate(){if !used.contains(&i){zero(&mut b,selected,*t);}}}eq(&mut b,gate,supported.target,one);
  bind(&mut b,gate,&slots[1+3*row],&spec["gather"],v)?;for j in 0..3{bind(&mut b,padding,&slots[1+3*row+j],&spec["noop"],&f)?;}
  for id in spec["settlement_branches"].as_array().unwrap(){let selected=chosen(&mut b,v[0],id.as_u64().unwrap());let selected=b.and(gate,selected);let mask=spec["claim_masks"][id.to_string()].as_u64().unwrap();for(j,key,bit)in[(1,"claim_a",1),(2,"claim_b",2)]{bind(&mut b,selected,&slots[1+3*row+j],if mask&bit!=0{&spec[key]}else{&spec["noop"]},v)?;}}
  bind(&mut b,gate,&slots[25+row],&spec["fee"],v)?;bind(&mut b,padding,&slots[25+row],&spec["noop"],&f)?;
 }
 bind(&mut b,modes[1],&slots[0],&spec["begin"],&f)?;
 for pos in 0..4{let rank=f[17+pos];b.range_check(rank,2);for old in &f[17..17+pos]{let same=b.is_equal(rank,*old);eq(&mut b,modes[1],same.target,zero_t);}let gate=b.and(modes[1],active[pos]);let no=b.not(active[pos]);let padding=b.and(modes[1],no);let idx=b.constant(F::from_canonical_u64(pos as u64));eq(&mut b,padding,rank,idx);
  let le=list_lte_circuit(&mut b,vec![rank],vec![f[2]],3);eq(&mut b,gate,le.target,one);let same=b.is_equal(rank,f[2]);eq(&mut b,gate,same.target,zero_t);
  for j in 0..3{bind(&mut b,padding,&slots[13+3*pos+j],&spec["noop"],&f)?;}
  for row in 0..4{let selected=chosen(&mut b,rank,row as u64);let selected=b.and(gate,selected);let v=&f[21+13*row..34+13*row];for id in spec["settlement_branches"].as_array().unwrap(){let op=&ops[id.as_u64().unwrap()as usize-1];let branch=chosen(&mut b,v[0],id.as_u64().unwrap());let selected=b.and(selected,branch);bind(&mut b,selected,&slots[13+3*pos],&op["calls"][0],v)?;let outputs=spec["outputs"][id.to_string()].as_array().unwrap();for j in 0..2{bind(&mut b,selected,&slots[14+3*pos+j],outputs.get(j).unwrap_or(&spec["noop"]),v)?;}}}
 }
 bind(&mut b,modes[1],&slots[29],&spec["finish"],&f)?;bind(&mut b,modes[1],&slots[30],&spec["reward"],&f)?;for slot in &slots[31..39]{bind(&mut b,modes[1],slot,&spec["noop"],&f)?;}
 let reward=b.add(f[79],f[73]);let fees=b.mul_const(F::from_canonical_u64(FEE),f[2]);eq(&mut b,modes[1],reward,fees);
 let always=b._true();bind(&mut b,always,&slots[39],&spec["burn"],&f)?;let mut valid_fee=b._false();for n in 0..=100{let value=chosen(&mut b,f[73],1_000_000_000+1000*n);valid_fee=b.or(valid_fee,value);}b.assert_one(valid_fee.target);
 g.build_circuit(b)?;Ok(g)
}
