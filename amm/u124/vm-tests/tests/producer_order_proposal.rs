//! Public rank proposals only. No signature, UPS, RPC or financial acceptance.
use anyhow::Result;
use psy_template_u124_markets::checkpoint_processor::{producer_order_proposal,rank};
use serde_json::{json,Value};

#[test]
fn producer_public_proposal_matches_constrained_rank_and_rejects_mutations()->Result<()>{
    let root=std::env::var("PREVIOUS_FIXTURES")?;
    for market in ["amm","bondingcurve"]{
        let policy:Value=serde_json::from_slice(&std::fs::read(format!("{root}/{market}/policy.json"))?)?;
        for count in 2..=4{
            let owners:[u64;4]=std::array::from_fn(|i|if i<count{200+i as u64}else{0});
            let nonces:[u64;4]=std::array::from_fn(|i|u64::from(i<count));
            let input=json!({"batch":"1","checkpoint":"101","root":["1","2","3","4"],"seed":["11","22","33","44"],"owners":owners.map(|n|n.to_string()),"nonces":nonces.map(|n|n.to_string()),"count":count});
            let expected=rank(policy["market_id"].as_u64().unwrap(),1,[1,2,3,4],[11,22,33,44],101,owners,nonces,count)?;
            assert_eq!(producer_order_proposal(&policy,&input)?,expected);
            for key in ["batch","checkpoint"]{
                for value in [json!("01"),json!("+1"),json!(" 1"),json!("-1"),json!(1),json!("18446744073709551616")]{
                    let mut bad=input.clone();bad[key]=value;assert!(producer_order_proposal(&policy,&bad).is_err());
                }
            }
            let mut bad=input.clone();bad["operatorSeed"]=json!("override");assert!(producer_order_proposal(&policy,&bad).is_err());
            let mut bad=input.clone();bad["count"]=json!(1);assert!(producer_order_proposal(&policy,&bad).is_err());
            let mut bad=input.clone();bad["seed"][0]=json!("18446744069414584321");assert!(producer_order_proposal(&policy,&bad).is_err());
            let mut bad=input.clone();bad["owners"][1]=bad["owners"][0].clone();assert!(producer_order_proposal(&policy,&bad).is_err());
            if count<4{let mut bad=input.clone();bad["nonces"][3]=json!("1");assert!(producer_order_proposal(&policy,&bad).is_err());}
            for (key,value) in [("version",json!(3)),("qualified_randomness",json!(true)),("execution_profile",json!("unbiased")),("tx_count",json!(39))]{
                let mut bad=policy.clone();bad[key]=value;assert!(producer_order_proposal(&bad,&input).is_err());
            }
            let mut bad=policy.clone();bad["reward"]["inputs"][0]["constant"]=json!("999");assert!(producer_order_proposal(&bad,&input).is_err());
        }
    }
    Ok(())
}
