//! Actual base-AMM bytecode fixture transitions, NOT market UPS proofs or
//! coordinator inclusion. Controller UPS tests authenticate these explicit
//! synthetic checkpoint states and must retain that boundary in their report.
use anyhow::{ensure,Result};use serde_json::Value;use num_bigint::BigUint;use num_traits::ToPrimitive;
use super::world::{World,A,B,F,pair};
pub const LP:u64=500;pub const SPONSOR:u64=600;pub const MARKETS:[(u64,u64);2]=[(1000,300),(1001,400)];
fn policy(m:u64)->Result<Value>{let mut p:Value=serde_json::from_slice(&std::fs::read(format!("{}/base-policy.json",std::env::var("COMPOSITION_BUILD")?))?)?;
 fn replace(v:&mut Value,m:u64){match v{Value::Object(o)=>{if o.get("contract_id").and_then(Value::as_u64)==Some(1000){o.insert("contract_id".into(),m.into());}for v in o.values_mut(){replace(v,m);}},Value::Array(a)=>for v in a{replace(v,m)},_=>{}}}
 replace(&mut p,m);p["market_id"]=m.into();Ok(p)
}
pub fn at(w:&World,u:u64,m:u64,name:&str,index:u64)->u64{let f=w.artifacts[&m]["abi"]["contract"]["state"].as_array().unwrap().iter().find(|f|f["name"]==name).unwrap();w.get(u,m,f["offset"].as_u64().unwrap()+index)}
fn wide(w:&World,u:u64,m:u64,name:&str)->u128{at(w,u,m,name,0)as u128+super::world::R*at(w,u,m,name,1)as u128}
fn fields(p:&Value,name:&str,payer:u64,peer:u64,x:u128,y:u128,z:u128,nonce:u64)->Vec<u64>{
 let op=p["operations"].as_array().unwrap().iter().find(|o|o["name"]==name).unwrap();let mut f=vec![op["branch"].as_u64().unwrap(),payer,peer];f.extend(pair(x));f.extend(pair(y));f.extend(pair(z));f.extend([if name.starts_with("refund_funding_"){F}else{0},nonce,0,0]);
 let mut used=std::collections::BTreeSet::from([0]);for c in op["calls"].as_array().unwrap(){for a in c["inputs"].as_array().unwrap(){if let Some(i)=a["witness"].as_u64(){used.insert(i as usize);}}}for(i,n)in f.iter_mut().enumerate(){if !used.contains(&i){*n=0;}}f
}
fn execute(w:&mut World,vault:u64,p:&Value,f:&[u64])->Result<()>{let mut next=w.clone();for c in psy_template_u124_markets::batch_compact::calls(p,f)?{let inputs=c["inputs"].as_array().unwrap().iter().map(|v|v.as_u64().unwrap()).collect::<Vec<_>>();next.run(vault,c["contract_id"].as_u64().unwrap(),c["method_name"].as_str().unwrap(),&inputs)?;}*w=next;Ok(())}
fn operation(w:&mut World,m:u64,vault:u64,p:&Value,name:&str,payer:u64,peer:u64,x:u128,y:u128,z:u128,nonce:u64)->Result<()>{let mut f=vec![0;74];f[0]=4;f[21..34].copy_from_slice(&fields(p,name,payer,peer,x,y,z,nonce));f[73]=F;execute(w,vault,p,&f)?;let _=m;Ok(())}
fn sponsor(w:&mut World,m:u64,vault:u64,purpose:u64)->Result<()>{let amount=if purpose==1{2*F}else{F};w.run(SPONSOR,m,"authorize_sponsor",&[vault,amount,at(w,SPONSOR,m,"sponsor_nonce",0)+1,purpose])?;w.run(SPONSOR,0,"simple_transfer",&[vault,amount])}
pub fn start(w:&mut World,m:u64,vault:u64)->Result<(u64,u64)>{let p=policy(m)?;let epoch=at(w,vault,m,"queue_epoch",0)+1;let cutoff=w.checkpoint+2;sponsor(w,m,vault,2)?;operation(w,m,vault,&p,"start_epoch",SPONSOR,epoch,cutoff as u128,0,0,0)?;Ok((epoch,cutoff))}
pub fn admit_seal(w:&mut World,m:u64,vault:u64,user:u64,nonce:u64,epoch:u64,cutoff:u64)->Result<()>{let p=policy(m)?;sponsor(w,m,vault,2)?;operation(w,m,vault,&p,"admit_entry",SPONSOR,user,nonce as u128,0,0,0)?;w.checkpoint=cutoff+1;sponsor(w,m,vault,2)?;operation(w,m,vault,&p,"seal_epoch",SPONSOR,epoch,0,0,0,0)}
fn settle(w:&mut World,m:u64,vault:u64,user:u64,nonce:u64,name:&str,x:u128,y:u128,z:u128)->Result<()>{let p=policy(m)?;sponsor(w,m,vault,1)?;let mut f=vec![0;74];f[0]=1;f[1]=at(w,vault,m,"batch_id",0)+1;f[2]=1;f[3]=w.checkpoint+20;f[4]=SPONSOR;f[5]=user;f[9]=nonce;f[73]=F;execute(w,vault,&p,&f)?;
 let mut s=vec![0;74];s[0]=2;s[1]=at(w,vault,m,"batch_id",0);for i in 0..4{s[13+i]=at(w,vault,m,"batch_root",i as u64);}s[21..34].copy_from_slice(&fields(&p,name,user,0,x,y,z,nonce));s[73]=F;execute(w,vault,&p,&s)
}
pub fn pools(w:&mut World)->Result<()>{w.load_markets()?;w.set(5,0,0,1000*F);w.set(LP,0,0,1000*F);w.set(SPONSOR,0,0,1000*F);let reserve=20*10u128.pow(18);
 for asset in [A,B]{let mut input=vec![LP];input.extend(pair(2*reserve));w.run(5,asset,"transfer",&input)?;w.run(LP,asset,"claim",&[5])?;}
 for (m,vault)in MARKETS{
  w.run(5,0,"simple_transfer",&[vault,F])?;for asset in[A,B]{w.run(5,asset,"transfer",&[vault,1,0])?;}let p=policy(m)?;operation(w,m,vault,&p,"activate_batch_vault",5,0,0,0,0,0)?;
  let mut input=vec![vault];input.extend(pair(reserve));input.extend(pair(reserve));input.extend(pair(reserve-1000));input.extend([500,1]);w.run(LP,m,"open_add",&input)?;w.run(LP,0,"simple_transfer",&[vault,F])?;for asset in[A,B]{let mut a=vec![vault];a.extend(pair(reserve));w.run(LP,asset,"transfer",&a)?;}
  let(epoch,cutoff)=start(w,m,vault)?;w.run(LP,m,"request_admission",&[epoch,cutoff])?;admit_seal(w,m,vault,LP,1,epoch,cutoff)?;settle(w,m,vault,LP,1,"add_liquidity",reserve,reserve,reserve-1000)?;w.run(LP,m,"close_add",&[])?;
  ensure!(wide(w,vault,m,"reserve_a")==reserve&&wide(w,vault,m,"reserve_b")==reserve,"VM pool initialization");w.checkpoint+=1;
 }
 Ok(())
}
pub fn swap(w:&mut World,hop:usize,input:u128)->Result<u128>{let(m,vault)=MARKETS[hop-1];let a=wide(w,vault,m,"reserve_a");let b=wide(w,vault,m,"reserve_b");let(ri,ro)=if hop==1{(a,b)}else{(b,a)};let output=((BigUint::from(input)*9970u64*BigUint::from(ro))/(BigUint::from(ri)*10000u64+BigUint::from(input)*9970u64)).to_u128().unwrap();
 settle(w,m,vault,super::world::V,1,if hop==1{"swap_0"}else{"swap_1"},input,output,0)?;ensure!(at(w,vault,m,"consumed",super::world::V)==1,"VM market consumed exact order");Ok(output)
}
pub fn refund(w:&mut World,hop:usize,input:u128)->Result<()>{let(m,vault)=MARKETS[hop-1];settle(w,m,vault,super::world::V,1,if hop==1{"refund_funding_5"}else{"refund_funding_6"},if hop==1{input}else{0},if hop==1{0}else{input},0)?;ensure!(at(w,vault,m,"consumed",super::world::V)==1,"VM refund consumed exact order");Ok(())}
