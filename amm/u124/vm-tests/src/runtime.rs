//! Contain an SDK unwind by discarding the failed future/session. Never resume it.
use futures_util::FutureExt;
use serde_json::{json, Value};
use std::{future::Future, panic::AssertUnwindSafe};

#[derive(Debug)]
pub enum Failure {
    Rejected(anyhow::Error),
    Panic(&'static str),
}

pub async fn contain<T>(future: impl Future<Output = anyhow::Result<T>>) -> Result<T, Failure> {
    match AssertUnwindSafe(future).catch_unwind().await {
        Ok(result) => result.map_err(Failure::Rejected),
        Err(payload) => {
            let text = payload
                .downcast_ref::<String>()
                .map(String::as_str)
                .or_else(|| payload.downcast_ref::<&str>().copied())
                .unwrap_or("");
            let code = if text.contains("SplitBits: target bits must be less than num_bits") {
                "invalid_amount_range"
            } else {
                "sdk_runtime_panic"
            };
            Err(Failure::Panic(code))
        }
    }
}

#[derive(Default)]
pub struct Progress {
    pub broadcast_attempted: bool,
    pub end_user_leaf_hash: Option<String>,
    pub user_id: Option<u64>,
    pub nonce: Option<u64>,
}
impl Progress {
    pub fn failure(&self, failure: &Failure) -> Value {
        let (code, reason) = match failure {
            Failure::Panic(code) => (
                *code,
                "SDK execution aborted; discard session and correct/rebuild the request".to_owned(),
            ),
            Failure::Rejected(error) => ("request_failed", error.to_string()),
        };
        json!({"ok":false,"error":code,"reason":reason,
            "submitted":if self.broadcast_attempted {Value::Null} else {json!(false)},
            "status":if self.broadcast_attempted {"submission_unknown"} else {"rejected_before_submission"},
            "broadcastAttempted":self.broadcast_attempted,
            "endUserLeafHash":self.end_user_leaf_hash,"userId":self.user_id,"nonce":self.nonce,
            "retryAllowed":false})
    }
}
