//! Bind an ordinary wallet's actual SDK session to a reviewed public actor.
//! This is an additional approval guard, never a proof/verifier replacement.
use anyhow::{ensure, Context, Result};
use plonky2::field::{goldilocks_field::GoldilocksField as F, types::{Field, Field64, PrimeField64}};
use psy_client_common::data::qhashout::QHashOut;
use psy_client_data::{config::store_config::PsyHasher, guta::api::SubmitUserEndCapNonProofCoreInput,
    qdata::user::PsyUserLeaf, qstore::controllers::register_helpers::get_new_empty_user_leaf};
use psy_crypto::hash::traits::qhashable::QFieldHashable;
use psy_crypto::hash::merkle::core::MerkleProofCore;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ActorInput {
    user_id: u64,
    public_key_hash: String,
    start_user_leaf_hash: String,
    next_nonce: Value,
}

#[derive(Debug, Clone)]
pub struct ApprovedActor {
    user_id: u64,
    public_key_hash: QHashOut<F>,
    start_user_leaf_hash: QHashOut<F>,
    next_nonce: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionBinding {
    user_id: u64,
    public_key_hash: QHashOut<F>,
    start_user_leaf_hash: QHashOut<F>,
    next_nonce: u64,
    is_new_user: bool,
    start_context_leaf_hash: QHashOut<F>,
}

fn canonical_hash(text: &str, allow_zero: bool) -> Result<QHashOut<F>> {
    ensure!(text.len() == 64 && text.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)),
        "ordinary approval canonical hash required");
    let hash: QHashOut<F> = text.parse().context("ordinary approval hash encoding")?;
    ensure!(hash.to_string() == text && (allow_zero || hash != QHashOut::ZERO),
        "ordinary approval hash must be canonical and permitted");
    Ok(hash)
}

fn nonce(value: &Value) -> Result<u64> {
    let n = match value {
        Value::Number(number) => number.as_u64().context("ordinary approval exact integer nonce")?,
        Value::String(text) => {
            ensure!(!text.is_empty() && text.bytes().all(|c| c.is_ascii_digit())
                && (text == "0" || !text.starts_with('0')), "ordinary approval canonical decimal nonce");
            text.parse::<u64>().context("ordinary approval u64 nonce")?
        }
        _ => anyhow::bail!("ordinary approval exact integer nonce required"),
    };
    ensure!(n > 0 && n < F::ORDER, "ordinary approval nonce outside canonical field");
    Ok(n)
}

pub fn required_flag(value: Option<&str>) -> Result<bool> {
    match value { None | Some("0") => Ok(false), Some("1") => Ok(true),
        _ => anyhow::bail!("ordinary approval flag must be 0 or 1") }
}

pub fn parse(input: &Value, required: bool) -> Result<Option<ApprovedActor>> {
    let Some(value) = input.get("approvedActor") else {
        ensure!(!required, "ordinary approvedActor required");
        return Ok(None);
    };
    let actor: ActorInput = serde_json::from_value(value.clone()).context("ordinary approvedActor schema")?;
    ensure!((1..16777216).contains(&actor.user_id), "ordinary approval user range");
    Ok(Some(ApprovedActor { user_id: actor.user_id,
        public_key_hash: canonical_hash(&actor.public_key_hash, false)?,
        start_user_leaf_hash: canonical_hash(&actor.start_user_leaf_hash, true)?,
        next_nonce: nonce(&actor.next_nonce)? }))
}

impl ApprovedActor {
    /// The caller supplies fields read from the actual SDK manager/LPS, never
    /// from an RPC preview or request-selected `isNewUser` boolean.
    pub fn bind_session(&self, start: &PsyUserLeaf<F>, session_user_id: u64,
        session_nonce: u64, sdk_is_new_user: bool) -> Result<SessionBinding> {
        ensure!(session_user_id == self.user_id && start.user_id.to_canonical_u64() == self.user_id,
            "ordinary approval session user changed");
        ensure!(start.public_key == self.public_key_hash, "ordinary approval session public key changed");
        ensure!(session_nonce == self.next_nonce, "ordinary approval session nonce changed");
        let start_context_leaf_hash = start.qfhash::<PsyHasher>();
        let actual_start = if sdk_is_new_user {
            ensure!(self.next_nonce == 1 && self.start_user_leaf_hash == QHashOut::ZERO,
                "ordinary approval first UPS requires exact zero start and nonce one");
            ensure!(*start == get_new_empty_user_leaf(F::from_canonical_u64(self.user_id), self.public_key_hash),
                "ordinary approval SDK registration start leaf differs");
            QHashOut::ZERO
        } else {
            ensure!(self.start_user_leaf_hash != QHashOut::ZERO
                && start.nonce.to_canonical_u64().checked_add(1) == Some(self.next_nonce),
                "ordinary approval materialized start nonce differs");
            start_context_leaf_hash
        };
        ensure!(actual_start == self.start_user_leaf_hash, "ordinary approval session start leaf changed");
        Ok(SessionBinding { user_id: self.user_id, public_key_hash: self.public_key_hash,
            start_user_leaf_hash: actual_start, next_nonce: self.next_nonce,
            is_new_user: sdk_is_new_user, start_context_leaf_hash })
    }

    pub fn check_endpoints(&self, core: &SubmitUserEndCapNonProofCoreInput<F>, binding: &SessionBinding) -> Result<()> {
        ensure!(binding.user_id == self.user_id && binding.public_key_hash == self.public_key_hash
            && binding.start_user_leaf_hash == self.start_user_leaf_hash && binding.next_nonce == self.next_nonce,
            "ordinary approval captured session differs");
        ensure!(core.state_transition.user_id.to_canonical_u64() == self.user_id
            && core.new_user_leaf.user_id.to_canonical_u64() == self.user_id
            && core.new_user_leaf.public_key == self.public_key_hash
            && core.new_user_leaf.nonce.to_canonical_u64() == self.next_nonce
            && core.state_transition.start_user_leaf_hash == self.start_user_leaf_hash,
            "ordinary approval final endpoints differ");
        ensure!(core.state_transition.start_user_leaf_hash != QHashOut::ZERO || binding.is_new_user,
            "ordinary approval zero endpoint without SDK registration context");
        ensure!(core.state_transition.end_user_leaf_hash == core.new_user_leaf.qfhash::<PsyHasher>(),
            "ordinary approval final leaf hash differs");
        Ok(())
    }

    /// A successful explicit read, at the same checkpoint as this raw user
    /// membership proof, supplements the SDK status helper. That helper may
    /// substitute nonce one on a read error and is not sufficient on its own.
    /// Membership here is relative to the separately checked observed root;
    /// it is a freshness guard, not a finality certificate.
    pub fn check_fresh_state(&self, current: &PsyUserLeaf<F>, proof: &MerkleProofCore<QHashOut<F>>,
        user_tree_root: QHashOut<F>, binding: &SessionBinding) -> Result<()> {
        ensure!(binding.user_id == self.user_id && binding.public_key_hash == self.public_key_hash
            && binding.start_user_leaf_hash == self.start_user_leaf_hash && binding.next_nonce == self.next_nonce,
            "ordinary approval captured freshness session differs");
        ensure!(current.user_id.to_canonical_u64() == self.user_id
            && current.nonce.to_canonical_u64().checked_add(1) == Some(self.next_nonce),
            "ordinary approval successful current user/nonce read differs");
        ensure!(proof.index == self.user_id
            && proof.siblings.len() == psy_config::network_constants::GLOBAL_USER_TREE_HEIGHT as usize
            && proof.root == user_tree_root && proof.verify::<PsyHasher>(),
            "ordinary approval current raw membership differs");
        ensure!(proof.value == self.start_user_leaf_hash, "ordinary approval current raw start leaf changed");
        if binding.is_new_user {
            ensure!(proof.value == QHashOut::ZERO && self.next_nonce == 1,
                "ordinary approval first-use raw membership is not zero");
        } else {
            ensure!(current.public_key == self.public_key_hash && current.qfhash::<PsyHasher>() == proof.value,
                "ordinary approval current materialized identity changed");
        }
        Ok(())
    }
}

impl SessionBinding {
    pub fn report(&self) -> Value {
        json!({"userId":self.user_id,"publicKeyHash":self.public_key_hash.to_string(),
            "startUserLeafHash":self.start_user_leaf_hash.to_string(),"nextNonce":self.next_nonce.to_string(),
            "isNewUser":self.is_new_user,"startContextLeafHash":self.start_context_leaf_hash.to_string()})
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn public() -> QHashOut<F> { QHashOut::from_values(1,2,3,4) }
    fn leaf() -> PsyUserLeaf<F> { get_new_empty_user_leaf(F::from_canonical_u64(123), public()) }
    fn input(start: QHashOut<F>, n: &str) -> Value {
        json!({"approvedActor":{"userId":123,"publicKeyHash":public().to_string(),
            "startUserLeafHash":start.to_string(),"nextNonce":n}})
    }
    #[test]
    fn strict_optional_schema_and_requirement_flag() -> Result<()> {
        assert!(parse(&json!({}), false)?.is_none()); assert!(parse(&json!({}), true).is_err());
        assert!(parse(&json!({"approvedActor":null}), false).is_err());
        assert!(!required_flag(None)?); assert!(required_flag(Some("1"))?);
        assert!(!required_flag(Some("0"))?); assert!(required_flag(Some("true")).is_err());
        let mut bad=input(QHashOut::ZERO,"1");bad["approvedActor"]["isNewUser"]=json!(true);
        assert!(parse(&bad,true).is_err());
        for user in [0,16777216] {let mut bad=input(QHashOut::ZERO,"1");bad["approvedActor"]["userId"]=json!(user);assert!(parse(&bad,true).is_err());}
        Ok(())
    }
    #[test]
    fn canonical_hashes_and_full_u64_nonces() -> Result<()> {
        let good=input(QHashOut::ZERO,"1");assert!(parse(&good,true)?.is_some());
        for bad in [json!(""),json!("01"),json!("+1"),json!("1.0"),json!("18446744073709551616"),
            json!("18446744069414584321"),json!(0),json!(-1),json!(1.5),json!(true)] {
            let mut v=good.clone();v["approvedActor"]["nextNonce"]=bad;assert!(parse(&v,true).is_err());
        }
        let mut v=good.clone();v["approvedActor"]["nextNonce"]=json!("18446744069414584320");assert!(parse(&v,true)?.is_some());
        v["approvedActor"]["nextNonce"]=json!(9007199254740993u64);assert!(parse(&v,true)?.is_some());
        for bad in ["0".repeat(64),"a".repeat(63),"A".repeat(64),"f".repeat(64)] {
            let mut v=good.clone();v["approvedActor"]["publicKeyHash"]=json!(bad);assert!(parse(&v,true).is_err());
        }
        Ok(())
    }
    #[test]
    fn first_ups_requires_actual_sdk_registration_leaf() -> Result<()> {
        let start=leaf();let actor=parse(&input(QHashOut::ZERO,"1"),true)?.unwrap();
        let binding=actor.bind_session(&start,123,1,true)?;
        assert_eq!(binding.report()["startUserLeafHash"],"0".repeat(64));
        assert!(actor.bind_session(&start,123,1,false).is_err());
        let mut changed=start;changed.balance=F::ONE;assert!(actor.bind_session(&changed,123,1,true).is_err());
        let mut changed=start;changed.user_state_tree_root=QHashOut::ZERO;assert!(actor.bind_session(&changed,123,1,true).is_err());
        let virtual_approval=parse(&input(start.qfhash::<PsyHasher>(),"1"),true)?.unwrap();
        assert!(virtual_approval.bind_session(&start,123,1,true).is_err());
        Ok(())
    }
    #[test]
    fn materialized_start_and_session_substitutions_reject() -> Result<()> {
        let mut start=leaf();start.nonce=F::from_canonical_u64(9);
        let actor=parse(&input(start.qfhash::<PsyHasher>(),"10"),true)?.unwrap();
        actor.bind_session(&start,123,10,false)?;
        assert!(actor.bind_session(&start,124,10,false).is_err());
        assert!(actor.bind_session(&start,123,11,false).is_err());
        assert!(actor.bind_session(&start,123,10,true).is_err());
        let mut changed=start;changed.public_key=QHashOut::from_values(2,3,4,5);assert!(actor.bind_session(&changed,123,10,false).is_err());
        let mut changed=start;changed.nonce=F::from_canonical_u64(8);assert!(actor.bind_session(&changed,123,10,false).is_err());
        let mut changed=start;changed.balance=F::ONE;assert!(actor.bind_session(&changed,123,10,false).is_err());
        Ok(())
    }
    #[test]
    fn final_endpoints_must_match_approved_actor_and_start() -> Result<()> {
        for first in [false,true] {
            let mut start=leaf();if !first {start.nonce=F::from_canonical_u64(4);}
            let n=if first{1}else{5};let hash=if first{QHashOut::ZERO}else{start.qfhash::<PsyHasher>()};
            let actor=parse(&input(hash,&n.to_string()),true)?.unwrap();let binding=actor.bind_session(&start,123,n,first)?;
            let mut core=SubmitUserEndCapNonProofCoreInput::<F>::default();core.new_user_leaf=start;
            core.new_user_leaf.nonce=F::from_canonical_u64(n);core.state_transition.user_id=F::from_canonical_u64(123);
            core.state_transition.start_user_leaf_hash=hash;core.state_transition.end_user_leaf_hash=core.new_user_leaf.qfhash::<PsyHasher>();
            actor.check_endpoints(&core,&binding)?;
            let mut bad=core;bad.new_user_leaf.nonce+=F::ONE;assert!(actor.check_endpoints(&bad,&binding).is_err());
            let mut bad=core;bad.new_user_leaf.public_key=QHashOut::ZERO;assert!(actor.check_endpoints(&bad,&binding).is_err());
            let mut bad=core;bad.state_transition.user_id=F::from_canonical_u64(124);assert!(actor.check_endpoints(&bad,&binding).is_err());
            let mut bad=core;bad.state_transition.start_user_leaf_hash=QHashOut::from_values(5,6,7,8);assert!(actor.check_endpoints(&bad,&binding).is_err());
            let mut bad=core;bad.state_transition.end_user_leaf_hash=QHashOut::ZERO;assert!(actor.check_endpoints(&bad,&binding).is_err());
        }
        Ok(())
    }
    #[test]
    fn successful_same_checkpoint_nonce_and_raw_membership_are_mandatory() -> Result<()> {
        for first in [false,true] {
            let mut start=leaf();if !first {start.nonce=F::from_canonical_u64(4);}
            let n=if first{1}else{5};let hash=if first{QHashOut::ZERO}else{start.qfhash::<PsyHasher>()};
            let actor=parse(&input(hash,&n.to_string()),true)?.unwrap();let binding=actor.bind_session(&start,123,n,first)?;
            let proof=MerkleProofCore::new_from_params::<PsyHasher>(123,hash,
                vec![QHashOut::ZERO;psy_config::network_constants::GLOBAL_USER_TREE_HEIGHT as usize]);
            // The absent-user RPC preimage is not registration authority.
            // Only its successful user/nonce observation is used for first use;
            // actual registration authority came from the SDK session proof.
            let mut current=start;if first {current.public_key=QHashOut::ZERO;}
            actor.check_fresh_state(&current,&proof,proof.root,&binding)?;
            let mut changed=current;changed.nonce+=F::ONE;
            assert!(actor.check_fresh_state(&changed,&proof,proof.root,&binding).is_err(),
                "SDK Submittable fallback must not override a changed successful nonce read");
            let mut changed=current;changed.user_id+=F::ONE;
            assert!(actor.check_fresh_state(&changed,&proof,proof.root,&binding).is_err());
            let mut changed=proof.clone();changed.index+=1;
            assert!(actor.check_fresh_state(&current,&changed,proof.root,&binding).is_err());
            let mut changed=proof.clone();changed.siblings.pop();
            assert!(actor.check_fresh_state(&current,&changed,proof.root,&binding).is_err());
            assert!(actor.check_fresh_state(&current,&proof,QHashOut::ZERO,&binding).is_err());
            let changed=MerkleProofCore::new_from_params::<PsyHasher>(123,QHashOut::from_values(9,8,7,6),proof.siblings.clone());
            assert!(actor.check_fresh_state(&current,&changed,changed.root,&binding).is_err());
            if !first {let mut changed=current;changed.public_key=QHashOut::ZERO;
                assert!(actor.check_fresh_state(&changed,&proof,proof.root,&binding).is_err());}
        }
        Ok(())
    }
}
