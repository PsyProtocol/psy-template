//! Test-only restoration of an exact reviewed public proof prefix. No signing,
//! proving, RPC or arbitrary account-state import is performed by this module.
use super::*;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

pub(super) struct Prefix { root: PathBuf, manifest: Value }
impl Prefix {
    pub(super) fn load() -> Result<Option<Self>> {
        let Ok(path) = std::env::var("BOOK_REACHABLE_PREFIX") else { return Ok(None) };
        let raw = fs::read(&path)?;
        ensure!(format!("{:x}",Sha256::digest(&raw)) == std::env::var("BOOK_REACHABLE_PREFIX_SHA256")?,
            "explicit immutable test-prefix manifest");
        let manifest: Value = serde_json::from_slice(&raw)?;
        ensure!(manifest["schema"] == 1 && manifest["sdkCommit"] == "01b8f2b0a077367a7b9879baba1a72aea8ab5510"
            && manifest["producerSha256"] == "dcf8c1ef248454f38a70a705affd8f7ddad5673cdae3ac0ec0f2bde4346f6650"
            && manifest["stages"].as_object().context("prefix stages")?.len() == 3,
            "only the accepted three-stage synthetic prefix may be restored");
        Ok(Some(Self { root: Path::new(&path).parent().context("prefix directory")?.to_path_buf(), manifest }))
    }
    fn file(&self, stage: &str, name: &str) -> Result<Vec<u8>> {
        let entry = &self.manifest["stages"][stage];
        let folder = entry["directory"].as_str().context("prefix stage path")?;
        ensure!(!Path::new(folder).is_absolute() && Path::new(folder).components().all(|p|matches!(p,std::path::Component::Normal(_))), "relative owned prefix path");
        let raw = fs::read(self.root.join(folder).join(name))?;
        ensure!(format!("{:x}",Sha256::digest(&raw)) == entry["files"][name].as_str().context("pinned public prefix member")?, "prefix bytes changed");
        Ok(raw)
    }
    fn value(&self, stage: &str, name: &str) -> Result<Value> { Ok(serde_json::from_slice(&self.file(stage,name)?)?) }
    fn copy(&self, stage: &str, out: &str) -> Result<()> {
        let folder=Path::new(out).join(stage);fs::create_dir(&folder)?;
        for name in self.manifest["stages"][stage]["files"].as_object().context("prefix files")?.keys() {
            ensure!(["request.json","verification.json","plan.json","source.json","current.json","intent.json","public-session.json","key-proof.bin"].contains(&name.as_str()), "explicit public prefix fields only");
            fs::write(folder.join(name),self.file(stage,name)?)?;
        }
        Ok(())
    }
    async fn request(&self, stage: &str, chain: &StreamChain, w: &World, user: u64) -> Result<(psy_provider::request::QSubmitEndCapRPCRequest<GF>, Store)> {
        let request: psy_provider::request::QSubmitEndCapRPCRequest<GF> = serde_json::from_slice(&self.file(stage,"request.json")?)?;
        let proof: plonky2::plonk::proof::ProofWithPublicInputs<GF,C,2> = bincode::deserialize(&request.proof)?;
        psy_template_u124_markets::fixed_verifier::with_verifier(|v|{v.verify(proof.clone())?;Ok(())})?;
        let c=&request.user_ec_input.core;validate_endcap_binding(c,&proof.public_inputs)?;
        let db=chain.base.seed_identity_with_history(w,chain.key.g.get_fingerprint(),&[(1,anchor_leaf())]).await?;
        let start=db.get_user_leaf_data(w.checkpoint,user).await?;
        ensure!(c.checkpoint_id==f(w.checkpoint)&&c.new_user_leaf.user_id==f(user)
            &&c.new_user_leaf.public_key==start.public_key&&c.new_user_leaf.nonce==start.nonce+GF::ONE
            &&c.state_transition.start_user_leaf_hash==if user==V&&w.revision==0 {Q::ZERO}else{start.qfhash::<PoseidonHash>()}, "exact prefix identity/start/nonce/checkpoint");
        Ok((request,db))
    }
    pub(super) async fn ordinary(&self, chain: &mut StreamChain, w: &mut World, user: u64, mut calls: Vec<Value>, out: &str, stage: &str) -> Result<u64> {
        ensure!(["owner-initial-authorization","issuer-exact-activation-seeds"].contains(&stage),"only original pre-bootstrap ordinary stages");
        let (request,db)=self.request(stage,chain,w,user).await?;let c=&request.user_ec_input.core;
        let report=self.value(stage,"verification.json")?;let fee=report["fee"].as_u64().context("prefix exact fee")?;
        ensure!(fee==GUTA_FEE+DA_FEE*c.stats.slots_modified.to_canonical_u64()&&fee<=1_000_100_000,"prefix exact bounded fee");
        calls.push(json!({"contract_id":0,"method_name":"burn","inputs":[fee]}));
        ensure!(report["calls"]==json!(calls)&&report["actualApprovedStackVerified"]==true
            &&report["ordinarySignatureVerified"]==true&&report["fullUpsVerified"]==true
            &&report["broadcast"]==false,"original producer-approved exact ordinary calls");
        let mut expected=w.clone();
        for call in calls {
            expected.run_traced_at(user,call["contract_id"].as_u64().unwrap(),call["method_name"].as_str().unwrap(),
                &call["inputs"].as_array().unwrap().iter().map(|x|x.as_u64().unwrap()).collect::<Vec<_>>(),c.new_user_leaf.nonce.to_canonical_u64())?;
        }
        chain.base.actor_leaves.insert(user,c.new_user_leaf);
        chain.base.seed_identity(&expected,chain.key.g.get_fingerprint()).await?;
        chain.base.retained_history.insert(w.checkpoint,db.get_checkpoint_leaf_data(w.checkpoint).await?);
        expected.checkpoint+=1;*w=expected;self.copy(stage,out)?;Ok(fee)
    }
    pub(super) async fn bootstrap(&self, chain: &mut StreamChain, w: &mut World, expected: Request, out: &str) -> Result<()> {
        let stage="orderbook-reachable-book-bootstrap";
        let plan: Request=serde_json::from_value(self.value(stage,"plan.json")?)?;
        ensure!(serde_json::to_value(&plan)?==serde_json::to_value(minimum_exact_fee(w,&chain.spec,expected)?)?,"unchanged complete bootstrap plan");
        let (request,db)=self.request(stage,chain,w,V).await?;
        let public=self.value(stage,"public-session.json")?;
        let signature:plonky2::plonk::proof::ProofWithPublicInputs<GF,C,2>=bincode::deserialize(&self.file(stage,"key-proof.bin")?)?;
        chain.key.g.minifier_chain.as_ref().unwrap().verify(signature.clone())?;
        let sig:Q<GF>=serde_json::from_value(public["sigHash"].clone())?;
        let source:Snapshot=serde_json::from_value(self.value(stage,"source.json")?)?;
        ensure!(signature.public_inputs==PoseidonHash::two_to_one(sig.0,source.key_public_param.0).elements
            &&public["keyFingerprint"]==json!(chain.key.g.get_fingerprint())
            &&public["actualCalls"]==json!(stream_policy::calls(&chain.spec,&plan,true)?),"original exact key proof and financial stack");
        let context:SDKeySessionContext=serde_json::from_value(public["session"].clone())?;
        let current:CurrentOpening=serde_json::from_value(self.value(stage,"current.json")?)?;
        ensure!(current.checkpoint==db.get_checkpoint_leaf_data(w.checkpoint).await?
            &&current.roots==db.get_checkpoint_global_state_roots(w.checkpoint).await?,"restored original checkpoint and full dependency state");
        let inactive=SourcePage::inactive_maintenance(&chain.review,&source)?.1.rows[0].original.clone();
        // The public key witness carries all 40 logical slots. The SDK executes
        // only the compact stack; preserve both representations and validate
        // their exact mapping instead of treating padding as executed calls.
        let logical:Vec<psy_client_data::dpn::sd_key::SDKeyTransactionInfo<GF>>=serde_json::from_value(public["stack"].clone())?;
        let actual=logical.iter().filter(|info|info.contract_id!=f(chain.review.market)
            ||info.method_id!=f(chain.spec["noop"]["method_id"].as_u64().unwrap())).copied().collect::<Vec<_>>();
        let checked=psy_template_u124_markets::stream_execution::bind_session(&chain.key,&chain.spec,&chain.review,&source,
            &inactive,&current,&plan,context.clone(),&actual,
            serde_json::from_value(public["txStackHash"].clone())?,serde_json::from_value(public["txCount"].clone())?,f(w.checkpoint))?;
        ensure!(checked.transaction_infos==logical,"exact saved logical policy slots and compact execution mapping");
        let mut end=context.current_user_leaf;end.nonce=context.nonce;
        use psy_client_data::qdata::{ups_signature::PsyUserProvingSessionSignatureDataCompact,user_contract_state::SignContext};
        let action=PsyUserProvingSessionSignatureDataCompact {start_user_leaf_hash:context.start_user_leaf_hash,
            end_user_leaf_hash:end.qfhash::<PoseidonHash>(),checkpoint_leaf_hash:context.checkpoint_leaf_hash,
            tx_stack_hash:serde_json::from_value(public["txStackHash"].clone())?,tx_count:serde_json::from_value(public["txCount"].clone())?}
            .get_sig_action_for_user::<PoseidonHash>(PSY_NETWORK_MAGIC,f(V),context.nonce,SignContext {checkpoint_tree_root:context.checkpoint_tree_root,user_leaf:context.current_user_leaf}).get_qhash::<PoseidonHash>();
        ensure!(action==sig&&end==request.user_ec_input.core.new_user_leaf,"exact saved key/session signature preimage");
        let mut next=w.clone();execute(&mut next,&chain.spec,&plan)?;
        chain.base.last_leaf=Some(request.user_ec_input.core.new_user_leaf);
        chain.base.seed_identity(&next,chain.key.g.get_fingerprint()).await?;
        chain.base.retained_history.insert(w.checkpoint,db.get_checkpoint_leaf_data(w.checkpoint).await?);
        next.checkpoint+=1;*w=next;
        chain.measurements.push(self.value(stage,"verification.json")?);self.copy(stage,out)?;Ok(())
    }
}
