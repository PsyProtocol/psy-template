//! Typed public startup diagnostics. Never serialize SDK error text or witnesses.
use anyhow::Error;
use serde::Serialize;
use serde_json::{json,Value};

#[derive(Clone,Copy)]
pub enum Subphase { AddUser, StartSession, BindApproval, InspectReset, InspectFreshState }
impl Subphase {
    pub fn name(self)->&'static str { match self {
        Self::AddUser=>"add-ordinary-session-user", Self::StartSession=>"start-ordinary-session",
        Self::BindApproval=>"bind-approved-ordinary-session", Self::InspectReset=>"inspect-reset-ordinary-session",
        Self::InspectFreshState=>"inspect-fresh-ordinary-session",
    }}
}
/// Only these public header/LPS fields can cross the diagnostic boundary.
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct PublicSession {
    pub checkpoint_id:u64, pub user_id:u64, pub next_nonce:String, pub is_new_user:bool,
    pub start_context_leaf_hash:String, pub public_key_hash:String, pub start_user_nonce:String,
}
fn approval_code(reason:&str)->Option<&'static str>{Some(match reason {
    "ordinary approval actual SDK manager missing"=>"APPROVAL_SESSION_MANAGER_MISSING",
    "ordinary approval session user changed"=>"APPROVAL_SESSION_USER_MISMATCH",
    "ordinary approval session public key changed"=>"APPROVAL_SESSION_KEY_MISMATCH",
    "ordinary approval session nonce changed"=>"APPROVAL_SESSION_NONCE_MISMATCH",
    "ordinary approval first UPS requires exact zero start and nonce one"=>"APPROVAL_SESSION_FIRST_USE_MISMATCH",
    "ordinary approval SDK registration start leaf differs"=>"APPROVAL_SESSION_REGISTRATION_LEAF_MISMATCH",
    "ordinary approval materialized start nonce differs"=>"APPROVAL_SESSION_START_NONCE_MISMATCH",
    "ordinary approval session start leaf changed"=>"APPROVAL_SESSION_START_HASH_MISMATCH",
    "ordinary approval successful current user/nonce read differs"=>"APPROVAL_CURRENT_USER_NONCE_MISMATCH",
    "ordinary approval current raw membership differs"=>"APPROVAL_CURRENT_MEMBERSHIP_MISMATCH",
    "ordinary approval current raw start leaf changed"=>"APPROVAL_CURRENT_START_HASH_MISMATCH",
    "ordinary approval current materialized identity changed"=>"APPROVAL_CURRENT_IDENTITY_MISMATCH",
    "session inspection original transport window expired"=>"INSPECTION_TRANSPORT_WINDOW_EXPIRED",
    _=>return None,
})}
pub fn project(error:&Error,subphase:Subphase,actual:Option<PublicSession>)->Value{
    let category=error.chain().find_map(|cause|approval_code(&cause.to_string()))
        .map(|code|json!({"reasonCode":code}))
        .unwrap_or_else(||super::ordinary_diagnostics::classify(error,&[]));
    json!({"mode":"public-sdk-startup-error-projection-v1","subphase":subphase.name(),"category":category,
        "actualSdkSession":actual,"privateDataSuppressed":true,"beforeBusinessCalls":true,
        "signed":false,"broadcast":false,"automaticRetry":false})
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn approval_and_checkpoint_categories_are_static_without_secret_text(){
        let error=anyhow::anyhow!("ordinary approval session nonce changed").context("private signing witness must not escape");
        let report=project(&error,Subphase::BindApproval,None);
        assert_eq!(report["category"]["reasonCode"],"APPROVAL_SESSION_NONCE_MISMATCH");
        assert!(!report.to_string().contains("private signing witness"));
        let error=anyhow::anyhow!("User tree proof not found for checkpoint_id 150012");
        let report=project(&error,Subphase::AddUser,None);
        assert_eq!(report["category"]["reasonCode"],"SDK_CHECKPOINT_PROOF_NOT_READY");
        assert_eq!(report["category"]["checkpointId"],150012);
        let report=project(&anyhow::anyhow!("privateKey=do-not-print"),Subphase::StartSession,None);
        assert_eq!(report["category"]["reasonCode"],"SDK_UNKNOWN_REVIEW_REQUIRED");assert!(!report.to_string().contains("do-not-print"));
    }
    #[test]
    fn session_projection_has_only_reviewed_public_fields(){
        let value=serde_json::to_value(PublicSession{checkpoint_id:150012,user_id:1975680,next_nonce:"4".into(),is_new_user:false,
            start_context_leaf_hash:"1".repeat(64),public_key_hash:"2".repeat(64),start_user_nonce:"3".into()}).unwrap();
        let mut keys=value.as_object().unwrap().keys().map(String::as_str).collect::<Vec<_>>();keys.sort_unstable();
        assert_eq!(keys,vec!["checkpointId","isNewUser","nextNonce","publicKeyHash","startContextLeafHash","startUserNonce","userId"]);
        for sub in [Subphase::AddUser,Subphase::StartSession,Subphase::BindApproval,Subphase::InspectReset,Subphase::InspectFreshState]{
            let r=project(&anyhow::anyhow!("unknown"),sub,None);assert_eq!(r["broadcast"],false);assert_eq!(r["signed"],false);assert_eq!(r["automaticRetry"],false);
        }
    }
}
