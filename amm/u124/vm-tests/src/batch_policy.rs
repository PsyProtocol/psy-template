//! V2 whole-stack authorization: four bounded nine-call operation blocks plus
//! begin/finish, canonical padding, and the automatic final native burn.
use anyhow::{ensure,Context,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::Field},hash::poseidon::PoseidonHash,iop::target::{Target,BoolTarget},plonk::{circuit_builder::CircuitBuilder,circuit_data::CircuitConfig}};
use crate::market_key::MarketKeyConfig as SDKeyConfig;
use psy_config::network_constants::{DEFAULT_CALLER_CONTRACT_ID_U64,MAX_CONTRACT_STATE_TREE_HEIGHT};
use psy_common_circuit::builder::hash::core::CircuitBuilderHashCore;
use crate::market_key::{SDKeyCircuitGadget,SDKeyTransactionInfoTargets};
use serde_json::{Value,json};
pub const COUNT:usize=40;pub const WIDTH:usize=74;
fn eq(b:&mut CircuitBuilder<F,2>,gate:BoolTarget,a:Target,v:Target){let x=b.sub(a,v);let x=b.mul(x,gate.target);let z=b.zero();b.connect(x,z);}
fn zero(b:&mut CircuitBuilder<F,2>,gate:BoolTarget,t:Target){let z=b.zero();eq(b,gate,t,z);}
fn chosen(b:&mut CircuitBuilder<F,2>,t:Target,n:u64)->BoolTarget{let k=b.constant(F::from_canonical_u64(n));b.is_equal(t,k)}
fn bind(b:&mut CircuitBuilder<F,2>,gate:BoolTarget,slot:&SDKeyTransactionInfoTargets,c:&Value,inputs:&[Target])->Result<()>{
 let cid=b.constant(F::from_canonical_u64(c["contract_id"].as_u64().context("contract")?));
 let mid=b.constant(F::from_canonical_u64(c["method_id"].as_u64().context("method")?));
 let caller=b.constant(F::from_canonical_u64(DEFAULT_CALLER_CONTRACT_ID_U64));
 let values=c["inputs"].as_array().context("inputs")?.iter().map(|v|if let Some(i)=v["witness"].as_u64(){inputs.get(i as usize).copied().context("input index")}else{Ok(b.constant(F::from_canonical_u64(v["constant"].as_str().context("constant")?.parse()?)))}).collect::<Result<Vec<_>>>()?;
 let len=b.constant(F::from_canonical_u64(values.len()as u64));let h=b.safe_hash_fixed_length::<PoseidonHash>(&values);
 for(x,y)in[(slot.contract_id,cid),(slot.method_id,mid),(slot.caller_contract_id,caller),(slot.inputs_length,len)]{eq(b,gate,x,y);}
 for(x,y)in slot.inputs_hash.elements.into_iter().zip(h.elements){eq(b,gate,x,y);}Ok(())
}
pub fn validate(spec:&Value)->Result<()>{
 ensure!(spec["version"]==2&&spec["tx_count"]==COUNT&&spec["witness_length"]==WIDTH,"batch policy shape");
 ensure!(["amm","orderbook","bondingcurve","nftmarket"].contains(&spec["market"].as_str().unwrap_or("")),"batch market");
 let ops=spec["operations"].as_array().context("operations")?;ensure!(!ops.is_empty()&&ops.len()<=32,"operation count");
 let mut calls=vec![(&spec["begin"],WIDTH),(&spec["finish"],WIDTH),(&spec["expire"],WIDTH),(&spec["noop"],WIDTH),(&spec["burn"],WIDTH)];
 let commit=spec["commit"].as_array().context("commit")?;ensure!(commit.len()==2,"commit prefix");calls.extend(commit.iter().map(|x|(x,WIDTH)));
 for(i,op)in ops.iter().enumerate(){ensure!(op["branch"].as_u64()==Some(i as u64+1)&&op["maintenance"].is_boolean(),"operation identity");let list=op["calls"].as_array().context("operation calls")?;ensure!(list.len()==9,"operation width");calls.extend(list.iter().map(|x|(x,13)));}
 for(c,bound)in calls{
  ensure!(c["contract_id"].as_u64().is_some_and(|x|x<16777216)&&c["method_id"].as_u64().is_some_and(|x|x<=u32::MAX as u64)&&c["method_name"].as_str().is_some(),"call identity");
  let args=c["inputs"].as_array().context("arguments")?;ensure!(args.len()<=128,"argument count");
  for a in args{let obj=a.as_object().context("argument descriptor")?;ensure!(obj.len()==1,"ambiguous binding");if let Some(i)=a.get("witness"){ensure!(i.as_u64().is_some_and(|x|(x as usize)<bound),"witness index");}else{let s=a["constant"].as_str().context("constant")?;ensure!(!s.is_empty()&&s.bytes().all(|c|c.is_ascii_digit())&&(s=="0"||!s.starts_with('0')),"constant encoding");ensure!(s.parse::<u64>()?<18446744069414584321,"constant field range");}}
 }Ok(())
}
pub fn build(spec:&Value)->Result<SDKeyCircuitGadget>{build_with_profile(spec,false)}
pub(crate) fn build_with_profile(spec:&Value,compact:bool)->Result<SDKeyCircuitGadget>{build_profile(spec,compact,false)}
// Separate application key; never changes the fingerprint of base market keys.
pub(crate) fn build_composition_profile(spec:&Value)->Result<SDKeyCircuitGadget>{build_profile(spec,true,true)}
fn build_profile(spec:&Value,compact:bool,composition:bool)->Result<SDKeyCircuitGadget>{validate(spec)?;
 let mut b=CircuitBuilder::<F,2>::new(CircuitConfig::standard_recursion_config());let cfg=SDKeyConfig{num_introspectable_transactions:COUNT as u32,can_read_state:false,contract_state_tree_height:MAX_CONTRACT_STATE_TREE_HEIGHT,requires_secp256k1:false,num_secp256k1_slots:0};
 let mut g=if compact {crate::batch_compact::add_virtual_to(&mut b,&cfg,spec)?}else{SDKeyCircuitGadget::add_virtual_to(&mut b,&cfg,WIDTH)};
 // Fail to compile against older SDKs whose generic key does not expose the
 // authenticated UPS session context. API presence alone is not a security
 // proof: the frozen-source checks and negative-context proofs remain required.
 let _ = &g.session_context;
 let f=g.circuit_inputs.clone();let slots=&g.tx_introspection.tx_info_slots;
 if composition {
  let maintenance=b.constant(F::from_canonical_u64(4));b.connect(f[0],maintenance);
  // Every controller charge / final refund and the actual automatic burn use
  // the same exact fee. No fee estimate can authorize a different burn.
  b.connect(f[33],f[73]);
  // Funding is the first UPS of a newly registered, empty execution account.
  // Authenticate the ENTIRE empty start state, including all asset balances
  // and claim cursors. This avoids an unsupported external read of an absent
  // contract root without weakening its zero-initialization requirement.
  let fund=chosen(&mut b,f[21],1);
  let mut empty=g.session_context.sign_context.user_leaf;
  empty.user_state_tree_root=b.constant_hash(plonky2::hash::hash_types::HashOut{elements:psy_config::DEFAULT_USER_STATE_TREE_ROOT_U64.map(F::from_canonical_u64)});
  let z=b.zero();empty.balance=z;empty.nonce=z;empty.last_checkpoint_id=z;empty.event_index=z;empty.user_id=g.user_id;
  let expected=empty.to_hash::<PoseidonHash,F,2>(&mut b);
  for (actual,wanted)in g.session_context.start_user_leaf_hash.elements.into_iter().zip(expected.elements){eq(&mut b,fund,actual,wanted);}
  let first=b.one();eq(&mut b,fund,g.session_context.nonce,first);
 }
 for(i,t)in f.iter().enumerate(){if !(13..17).contains(&i){b.range_check(*t,62);}}
 let mode:Vec<_>=(1..=4).map(|n|chosen(&mut b,f[0],n)).collect();let mut valid=b._false();for s in&mode{valid=b.or(valid,*s);}b.assert_one(valid.target);
 for(m,gate)in mode.iter().enumerate(){
  let mut used=std::collections::BTreeSet::from([0]);match m{0=>used.extend(1..13),1=>{used.insert(1);used.extend(13..17);if spec["market"]=="orderbook"{used.extend(17..21);}},2=>{used.insert(1);},_=>{}}
  for i in 0..21{if !used.contains(&i){zero(&mut b,*gate,f[i]);}}
 }
 // Fixed mode prefixes/padding; every slot is constrained in every mode.
 for (mi,key) in [(0,"commit"),(2,"expire")] {
  let calls=if key=="commit"{spec[key].as_array().unwrap().clone()}else{vec![spec[key].clone()]};
  for i in 0..COUNT-1{bind(&mut b,mode[mi],&slots[i],calls.get(i).unwrap_or(&spec["noop"]),&f)?;}
 }
 bind(&mut b,mode[1],&slots[0],&spec["begin"],&f)?;bind(&mut b,mode[1],&slots[37],&spec["finish"],&f)?;bind(&mut b,mode[1],&slots[38],&spec["noop"],&f)?;
 for i in 9..COUNT-1{bind(&mut b,mode[3],&slots[i],&spec["noop"],&f)?;}
 let ops=spec["operations"].as_array().unwrap();
 for block in 0..4{
  let start=21+13*block;let fields=&f[start..start+13];let empty=chosen(&mut b,fields[0],0);let settle_empty=b.and(mode[1],empty);
  for j in 0..9{bind(&mut b,settle_empty,&slots[1+9*block+j],&spec["noop"],&f)?;}
  for t in fields{zero(&mut b,settle_empty,*t);}
  let mut allowed=empty;
  let mut maintenance_allowed=b._false();
  for op in ops{
   let selected=chosen(&mut b,fields[0],op["branch"].as_u64().unwrap());let maintenance=op["maintenance"]==true;
   let gate=if maintenance{
    if block!=0{continue;}maintenance_allowed=b.or(maintenance_allowed,selected);b.and(mode[3],selected)
   }else{allowed=b.or(allowed,selected);b.and(mode[1],selected)};
   let calls=op["calls"].as_array().unwrap();let used:std::collections::BTreeSet<_>=std::iter::once(0).chain(calls.iter().flat_map(|c|c["inputs"].as_array().unwrap()).filter_map(|v|v["witness"].as_u64().map(|i|i as usize))).collect();
   for(i,t)in fields.iter().enumerate(){if !used.contains(&i){zero(&mut b,gate,*t);}}
   for(j,c)in calls.iter().enumerate(){bind(&mut b,gate,&slots[if maintenance{j}else{1+9*block+j}],c,fields)?;}
  }
  let one=b.one();eq(&mut b,mode[1],allowed.target,one);
  if block==0{eq(&mut b,mode[3],maintenance_allowed.target,one);}
  let inactive=if block==0{b.or(mode[0],mode[2])}else{let other=b.or(mode[0],mode[2]);b.or(other,mode[3])};for t in fields{zero(&mut b,inactive,*t);}
 }
 let always=b._true();bind(&mut b,always,&slots[COUNT-1],&spec["burn"],&f)?;
 let mut valid_fee=b._false();for n in 0..=100{let v=chosen(&mut b,f[73],1_000_000_000+1000*n);valid_fee=b.or(valid_fee,v);}b.assert_one(valid_fee.target);
 g.build_circuit(b)?;Ok(g)
}

pub fn expected_calls(spec:&Value,fields:&[u64])->Result<Vec<Value>>{validate(spec)?;ensure!(fields.len()==WIDTH,"batch witness length");
 for(i,n)in fields.iter().enumerate(){ensure!(*n<if (13..17).contains(&i){18446744069414584321}else{1u64<<62},"batch witness field range");}
 ensure!((1..=4).contains(&fields[0]),"batch mode");
 ensure!((1_000_000_000..=1_000_100_000).contains(&fields[73])&&fields[73]%1000==0,"batch burn fee");
 let mut header=std::collections::BTreeSet::from([0]);match fields[0]{1=>header.extend(1..13),2=>{header.insert(1);header.extend(13..17);if spec["market"]=="orderbook"{header.extend(17..21);}},3=>{header.insert(1);},_=>{}}
 for i in 0..21{ensure!(header.contains(&i)||fields[i]==0,"unused batch header {i}");}
 for block in 0..4{let f=&fields[21+13*block..34+13*block];let active=fields[0]==2||(fields[0]==4&&block==0);
  if !active||f[0]==0{ensure!(f.iter().all(|x|*x==0),"unused operation");ensure!(!(fields[0]==4&&block==0),"maintenance operation required");continue;}
  let op=spec["operations"].as_array().unwrap().iter().find(|o|o["branch"].as_u64()==Some(f[0])).context("operation")?;
  ensure!(op["maintenance"].as_bool()==Some(fields[0]==4),"operation not permitted in phase");
  let used:std::collections::BTreeSet<_>=std::iter::once(0).chain(op["calls"].as_array().unwrap().iter().flat_map(|c|c["inputs"].as_array().unwrap()).filter_map(|v|v["witness"].as_u64().map(|i|i as usize))).collect();
  for(i,n)in f.iter().enumerate(){ensure!(used.contains(&i)||*n==0,"unused operation field");}
 }

 let convert=|c:&Value,values:&[u64]|->Result<Value>{let inputs=c["inputs"].as_array().context("inputs")?.iter().map(|v|if let Some(i)=v["witness"].as_u64(){values.get(i as usize).copied().context("witness index")}else{Ok(v["constant"].as_str().context("constant")?.parse()?)}).collect::<Result<Vec<_>>>()?;Ok(json!({"contract_id":c["contract_id"],"method_name":c["method_name"],"inputs":inputs}))};
 let noop=convert(&spec["noop"],fields)?;let mut calls=vec![];
 match fields[0]{1=>{for c in spec["commit"].as_array().unwrap(){calls.push(convert(c,fields)?);}},2=>{calls.push(convert(&spec["begin"],fields)?);for block in 0..4{let f=&fields[21+13*block..34+13*block];if f[0]==0{calls.extend(vec![noop.clone();9]);}else{let op=spec["operations"].as_array().unwrap().iter().find(|o|o["branch"].as_u64()==Some(f[0])).context("operation")?;ensure!(op["maintenance"]==false,"maintenance in batch");for c in op["calls"].as_array().unwrap(){calls.push(convert(c,f)?);}}}calls.push(convert(&spec["finish"],fields)?);},3=>calls.push(convert(&spec["expire"],fields)?),4=>{let f=&fields[21..34];let op=spec["operations"].as_array().unwrap().iter().find(|o|o["branch"].as_u64()==Some(f[0])).context("maintenance")?;ensure!(op["maintenance"]==true,"nonmaintenance operation");for c in op["calls"].as_array().unwrap(){calls.push(convert(c,f)?);}},_=>unreachable!()}
 ensure!(calls.len()<COUNT,"batch stack overflow");while calls.len()<COUNT-1{calls.push(noop.clone());}calls.push(convert(&spec["burn"],fields)?);Ok(calls)
}
