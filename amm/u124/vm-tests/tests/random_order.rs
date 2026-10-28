//! Component tests only. No certified seed, market/key bytecode, UPS or RPC.
use anyhow::{ensure,Result};
use plonky2::{field::{goldilocks_field::GoldilocksField as F,types::{Field,Field64,PrimeField64}},iop::witness::{PartialWitness,WitnessWrite},plonk::{circuit_builder::CircuitBuilder,circuit_data::CircuitConfig,config::PoseidonGoldilocksConfig as C}};
use psy_template_u124_markets::random_order::{validate_fields,frozen_root,order_keys,permutation,total_before,constrain_canonical_limbs,PermutationCircuit,FIELDS};
use std::{fs,time::Instant};
fn example()->[u64;FIELDS]{
 let mut v=[0;FIELDS];v[..14].copy_from_slice(&[1,psy_config::PSY_NETWORK_MAGIC,1,1000,100,1,100,110,120,3,150,160,2000200000,4]);
 for i in 0..9{v[14+4*i]=(i+1)as u64;}
 for i in 0..4{let s=50+6*i;v[s]=200+i as u64;v[s+1]=if i==2{(1<<62)-1}else{i as u64+1};v[s+2]=i as u64+10;}v
}
#[test]fn full_statement_scopes_and_canonical_boundaries()->Result<()>{
 let v=example();let root=frozen_root(&v)?;
 for index in [3,4,5,6,7,8,9,10,11,12,14,18,22,26,30,34,38,42,46,52,58,64,70]{let mut x=v;x[index]+=1;ensure!(frozen_root(&x)?!=root,"scope substitution {index}");}
 for i in [0,1,2,13]{let mut x=v;x[i]=9;ensure!(validate_fields(&x).is_err(),"invalid version/network/market/count");}
 let mut x=v;x[18]=F::ORDER-1;validate_fields(&x)?;x[18]=F::ORDER;ensure!(validate_fields(&x).is_err(),"noncanonical field");
 for count in 1..=4{let mut x=v;x[13]=count;x[50+6*count as usize..].fill(0);validate_fields(&x)?;let rank=permutation(&x,[11,22,33,44])?;for i in count as usize..4{ensure!(rank[i]==i as u64,"canonical inactive rank");}}
 for (index,value)in [(50,100),(56,200),(51,1<<62),(7,120),(8,110),(10,120),(11,150)]{let mut x=v;x[index]=value;ensure!(validate_fields(&x).is_err(),"invalid member/schedule");}
 Ok(())
}
#[test]
#[ignore="bounded component proof budget and fresh output required"]
fn bounded_permutation_and_tie_proofs()->Result<()>{
 let out=std::env::var("RANDOM_ORDER_COMPONENT_OUT")?;fs::create_dir(&out)?;let begin=Instant::now();
 let c=PermutationCircuit::build();let build=begin.elapsed().as_secs_f64();let input:serde_json::Value=serde_json::from_slice(&fs::read(std::env::var("RANDOM_ORDER_COMPONENT_INPUT")?)?)?;
 let v:[u64;FIELDS]=input["fields"].as_array().ok_or_else(||anyhow::anyhow!("client fields"))?.iter().map(|n|Ok(n.as_str().ok_or_else(||anyhow::anyhow!("client canonical string"))?.parse::<u64>()?)).collect::<Result<Vec<_>>>()?.try_into().map_err(|_|anyhow::anyhow!("client width"))?;
 ensure!(v==example(),"exact JS-to-Rust statement fixture");
 let seed=[11,22,33,44];ensure!(input["seed"]==serde_json::json!(["11","22","33","44"]),"client seed fixture");let rank=permutation(&v,seed)?;
 let start=Instant::now();let proof=c.prove(v,seed,rank)?;let prove=start.elapsed().as_secs_f64();let start=Instant::now();c.verify_for(v,seed,proof.clone())?;let verify=start.elapsed().as_secs_f64();
 let mut rejected=vec![];
 for (label,index)in [("chain",18),("source",14),("draw",8),("round",9),("cutoff",6),("queue",42),("batch",46),("order-terms",52)]{let mut x=v;x[index]+=1;ensure!(c.verify_for(x,seed,proof.clone()).is_err(),"accepted substituted {label}");rejected.push(label);}
 ensure!(c.verify_for(v,[11,22,33,45],proof.clone()).is_err(),"selected another seed");rejected.push("different-seed");
 // These deliberately invalid witnesses go through the actual circuit prover,
 // not a host permutation predicate. Contradictory connected targets may panic.
 let mut wrong=rank;wrong.swap(0,1);
 for (label,values,proposed)in [("wrong-rank",v,wrong),("duplicate-rank",v,[rank[0];4])]{let r=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||c.prove(values,seed,proposed)));ensure!(!matches!(r,Ok(Ok(_))),"circuit accepted {label}");rejected.push(label);}
 let mut duplicate=v;duplicate[56]=duplicate[50];let r=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||c.prove(duplicate,seed,rank)));ensure!(!matches!(r,Ok(Ok(_))),"duplicate member witness accepted");rejected.push("duplicate-member");
 // Test the actual bound with an otherwise valid alternative decomposition
 // of field zero: low=1, high=0xffffffff reconstructs p == 0 in the field.
 let mut bad=CircuitBuilder::<F,2>::new(CircuitConfig::standard_recursion_config());
 let low=bad.add_virtual_target();let high=bad.add_virtual_target();let reconstructed=bad.mul_const_add(F::from_canonical_u64(1<<32),high,low);let zero=bad.zero();bad.connect(reconstructed,zero);constrain_canonical_limbs(&mut bad,[low,high]);let bad=bad.build::<C>();
 let mut pw=PartialWitness::new();pw.set_target(low,F::ONE)?;pw.set_target(high,F::from_canonical_u64(0xffffffff))?;
 let r=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||bad.prove(pw)));ensure!(!matches!(r,Ok(Ok(_))),"noncanonical zero decomposition accepted");rejected.push("noncanonical-zero-decomposition");
 // Full hash collision is not assumed constructible. Prove the reusable total
 // comparator directly with equal keys, high canonical limbs and nonce boundary.
 let mut b=CircuitBuilder::<F,2>::new(CircuitConfig::standard_recursion_config());let a=b.add_virtual_targets(6);let z=b.add_virtual_targets(6);let before=total_before(&mut b,a.clone().try_into().unwrap(),z.clone().try_into().unwrap());b.assert_one(before.target);b.register_public_inputs(&a);b.register_public_inputs(&z);let tie=b.build::<C>();
 let mut pw=PartialWitness::new();let left=[F::ORDER-1,0,1,2,200,(1<<62)-1];let right=[F::ORDER-1,0,1,2,201,1];for(t,n)in a.iter().zip(left).chain(z.iter().zip(right)){pw.set_target(*t,F::from_canonical_u64(n))?;}
 let tie_proof=tie.prove(pw)?;ensure!(tie_proof.public_inputs.iter().map(|n|n.to_canonical_u64()).collect::<Vec<_>>()==left.into_iter().chain(right).collect::<Vec<_>>(),"tie public endpoints");tie.verify(tie_proof.clone())?;
 let report=serde_json::json!({"schema":1,"scope":"standalone permutation and total-comparator circuits only; synthetic seed; not a market/key/UPS or certified randomness","exactClientStatementConsumed":true,"frozenRoot":frozen_root(&v)?.map(|n|n.to_string()),"keys":order_keys(&v,seed)?.map(|h|h.map(|n|n.to_string())),"rank":rank,"publicInputs":proof.public_inputs.iter().map(|n|n.to_canonical_u64().to_string()).collect::<Vec<_>>(),"buildSeconds":build,"proveSeconds":prove,"verifySeconds":verify,"degreeBits":c.data.common.degree_bits(),"rejected":rejected,"tieComparatorProofVerified":true,"qualifiedSource":false,"sealInclusionVerified":false,"fullUpsVerified":false,"financialOperations":0,"broadcast":false});
 for(name,bytes)in[("permutation-proof.bin",bincode::serialize(&proof)?),("tie-proof.bin",bincode::serialize(&tie_proof)?),("REPORT.json",serde_json::to_vec_pretty(&report)?) ]{fs::write(format!("{out}/{name}"),bytes)?;}Ok(())
}
