//! Preserve the exact public wire acknowledgement, including RPC errors.
//! Some realms acknowledge with "ok", not a transaction hash. Neither is inclusion.
use anyhow::{ensure, Result};
use plonky2::{field::goldilocks_field::GoldilocksField as F, field::types::PrimeField64};
use psy_provider::request::QSubmitEndCapRPCRequest;
use serde_json::{json, Value};
use std::{fs, io::Write, path::Path, time::Duration, sync::OnceLock};

struct SubmissionTransport { client: reqwest::Client, timeout_seconds: u64 }
static TRANSPORT: OnceLock<std::result::Result<SubmissionTransport, String>> = OnceLock::new();
fn timeout_seconds(text: &str) -> Result<u64> {
    match text { "30" => Ok(30), "120" => Ok(120), _ => anyhow::bail!("explicit submission acknowledgement timeout must be 30 or 120 seconds") }
}
fn transport() -> Result<(&'static SubmissionTransport, bool)> {
    let seconds = timeout_seconds(&std::env::var("PSY_RPC_ACK_TIMEOUT_SECONDS").unwrap_or_else(|_| "120".into()))?;
    let initialized_before_call = TRANSPORT.get().is_some();
    let t = TRANSPORT.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .connect_timeout(Duration::from_secs(10))
            .pool_max_idle_per_host(1)
            .timeout(Duration::from_secs(seconds))
            .build().map(|client| SubmissionTransport { client, timeout_seconds: seconds }).map_err(|e|e.to_string())
    }).as_ref().map_err(|e|anyhow::anyhow!("submission transport initialization failed: {e}"))?;
    ensure!(t.timeout_seconds == seconds, "submission transport configuration changed; explicit process restart required");
    Ok((t, initialized_before_call))
}

fn save(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    fs::File::open(
        path.parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new(".")),
    )?
    .sync_all()?;
    Ok(())
}
fn acknowledgement(status: u16, bytes: &[u8]) -> Result<Value> {
    ensure!(
        (200..300).contains(&status),
        "HTTP acknowledgement unknown; inspect preserved response"
    );
    let v: Value = serde_json::from_slice(bytes)?;
    ensure!(
        v["jsonrpc"] == "2.0" && v["id"] == 1,
        "unexpected RPC envelope; outcome unknown"
    );
    ensure!(
        v.get("error").is_none(),
        "RPC returned error; inspect preserved response and reconcile"
    );
    let result = v["result"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("unknown RPC acknowledgement"))?;
    ensure!(
        result == "ok" || (result.len() == 64 && result.bytes().all(|c| c.is_ascii_hexdigit())),
        "unrecognized RPC acknowledgement"
    );
    Ok(json!({"submitted":true,"included":false,"rpcResult":result,"reconciliationRequired":true}))
}
pub async fn submit(
    net: &psy_config::NetworkConfigGoldilocks,
    request: QSubmitEndCapRPCRequest<F>,
    out: &Path,
) -> Result<Value> {
    crate::live_guard::require_staging(net)?;
    let user = request
        .user_ec_input
        .core
        .new_user_leaf
        .user_id
        .to_canonical_u64();
    ensure!(user > 0 && user < 16777216, "submission user range");
    let realm = net
        .realm_configs
        .iter()
        .find(|r| r.id == user / net.users_per_realm)
        .ok_or_else(|| anyhow::anyhow!("submission realm missing"))?;
    let url = &realm.rpc_url[0];
    let body = serde_json::to_vec(
        &json!({"jsonrpc":"2.0","id":1,"method":"psy_submit_user_end_cap","params":request}),
    )?;
    save(&out.join("rpc-request.json"), &body)?;
    // The client caches only TLS/connection resources, never request bodies,
    // results, witness or nonce. URL/domain guards above run on EVERY send.
    // Disable protocol nack retries too: one explicit HTTP transmission.
    let (t, initialized_before_call) = transport()?;
    save(&out.join("rpc-transport.json"), &serde_json::to_vec_pretty(&json!({
        "url":url,"ackTimeoutSeconds":t.timeout_seconds,"connectTimeoutSeconds":10,
        "redirectsAllowed":false,"automaticRetry":false,"clientInitializedBeforeCall":initialized_before_call,
        "physicalConnectionReuseMeasured":false,
        "scope":"one process-local HTTP client; response and transaction state are never cached"
    }))?)?;
    let mut response = t.client
        .post(url)
        .header("content-type", "application/json")
        .body(body)
        .send()
        .await?;
    let status = response.status().as_u16();
    let mut bytes = Vec::new();
    let mut truncated = false;
    while let Some(chunk) = response.chunk().await? {
        let remaining = 65536usize.saturating_sub(bytes.len());
        if chunk.len() > remaining {
            bytes.extend_from_slice(&chunk[..remaining]);
            truncated = true;
            break;
        }
        bytes.extend_from_slice(&chunk);
    }
    save(&out.join("rpc-response.body"), &bytes)?;
    save(
        &out.join("rpc-response-meta.json"),
        &serde_json::to_vec_pretty(
            &json!({"url":url,"httpStatus":status,"truncated":truncated,"automaticRetry":false,"ackTimeoutSeconds":t.timeout_seconds}),
        )?,
    )?;
    ensure!(
        !truncated,
        "oversized RPC response preserved partially; outcome unknown"
    );
    acknowledgement(status, &bytes)
}

fn registration_body(request:&psy_provider::request::QRegisterUserRPCRequest<F>)->Result<Vec<u8>>{
    Ok(serde_json::to_vec(&json!({"jsonrpc":"2.0","id":1,"method":"psy_register_user","params":request}))?)
}
/// A separate once-only registration transport. The frozen SDK's default HTTP
/// client allows redirects; an unknown registration must never be redirected
/// or automatically transmitted again by that client.
pub async fn register(net:&psy_config::NetworkConfigGoldilocks,request:psy_provider::request::QRegisterUserRPCRequest<F>,out:&Path)->Result<Value>{
    crate::live_guard::require_staging(net)?;
    let url=net.coordinator_configs.first().and_then(|c|c.rpc_url.first()).ok_or_else(||anyhow::anyhow!("registration coordinator missing"))?;
    let body=registration_body(&request)?;save(&out.join("rpc-request.json"),&body)?;
    let(t,reused)=transport()?;
    save(&out.join("rpc-transport.json"),&serde_json::to_vec(&json!({"url":url,"automaticRetry":false,"redirectsAllowed":false,"ackTimeoutSeconds":t.timeout_seconds,"clientInitializedBeforeCall":reused}))?)?;
    let mut response=t.client.post(url).header("content-type","application/json").body(body).send().await?;
    let status=response.status().as_u16();let mut bytes=vec![];let mut truncated=false;
    while let Some(chunk)=response.chunk().await?{let left=65536usize.saturating_sub(bytes.len());if chunk.len()>left{bytes.extend_from_slice(&chunk[..left]);truncated=true;break;}bytes.extend_from_slice(&chunk);}
    save(&out.join("rpc-response.body"),&bytes)?;save(&out.join("rpc-response-meta.json"),&serde_json::to_vec(&json!({"httpStatus":status,"truncated":truncated,"automaticRetry":false,"redirectsAllowed":false}))?)?;
    ensure!(!truncated&&(200..300).contains(&status),"registration outcome unknown; inspect original response, never retry");
    let value:Value=serde_json::from_slice(&bytes)?;
    ensure!(value["jsonrpc"]=="2.0"&&value["id"]==1&&value.get("error").is_none(),"registration RPC outcome unknown");
    let ack=value["result"].as_str().ok_or_else(||anyhow::anyhow!("registration acknowledgement missing"))?;
    ensure!(!ack.is_empty()&&ack.len()<=256,"registration acknowledgement unknown");
    Ok(json!({"rpcResult":ack,"submitted":true,"included":false,"reconciliationRequired":true}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registration_wire_matches_the_frozen_sdk_without_default_client_redirects(){
        let q="0".repeat(64);
        let request:psy_provider::request::QRegisterUserRPCRequest<F>=serde_json::from_value(json!({"public_key":{"public_key_param":q,"fingerprint":q}})).unwrap();
        let body:Value=serde_json::from_slice(&registration_body(&request).unwrap()).unwrap();
        let sdk=serde_json::to_value(psy_provider::request::RequestParams::RegisterUser(request)).unwrap();
        assert_eq!(body["method"],sdk["method"]);assert_eq!(body["params"],sdk["params"]);assert_eq!(body["id"],1);assert_eq!(body["jsonrpc"],"2.0");
    }
    #[test]
    fn submission_wait_budget_is_explicit_bounded_and_not_a_retry_policy() {
        assert_eq!(timeout_seconds("30").unwrap(),30);assert_eq!(timeout_seconds("120").unwrap(),120);
        for value in ["0","auto","unlimited","121","3600",""] { assert!(timeout_seconds(value).is_err()); }
    }
    #[tokio::test]
    async fn submission_client_resources_are_reused_without_sending_a_request() -> Result<()> {
        let (a, _) = transport()?; let (b, initialized) = transport()?;
        assert!(std::ptr::eq(a,b)); assert!(initialized);
        Ok(())
    }
    #[test]
    fn ack_is_not_inclusion_and_ambiguous_responses_do_not_authorize_retry() {
        for result in ["ok".to_string(), "a".repeat(64)] {
            let value = acknowledgement(
                200,
                &serde_json::to_vec(&json!({"jsonrpc":"2.0","id":1,"result":result})).unwrap(),
            )
            .unwrap();
            assert_eq!(value["included"], false);
            assert_eq!(value["reconciliationRequired"], true);
        }
        for body in [
            json!({"jsonrpc":"2.0","id":2,"result":"ok"}),
            json!({"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"already submitted"}}),
            json!({"jsonrpc":"2.0","id":1,"result":"unknown"}),
            json!({"jsonrpc":"2.0","id":1,"result":true}),
        ] {
            assert!(acknowledgement(200, &serde_json::to_vec(&body).unwrap()).is_err());
        }
        assert!(acknowledgement(502, b"proxy error").is_err());
        assert!(acknowledgement(200, b"broken JSON").is_err());
    }
}
